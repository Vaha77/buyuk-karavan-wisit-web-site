// VoiceLab (voicelab.uz — Aisha's new platform). Docs: https://docs.voicelab.uz (Quickstart, Text to Speech,
// Authentication, Errors). Authorization: Bearer VOICELAB_API_KEY (vlk_…).
//  • Catalog (not hard-coded, cached 10 min): GET /v1/tts/languages, GET /v1/voices?language=uz
//  • POST /v1/tts { text (≤5000), language, voice_id, speed 0.5–2 } + Idempotency-Key →
//      200 audio/wav (mono, 16-bit, 24 kHz) · 202 { id, status_url } → poll until "completed" → download the signed
//      audio_url WITHOUT the key
//  • 429 / 500 / 503 / timeout → the same request with the same Idempotency-Key (Retry-After honoured); 400 / 401 /
//    402 / 403 / 404 / 409 / 422 are not retried.
import { TtsProviderError, clampSpeed, key, rate, type Env, type TtsProvider, type TtsVoice } from "./types";

export const VOICELAB_ORIGIN = "https://api.voicelab.uz";
const BASE = `${VOICELAB_ORIGIN}/v1`;
const SPEED = { min: 0.5, max: 2 };
const CACHE_MS = 10 * 60_000;
/** Shown only while there is no key or the catalog is unreachable (the studio still lists the provider). */
const FALLBACK_LANGUAGES = ["uz", "ru", "en"];
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Timings, replaceable in tests. */
export const voicelabTiming = {
  sleep: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  requestTimeoutMs: 90_000,
  pollDeadlineMs: 150_000,
  attempts: 3,
};

type Cached<T> = { at: number; fingerprint: string; value: T };
const cache: { languages?: Cached<string[]>; voices: Map<string, Cached<TtsVoice[]>> } = { voices: new Map() };
export function clearVoicelabCache() { delete cache.languages; cache.voices.clear(); }
/** Changes when the key changes (never stores or prints the key itself). */
const fingerprint = (apiKey: string) => `${apiKey.length}:${apiKey.slice(-4)}`;
const fresh = <T>(entry: Cached<T> | undefined, apiKey: string) => entry && entry.fingerprint === fingerprint(apiKey) && Date.now() - entry.at < CACHE_MS ? entry.value : null;

const auth = (env: Env) => ({ Authorization: `Bearer ${key(env, "VOICELAB_API_KEY")}` });

/** "message (error.code)" from VoiceLab's error body { message, error: { code, fields }, request_id }. */
export async function voicelabError(response: Response) {
  const raw = await response.text().catch(() => "");
  try {
    const json = JSON.parse(raw) as { message?: unknown; error?: { code?: unknown; message?: unknown; fields?: Record<string, unknown> } };
    const message = typeof json.message === "string" ? json.message : typeof json.error?.message === "string" ? json.error.message : "";
    const fields = json.error?.fields && typeof json.error.fields === "object" ? Object.entries(json.error.fields).map(([name, value]) => `${name}: ${String(value)}`).join("; ") : "";
    const code = typeof json.error?.code === "string" ? json.error.code : "";
    const text = [message || code, fields].filter(Boolean).join(" — ");
    if (text) return { code, message: (code && message ? `${text} (${code})` : text).slice(0, 240) };
  } catch { /* not JSON */ }
  return { code: "", message: raw.replace(/\s+/g, " ").slice(0, 200) || `HTTP ${response.status}` };
}
const UZ_MESSAGES: Record<string, string> = {
  insufficient_credits: "VoiceLab: kredit yetarli emas — balansni to‘ldiring.",
  api_key_credit_limit: "VoiceLab: kalitning kredit limiti tugagan.",
  invalid_api_key: "VoiceLab: VOICELAB_API_KEY noto‘g‘ri yoki bekor qilingan.",
  insufficient_scope: "VoiceLab: kalitda ruxsat yo‘q (tts:write / voices:read) yoki IP cheklangan.",
  voice_unavailable: "VoiceLab: bu ovoz endi mavjud emas — katalogni yangilang.",
};

/** Seconds from Retry-After (number or HTTP date), capped; null when absent. */
export function retryAfterMs(response: Response, capMs = 30_000) {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) ? Math.min(capMs, Math.max(0, ms)) : null;
}

async function getJson<T>(url: string, env: Env, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url, { headers: auth(env), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) { const error = await voicelabError(response); throw new TtsProviderError("voicelab", response.status, UZ_MESSAGES[error.code] ?? error.message); }
  return await response.json() as T;
}

