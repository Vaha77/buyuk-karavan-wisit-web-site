import "server-only";
// Ovoz studiyasi: text → provider requests (split by sentences) → one MP3 / WAV in the storage → a TtsGeneration row with
// characters and estimated cost. Every generation first checks the monthly limit; the daily request count warns.
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { sendMessage, telegramErrorDetails } from "@/lib/telegram/client";
import { detectFormat, mergeAudio, MIME, type AudioFormat } from "./audio";
import { describeProviders, getProvider, providerName, voicesFor } from "./providers";
import { TtsProviderError } from "./providers/types";
import { CREDIT_PROVIDERS, creditsPerChar, creditsUsed, dailyWarning, generationCredits, isCreditProvider, limitError, limitsFromEnv, monthlyCredits, previewText, sampleSentence, splitText, tashkentDayStart, tashkentMonthStart, type TtsRequest } from "./rules";
import { deleteTtsAudio, existingSample, putSample, putTtsAudio, sampleKey } from "./storage";

export type TtsKind = "FULL" | "PREVIEW" | "SAMPLE";
type Options = { kind: TtsKind; source: "admin" | "api"; actor?: string | null };
export type TtsResult =
  | { ok: true; id: string | null; url: string; durationMs: number; format: AudioFormat; chars: number; chunks: number; costUsd: number; credits: number | null; creditsExact: boolean; cached?: boolean; warning: string | null }
  | { ok: false; status: number; error: string };

const env = () => process.env as Record<string, string | undefined>;
export const providersInfo = (options: { legacy?: boolean } = {}) => describeProviders(env(), undefined, options);

export type ProviderUsage = {
  id: string; name: string; monthUsd: number; monthChars: number; monthCount: number; todayCount: number;
  /** Credit-billed providers (VoiceLab): credits this month against the monthly base; exact = every row has VoiceLab's own number. */
  credits: { used: number; exact: boolean; base: number; balance: number | null } | null;
};

/** "Bu oy / So‘rovlar" card: one line per provider used this month (OpenAI and VoiceLab always shown). */
export async function usageSummary() {
  const db = getDb(), limits = limitsFromEnv(env()), month = tashkentMonthStart(), day = tashkentDayStart();
  const [byProvider, todayByProvider, creditRows] = await Promise.all([
    db.ttsGeneration.groupBy({ by: ["provider"], where: { createdAt: { gte: month } }, _sum: { costUsd: true, chars: true }, _count: { _all: true } }),
    db.ttsGeneration.groupBy({ by: ["provider"], where: { createdAt: { gte: day } }, _count: { _all: true } }),
    db.ttsGeneration.findMany({ where: { createdAt: { gte: month }, provider: { in: CREDIT_PROVIDERS } }, select: { provider: true, chars: true, credits: true, creditsExact: true } }),
  ]);
  const ids = [...new Set(["openai", "voicelab", ...byProvider.map(row => row.provider)])];
  const providers: ProviderUsage[] = ids.map(id => {
    const row = byProvider.find(item => item.provider === id);
    const credits = isCreditProvider(id) ? { ...creditsUsed(creditRows.filter(item => item.provider === id), creditsPerChar(env())), base: monthlyCredits(env()), balance: null } : null;
    return {
      id, name: id === "voicelab" ? "VoiceLab (Aisha)" : providerName(id),
      monthUsd: Math.round((row?._sum.costUsd ?? 0) * 1e4) / 1e4, monthChars: row?._sum.chars ?? 0, monthCount: row?._count._all ?? 0,
      todayCount: todayByProvider.find(item => item.provider === id)?._count._all ?? 0, credits,
    };
  });
  const usd = providers.filter(item => !item.credits).reduce((sum, item) => sum + item.monthUsd, 0);
  const todayCount = providers.reduce((sum, item) => sum + item.todayCount, 0);
  return {
    providers,
    // The $ limit covers USD-billed providers (OpenAI, ElevenLabs); VoiceLab is billed in its credits.
    monthUsd: Math.round(usd * 1e4) / 1e4, monthChars: providers.reduce((sum, item) => sum + item.monthChars, 0), monthCount: providers.reduce((sum, item) => sum + item.monthCount, 0),
    todayCount, limits, warning: dailyWarning(todayCount, limits),
  };
}

