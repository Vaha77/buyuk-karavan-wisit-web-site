// Aisha (aisha.group) — Uzbek / Russian / English TTS. Docs: https://aisha.group/en/api-documentation/text-to-speech
// POST https://back.aisha.group/api/v1/tts/post/ (multipart form, X-Api-Key) → 201 { audio_path } → the WAV is downloaded.
// Uzbek: model "Gulnoza" with a mood (Neutral / Cheerful / Happy / Sad) and speed 0.5–2.0; en / ru: the default voice.
// Own cloned voices: AISHA_VOICE_IDS="Ism:123,Boshqa:456" (READY voice_id's of the account; Uzbek).
import { TtsProviderError, clampSpeed, errorMessage, key, rate, type Env, type TtsProvider, type TtsVoice } from "./types";

export const AISHA_BASE = "https://back.aisha.group";
const MOODS = ["Neutral", "Cheerful", "Happy", "Sad"] as const;
const MOOD_NAMES: Record<string, string> = { Neutral: "oddiy", Cheerful: "quvnoq", Happy: "xursand", Sad: "g‘amgin" };

/** "Ism:123,Boshqa:456" → custom voices (id "voice:123"). */
export function customVoices(env: Env): TtsVoice[] {
  return (env.AISHA_VOICE_IDS ?? "").split(",").map(item => item.trim()).filter(Boolean).flatMap(item => {
    const [name, id] = item.includes(":") ? [item.slice(0, item.lastIndexOf(":")).trim(), item.slice(item.lastIndexOf(":") + 1).trim()] : [`Ovoz ${item}`, item];
    return /^\d{1,10}$/.test(id) ? [{ id: `voice:${id}`, name: name || `Ovoz ${id}`, langs: ["uz"], note: "o‘z ovoz" }] : [];
  });
}

const VOICES: TtsVoice[] = [
  ...MOODS.map(mood => ({ id: mood === "Neutral" ? "gulnoza" : `gulnoza:${mood.toLowerCase()}`, name: `Gulnoza — ${MOOD_NAMES[mood]}`, langs: ["uz"], gender: "female" as const })),
  { id: "default", name: "Aisha (standart)", langs: ["ru", "en"], gender: "female" },
];

/** Absolute URL of the generated file ("/media/tts_audios/x.wav" or a full URL). */
export function audioUrl(path: string) {
  const url = new URL(path, AISHA_BASE);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new TtsProviderError("aisha", 502, "audio_path noto‘g‘ri");
  return url;
}

const SPEED = { min: 0.5, max: 2, langs: ["uz"] };

export const aishaProvider: TtsProvider = {
  id: "aisha",
  name: "Aisha",
  envKey: "AISHA_API_KEY",
  configured: env => !!key(env, "AISHA_API_KEY"),
  model: () => "Gulnoza",
  maxChars: 950,
  formats: ["wav"],
  speed: SPEED,
  languages: () => ["uz", "ru", "en"],
  voices: async env => [...VOICES, ...customVoices(env)],
  async synthesize(input, env, fetcher = fetch) {
    const apiKey = key(env, "AISHA_API_KEY");
    const form = new FormData();
    form.set("transcript", input.text);
    form.set("language", input.lang);
    if (input.lang === "uz") {
      form.set("speed", String(clampSpeed(input.speed, SPEED)));
      if (input.voice.startsWith("voice:")) form.set("voice_id", input.voice.slice(6));
      else {
        const mood = MOODS.find(item => input.voice === `gulnoza:${item.toLowerCase()}`) ?? "Neutral";
        form.set("model", "Gulnoza");
        form.set("mood", mood);
      }
    }
    const response = await fetcher(`${AISHA_BASE}/api/v1/tts/post/`, { method: "POST", headers: { "X-Api-Key": apiKey, "Accept-Language": input.lang }, body: form, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new TtsProviderError("aisha", response.status, response.status === 402 ? "Aisha balansi yetarli emas." : await errorMessage(response));
    const json = await response.json().catch(() => null) as { audio_path?: unknown; audio_url?: unknown } | null;
    const path = typeof json?.audio_path === "string" ? json.audio_path : typeof json?.audio_url === "string" ? json.audio_url : null;
    if (!path) throw new TtsProviderError("aisha", 502, "Aisha audio_path qaytarmadi.");
    const url = audioUrl(path);
    // The key goes only to Aisha's own host (a file on a CDN is fetched without it).
    const audio = await fetcher(url, { headers: url.origin === AISHA_BASE ? { "X-Api-Key": apiKey } : {}, signal: AbortSignal.timeout(60_000) });
    if (!audio.ok) throw new TtsProviderError("aisha", audio.status, `Audio yuklab bo‘lmadi (HTTP ${audio.status}).`);
    return new Uint8Array(await audio.arrayBuffer());
  },
  /** 1 UZS per character (Starter) ≈ $0.08 per 1000. */
  costUsd: (chars, env) => Math.round(chars * rate(env, "AISHA_USD_PER_1K_CHARS", 0.08) / 1000 * 1e6) / 1e6,
};