async function catalogLanguages(env: Env, fetcher: typeof fetch) {
  const apiKey = key(env, "VOICELAB_API_KEY");
  if (!apiKey) return FALLBACK_LANGUAGES;
  const hit = fresh(cache.languages, apiKey);
  if (hit) return hit;
  try {
    const json = await getJson<{ data?: Array<{ code?: unknown }>; models?: Array<{ languages?: unknown }> }>(`${BASE}/tts/languages`, env, fetcher);
    const codes = (json.data ?? []).map(item => typeof item.code === "string" ? item.code.toLowerCase() : "").filter(Boolean);
    const fromModels = (json.models ?? []).flatMap(model => Array.isArray(model.languages) ? model.languages.filter((code): code is string => typeof code === "string") : []);
    const languages = [...new Set(codes.length ? codes : fromModels)];
    if (!languages.length) return FALLBACK_LANGUAGES;
    cache.languages = { at: Date.now(), fingerprint: fingerprint(apiKey), value: languages };
    return languages;
  } catch { return FALLBACK_LANGUAGES; }
}

type CatalogVoice = { id?: unknown; display_name?: unknown; name?: unknown; short_description?: unknown; description?: unknown; language?: unknown; kind?: unknown; can_manage?: unknown };
async function catalogVoices(lang: string, env: Env, fetcher: typeof fetch): Promise<TtsVoice[]> {
  const apiKey = key(env, "VOICELAB_API_KEY");
  const hit = fresh(cache.voices.get(lang), apiKey);
  if (hit) return hit;
  const json = await getJson<{ data?: CatalogVoice[] }>(`${BASE}/voices?language=${encodeURIComponent(lang)}`, env, fetcher);
  const voices = (json.data ?? []).filter(voice => typeof voice.id === "string" && voice.id).map(voice => {
    const name = typeof voice.display_name === "string" && voice.display_name ? voice.display_name : typeof voice.name === "string" && voice.name ? voice.name : String(voice.id);
    const about = typeof voice.short_description === "string" && voice.short_description ? voice.short_description : typeof voice.description === "string" ? voice.description.slice(0, 80) : "";
    const own = voice.can_manage === true ? "o‘z ovoz" : "";
    return { id: voice.id as string, name, langs: [typeof voice.language === "string" && voice.language ? voice.language.toLowerCase() : lang], note: [own, about].filter(Boolean).join(" · ") || undefined } satisfies TtsVoice;
  });
  cache.voices.set(lang, { at: Date.now(), fingerprint: fingerprint(apiKey), value: voices });
  return voices;
}

const isTimeout = (error: unknown) => error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