async function warnSuperAdmins(text: string) {
  const admins = await getDb().adminUser.findMany({ where: { role: "SUPER_ADMIN", isActive: true, telegramChatId: { not: null } }, select: { telegramChatId: true } });
  for (const admin of admins) await sendMessage(admin.telegramChatId!, `⚠️ Ovoz studiyasi: ${text}`).catch(error => console.error("TTS warning send failed", telegramErrorDetails(error)));
}

/** Provider, language, voice and format checked against the registry. */
async function resolve(request: TtsRequest) {
  const provider = getProvider(request.provider);
  if (!provider) return { ok: false as const, status: 400, error: "Bunday provayder yo‘q." };
  if (!provider.configured(env())) return { ok: false as const, status: 400, error: `${provider.name}: kalit kiritilmagan (${provider.envKey}).` };
  if (!(await provider.languages(env())).includes(request.lang)) return { ok: false as const, status: 400, error: `${provider.name} bu tilni qo‘llamaydi (${request.lang}).` };
  const voice = voicesFor(await provider.voices(env()), request.lang).find(item => item.id === request.voice);
  if (!voice) return { ok: false as const, status: 400, error: `${provider.name}: “${request.voice}” ovozi bu til uchun yo‘q.` };
  const format: AudioFormat = request.format && provider.formats.includes(request.format) ? request.format : provider.formats[0];
  return { ok: true as const, provider, voice, format };
}

/** Text → audio. FULL: stored + history; PREVIEW: a data: URL (not stored); SAMPLE: stored under a fixed key. */
async function produce(request: TtsRequest, options: Options, store: (bytes: Uint8Array, format: AudioFormat) => Promise<{ key: string; url: string } | { key: null; url: string }>): Promise<TtsResult> {
  const resolved = await resolve(request);
  if (!resolved.ok) return resolved;
  const { provider, voice } = resolved;
  const db = getDb(), limits = limitsFromEnv(env());
  const chunks = splitText(request.text, provider.maxChars);
  const chars = chunks.reduce((sum, chunk) => sum + chunk.length, 0), costUsd = provider.costUsd(chars, env());

  // The $ limit sums USD-billed providers only; the character limit (if set) covers all of them.
  const [monthUsd, monthChars] = await Promise.all([
    db.ttsGeneration.aggregate({ where: { createdAt: { gte: tashkentMonthStart() }, provider: { notIn: CREDIT_PROVIDERS } }, _sum: { costUsd: true } }),
    db.ttsGeneration.aggregate({ where: { createdAt: { gte: tashkentMonthStart() } }, _sum: { chars: true } }),
  ]);
  const blocked = limitError({ usd: monthUsd._sum.costUsd ?? 0, chars: monthChars._sum.chars ?? 0 }, { usd: isCreditProvider(provider.id) ? 0 : costUsd, chars }, limits);
  if (blocked) return { ok: false, status: 429, error: blocked };

  let merged: { bytes: Uint8Array; durationMs: number }, format: AudioFormat;
  const reported: Array<number | null> = [];
  try {
    const parts: Uint8Array[] = [];
    for (const chunk of chunks) {
      let credits: number | null = null;
      parts.push(await provider.synthesize({ text: chunk, lang: request.lang, voice: voice.id, speed: request.speed, format: resolved.format, onUsage: usage => { credits = usage.credits; } }, env()));
      reported.push(credits);
    }
    // What actually came back decides (e.g. a provider that answers MP3 when WAV was asked).
    format = detectFormat(parts[0]) ?? resolved.format;
    merged = mergeAudio(parts, format);
  } catch (error) {
    console.error("TTS synthesis failed", { provider: provider.id, type: error instanceof Error ? error.name : "UnknownError", status: error instanceof TtsProviderError ? error.status : undefined });
    if (error instanceof TtsProviderError) return { ok: false, status: 502, error: `${provider.name}: ${error.message}` };
    return { ok: false, status: 502, error: `${provider.name}: audio olinmadi yoki birlashtirib bo‘lmadi.` };
  }

  const saved = await store(merged.bytes, format);
  const credit = isCreditProvider(provider.id) ? generationCredits(chars, reported, creditsPerChar(env())) : null;
  const row = await db.ttsGeneration.create({ data: {
    kind: options.kind, source: options.source, provider: provider.id, model: provider.model(env()), voice: voice.id, voiceName: voice.name, lang: request.lang,
    speed: request.speed, format, text: request.text, chars, chunks: chunks.length, costUsd, credits: credit?.credits ?? null, creditsExact: credit?.exact ?? false, durationMs: merged.durationMs, sizeBytes: merged.bytes.length,
    audioUrl: saved.key ? saved.url : null, audioKey: saved.key, createdBy: options.actor ?? null,
  } });

  const today = await db.ttsGeneration.count({ where: { createdAt: { gte: tashkentDayStart() } } });
  const warning = dailyWarning(today, limits);
  if (warning && limits.dailyWarn !== null && today === Math.floor(limits.dailyWarn) + 1) await warnSuperAdmins(warning);
  return { ok: true, id: options.kind === "FULL" ? row.id : null, url: saved.url, durationMs: merged.durationMs, format, chars, chunks: chunks.length, costUsd, credits: credit?.credits ?? null, creditsExact: credit?.exact ?? false, warning };
}

/** "Ovoz yasash" and POST /api/tts: the full text → a public file. */
export function generateFull(request: TtsRequest, options: Omit<Options, "kind">) {
  return produce(request, { ...options, kind: "FULL" }, (bytes, format) => putTtsAudio(bytes, format));
}

/** "Sinab eshitish": the first ~200 characters, returned inline (not stored, still counted). */
export function generatePreview(request: TtsRequest, actor: string) {
  return produce({ ...request, text: previewText(request.text) }, { kind: "PREVIEW", source: "admin", actor }, async (bytes, format) => ({ key: null, url: `data:${MIME[format]};base64,${Buffer.from(bytes).toString("base64")}` }));
}

/** "Ovozlar galereyasi": one sample sentence per voice, generated once and cached in the storage. */
export async function generateSample(request: Omit<TtsRequest, "text">, actor: string): Promise<TtsResult> {
  const resolved = await resolve({ ...request, text: "" });
  if (!resolved.ok) return resolved;
  const text = sampleSentence(request.lang);
  const hash = createHash("sha1").update([request.provider, resolved.provider.model(env()), request.voice, request.lang, request.speed, resolved.format, text].join("|")).digest("hex");
  const key = sampleKey(request.provider, hash, resolved.format);
  const cached = await existingSample(key).catch(() => null);
  if (cached) return { ok: true, id: null, url: cached, durationMs: 0, format: resolved.format, chars: 0, chunks: 0, costUsd: 0, credits: null, creditsExact: false, cached: true, warning: null };
  // A provider that answers another format than asked would be stored under the asked one's key: harmless (the
  // browser sniffs the audio), and the key still matches the next time.
  return produce({ ...request, text }, { kind: "SAMPLE", source: "admin", actor }, (bytes, format) => putSample(key, bytes, format));
}

/** History (FULL, not deleted). */
export function listHistory(take = 100) {
  return getDb().ttsGeneration.findMany({ where: { kind: "FULL", deletedAt: null }, orderBy: { createdAt: "desc" }, take });
}

/** "O‘chirish": the file goes; the row stays (deletedAt) so the month's cost total is unchanged. */
export async function deleteGeneration(id: string) {
  const db = getDb();
  const row = await db.ttsGeneration.findFirst({ where: { id, kind: "FULL", deletedAt: null } });
  if (!row) return { ok: false as const, error: "Topilmadi." };
  await deleteTtsAudio(row.audioKey);
  await db.ttsGeneration.update({ where: { id }, data: { deletedAt: new Date(), audioUrl: null } });
  return { ok: true as const };
}