/** 202: poll the generation (status_url) until completed, then download the signed audio_url without the key. */
async function waitForJob(job: { id?: unknown; status_url?: unknown }, env: Env, fetcher: typeof fetch, onUsage?: (usage: { credits: number }) => void): Promise<Uint8Array> {
  const path = typeof job.status_url === "string" && job.status_url ? job.status_url : typeof job.id === "string" ? `/v1/tts/generations/${encodeURIComponent(job.id)}` : null;
  if (!path) throw new TtsProviderError("voicelab", 502, "VoiceLab: 202 javobida status_url yo‘q.");
  const url = new URL(path, VOICELAB_ORIGIN);
  if (url.origin !== VOICELAB_ORIGIN) throw new TtsProviderError("voicelab", 502, "VoiceLab: status_url noto‘g‘ri.");
  const deadline = Date.now() + voicelabTiming.pollDeadlineMs;
  let wait = 1000;
  for (;;) {
    const response = await fetcher(url, { headers: auth(env), signal: AbortSignal.timeout(15_000) }).catch(error => { if (isTimeout(error)) return null; throw error; });
    if (response && !response.ok && !RETRYABLE.has(response.status)) { const error = await voicelabError(response); throw new TtsProviderError("voicelab", response.status, UZ_MESSAGES[error.code] ?? error.message); }
    if (response?.ok) {
      const generation = await response.json() as { status?: unknown; audio_url?: unknown; error?: unknown; credits_used?: unknown };
      if (generation.status === "completed") {
        const credits = Number(generation.credits_used);
        if (generation.credits_used !== undefined && generation.credits_used !== null && Number.isFinite(credits) && credits >= 0) onUsage?.({ credits });
        if (typeof generation.audio_url !== "string" || !/^https:\/\//.test(generation.audio_url)) throw new TtsProviderError("voicelab", 502, "VoiceLab: audio_url yo‘q.");
        const audio = await fetcher(generation.audio_url, { signal: AbortSignal.timeout(60_000) });
        if (!audio.ok) throw new TtsProviderError("voicelab", audio.status, `VoiceLab: audio yuklab bo‘lmadi (HTTP ${audio.status}).`);
        return new Uint8Array(await audio.arrayBuffer());
      }
      if (generation.status === "failed") {
        const detail = typeof generation.error === "string" ? generation.error : generation.error && typeof generation.error === "object" ? String((generation.error as { message?: unknown; code?: unknown }).message ?? (generation.error as { code?: unknown }).code ?? "") : "";
        throw new TtsProviderError("voicelab", 502, `VoiceLab: yasash muvaffaqiyatsiz${detail ? ` — ${detail.slice(0, 160)}` : ""}.`);
      }
    }
    if (Date.now() + wait > deadline) throw new TtsProviderError("voicelab", 504, "VoiceLab: navbatdagi ish vaqtida tugamadi.");
    await voicelabTiming.sleep((response && retryAfterMs(response, 5000)) ?? wait);
    wait = Math.min(5000, wait * 1.5);
  }
}

export const voicelabProvider: TtsProvider = {
  id: "voicelab",
  name: "VoiceLab",
  envKey: "VOICELAB_API_KEY",
  configured: env => !!key(env, "VOICELAB_API_KEY"),
  model: () => "lison",
  // The documented limit is 5000 characters (and a 64 KiB body); a little under it.
  maxChars: 4800,
  formats: ["wav"],
  speed: SPEED,
  languages: (env, fetcher = fetch) => catalogLanguages(env, fetcher),
  async voices(env, fetcher = fetch) {
    if (!key(env, "VOICELAB_API_KEY")) return [];
    const languages = await catalogLanguages(env, fetcher);
    const lists = await Promise.all(languages.map(lang => catalogVoices(lang, env, fetcher).catch(() => [] as TtsVoice[])));
    // One voice listed under several languages → one entry with all of them.
    const byId = new Map<string, TtsVoice>();
    for (const voice of lists.flat()) {
      const seen = byId.get(voice.id);
      if (seen && Array.isArray(seen.langs) && Array.isArray(voice.langs)) seen.langs = [...new Set([...seen.langs, ...voice.langs])];
      else if (!seen) byId.set(voice.id, { ...voice, langs: Array.isArray(voice.langs) ? [...voice.langs] : voice.langs });
    }
    return [...byId.values()];
  },
  async synthesize(input, env, fetcher = fetch) {
    if (!/^voice_[A-Za-z0-9_-]{1,120}$/.test(input.voice)) throw new TtsProviderError("voicelab", 400, "VoiceLab: voice_id noto‘g‘ri.");
    // One key per generation, reused for every retry of exactly this body.
    const idempotencyKey = `bk-tts-${crypto.randomUUID()}`;
    const body = JSON.stringify({ text: input.text, language: input.lang, voice_id: input.voice, speed: Math.round(clampSpeed(input.speed, SPEED) * 100) / 100 });
    let last: TtsProviderError | null = null;
    for (let attempt = 1; attempt <= voicelabTiming.attempts; attempt++) {
      let response: Response;
      try {
        response = await fetcher(`${BASE}/tts`, { method: "POST", headers: { ...auth(env), "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body, signal: AbortSignal.timeout(voicelabTiming.requestTimeoutMs) });
      } catch (error) {
        if (!isTimeout(error)) throw error;
        last = new TtsProviderError("voicelab", 504, "VoiceLab javob bermadi (timeout).");
        if (attempt < voicelabTiming.attempts) await voicelabTiming.sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      if (response.status === 200) {
        // Not documented for 200 (only X-VoiceLab-Characters-Used), but taken when VoiceLab sends it.
        const credits = Number(response.headers.get("x-voicelab-credits-used") ?? NaN);
        if (Number.isFinite(credits) && credits >= 0) input.onUsage?.({ credits });
        return new Uint8Array(await response.arrayBuffer());
      }
      if (response.status === 202) return waitForJob(await response.json().catch(() => ({})) as { id?: unknown; status_url?: unknown }, env, fetcher, input.onUsage);
      const error = await voicelabError(response);
      last = new TtsProviderError("voicelab", response.status, UZ_MESSAGES[error.code] ?? error.message);
      if (!RETRYABLE.has(response.status)) throw last;
      if (attempt < voicelabTiming.attempts) await voicelabTiming.sleep(retryAfterMs(response) ?? 1000 * 2 ** (attempt - 1));
    }
    throw last ?? new TtsProviderError("voicelab", 502, "VoiceLab: javob yo‘q.");
  },
  /** 1 credit per character; the credit price is not in the docs — VOICELAB_USD_PER_1K_CHARS (default ≈ 1 UZS / character). */
  costUsd: (chars, env) => Math.round(chars * rate(env, "VOICELAB_USD_PER_1K_CHARS", 0.08) / 1000 * 1e6) / 1e6,
};
