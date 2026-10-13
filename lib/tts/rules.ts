// Ovoz studiyasi (TTS): languages, text splitting, preview text, cost and the monthly / daily limits. Pure — used by the
// server, the admin UI and the tests.

export const MAX_TEXT_CHARS = 20_000;
export const PREVIEW_CHARS = 200;
export const DEFAULT_SPEED = 1;

/** Every language the studio offers (each provider says which of these it speaks). */
export const LANGUAGES: Record<string, string> = {
  uz: "O‘zbek", ru: "Rus", en: "Ingliz", zh: "Xitoy", ko: "Koreys", tr: "Turk", kk: "Qozoq", ky: "Qirg‘iz", tg: "Tojik", az: "Ozarbayjon",
  tk: "Turkman", de: "Nemis", fr: "Fransuz", es: "Ispan", it: "Italyan", pt: "Portugal", ar: "Arab", fa: "Fors", hi: "Hind", ur: "Urdu",
  ja: "Yapon", uk: "Ukrain", pl: "Polyak", nl: "Golland", id: "Indonez", ms: "Malay", vi: "Vyetnam", th: "Tay", he: "Ivrit", el: "Grek",
  cs: "Chex", ro: "Rumin", hu: "Venger", sv: "Shved", fi: "Fin", da: "Daniya", bg: "Bolgar", hr: "Xorvat", sk: "Slovak", ta: "Tamil",
};
/** Shown first in the language picker. */
export const MAIN_LANGUAGES = ["uz", "ru", "en", "zh", "ko", "tr"];
export const languageName = (code: string) => LANGUAGES[code] ?? code;

/** One sentence per language for "Ovozlar galereyasi" (every voice reads the same line). */
export const SAMPLE_SENTENCES: Record<string, string> = {
  uz: "Assalomu alaykum! Buyuk Karavan — sanoat sovutish uskunalari, Namangan.",
  ru: "Здравствуйте! Буюк Караван — промышленное холодильное оборудование, Наманган.",
  en: "Hello! Buyuk Karavan builds industrial refrigeration equipment in Namangan.",
  zh: "您好！Buyuk Karavan 是纳曼干的工业制冷设备公司。",
  ko: "안녕하세요! 부육 카라반은 나망간의 산업용 냉동 설비 회사입니다.",
  tr: "Merhaba! Buyuk Karavan, Namangan'da endüstriyel soğutma ekipmanları üretir.",
  kk: "Сәлеметсіз бе! Буюк Караван — Наманганда өнеркәсіптік тоңазытқыш жабдықтары.",
  de: "Hallo! Buyuk Karavan baut industrielle Kühlanlagen in Namangan.",
  fr: "Bonjour ! Buyuk Karavan fabrique des équipements frigorifiques industriels à Namangan.",
  es: "¡Hola! Buyuk Karavan fabrica equipos de refrigeración industrial en Namangan.",
  ar: "مرحباً! بويوك كارافان تصنع معدات التبريد الصناعية في نمنغان.",
  ja: "こんにちは！ブユク・カラバンはナマンガンの産業用冷凍設備メーカーです。",
};
export const sampleSentence = (lang: string) => SAMPLE_SENTENCES[lang] ?? SAMPLE_SENTENCES.en;

const SENTENCE_END = /[.!?…。！？]/;
/** Splits after a comma / semicolon / colon, keeping the mark on the left part. */
const CLAUSE = /(?<=[,;:，、；：])\s*/;

/** Splits on sentence ends (keeping the punctuation and closing quotes) and on line breaks. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split(/\n+/)) {
    const parts = line.match(/[^.!?…。！？]+(?:[.!?…。！？]+["»”’')\]]*)?|[.!?…。！？]+["»”’')\]]*/g) ?? [];
    for (const part of parts) { const trimmed = part.replace(/\s+/g, " ").trim(); if (trimmed) out.push(trimmed); }
  }
  return out;
}

/** A piece longer than `max`: by commas, then by words, then a hard cut (one very long "word"). */
function splitLong(piece: string, max: number): string[] {
  if (piece.length <= max) return [piece];
  const byClause = piece.split(CLAUSE).filter(Boolean);
  const parts = byClause.length > 1 ? byClause : piece.split(" ");
  if (parts.length === 1) { const cut: string[] = []; for (let i = 0; i < piece.length; i += max) cut.push(piece.slice(i, i + max)); return cut; }
  return pack(parts.flatMap(part => splitLong(part.trim(), max)), max);
}

/** Chinese / Japanese characters and punctuation: no space between sentences (Korean does use spaces). */
const NO_SPACE = /[　-ヿ㐀-鿿＀-￯]/;

function pack(pieces: string[], max: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (!piece) continue;
    const joined = !current ? piece : NO_SPACE.test(current.at(-1)!) || NO_SPACE.test(piece[0]) ? current + piece : `${current} ${piece}`;
    if (joined.length <= max) current = joined;
    else { if (current) chunks.push(current); current = piece; }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Text → chunks of at most `max` characters, cut between sentences whenever possible (for one provider request each). */
export function splitText(text: string, max: number): string[] {
  if (!Number.isFinite(max) || max < 20) throw new Error("max");
  return pack(sentences(text).flatMap(sentence => splitLong(sentence, max)), max);
}

/** "Sinab eshitish": the first ~200 characters, ending on a sentence (or at least a word) boundary. */
export function previewText(text: string, limit = PREVIEW_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const head = clean.slice(0, limit + 1);
  let end = -1;
  for (let i = head.length - 1; i >= limit * 0.4; i--) if (SENTENCE_END.test(head[i])) { end = i + 1; break; }
  if (end > 0) return head.slice(0, end).trim();
  const space = head.lastIndexOf(" ");
  return (space > limit * 0.5 ? head.slice(0, space) : head.slice(0, limit)).trim();
}

export type TtsRequestInput = { text?: unknown; lang?: unknown; provider?: unknown; voice?: unknown; speed?: unknown; format?: unknown };
export type TtsRequest = { text: string; lang: string; provider: string; voice: string; speed: number; format: "mp3" | "wav" | null };

/** Body of POST /api/tts and of the admin actions → a clean request, or an error in Uzbek. */
export function parseTtsRequest(body: TtsRequestInput): { ok: true; value: TtsRequest } | { ok: false; error: string } {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return { ok: false, error: "text bo‘sh." };
  if (text.length > MAX_TEXT_CHARS) return { ok: false, error: `Matn ${MAX_TEXT_CHARS} belgidan oshmasin.` };
  const lang = typeof body.lang === "string" ? body.lang.trim().toLowerCase() : "";
  // Any well-formed code: the chosen provider (its catalog) decides whether it speaks it.
  if (!(lang in LANGUAGES) && !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(lang)) return { ok: false, error: "lang noto‘g‘ri (masalan: uz, ru, en)." };
  const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  if (!/^[a-z0-9-]{2,30}$/.test(provider)) return { ok: false, error: "provider noto‘g‘ri." };
  const voice = typeof body.voice === "string" ? body.voice.trim() : "";
  if (!voice || voice.length > 120) return { ok: false, error: "voice tanlanmagan." };
  const speed = body.speed === undefined || body.speed === null || body.speed === "" ? DEFAULT_SPEED : Number(body.speed);
  if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) return { ok: false, error: "speed 0.25–4 oralig‘ida bo‘lsin." };
  const format = body.format === "mp3" || body.format === "wav" ? body.format : null;
  return { ok: true, value: { text, lang, provider, voice, speed, format } };
}

// ---- Cost and limits --------------------------------------------------------------------------------------------

export const usdForChars = (chars: number, usdPer1k: number) => Math.round(chars * usdPer1k / 1000 * 1e6) / 1e6;

/** A positive number from an env value, or the fallback (empty / "0" / junk → fallback; "off" → null = no limit). */
export function envNumber(value: string | undefined, fallback: number | null): number | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "off" || raw === "none") return null;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export type TtsLimits = { monthlyUsd: number | null; monthlyChars: number | null; dailyWarn: number | null };
export const DEFAULT_LIMITS: TtsLimits = { monthlyUsd: 20, monthlyChars: null, dailyWarn: 50 };
export function limitsFromEnv(env: Record<string, string | undefined>): TtsLimits {
  return {
    monthlyUsd: envNumber(env.TTS_MONTHLY_USD_LIMIT, DEFAULT_LIMITS.monthlyUsd),
    monthlyChars: envNumber(env.TTS_MONTHLY_CHAR_LIMIT, DEFAULT_LIMITS.monthlyChars),
    dailyWarn: envNumber(env.TTS_DAILY_WARN_REQUESTS, DEFAULT_LIMITS.dailyWarn),
  };
}

export type MonthUsage = { usd: number; chars: number };
/** Refuses a request that would push this month over a limit (the estimate is known before calling the provider). */
export function limitError(used: MonthUsage, next: MonthUsage, limits: TtsLimits): string | null {
  if (limits.monthlyUsd !== null && used.usd + next.usd > limits.monthlyUsd) return `Oylik limit: $${limits.monthlyUsd} (ishlatildi $${used.usd.toFixed(2)}, bu so‘rov ≈ $${next.usd.toFixed(3)}). TTS_MONTHLY_USD_LIMIT ni oshiring yoki keyingi oyni kuting.`;
  if (limits.monthlyChars !== null && used.chars + next.chars > limits.monthlyChars) return `Oylik limit: ${limits.monthlyChars} belgi (ishlatildi ${used.chars}, bu so‘rov ${next.chars}).`;
  return null;
}
/** Shown (and sent to Telegram once) when today's request count is over TTS_DAILY_WARN_REQUESTS. */
export function dailyWarning(todayCount: number, limits: TtsLimits): string | null {
  return limits.dailyWarn !== null && todayCount > limits.dailyWarn ? `Bugun ${todayCount} ta TTS so‘rov (ogohlantirish chegarasi ${limits.dailyWarn}).` : null;
}

const TASHKENT_MS = 5 * 3_600_000;
/** Start of the current month / day in Asia/Tashkent (UTC+5, no DST) as a UTC instant. */
export function tashkentMonthStart(now = new Date()) { const local = new Date(now.getTime() + TASHKENT_MS); return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - TASHKENT_MS); }
export function tashkentDayStart(now = new Date()) { const local = new Date(now.getTime() + TASHKENT_MS); return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TASHKENT_MS); }

export const formatDuration = (ms: number | null | undefined) => {
  if (!ms || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

// ---- Missing table ----------------------------------------------------------------------------------------------
export const MIGRATION_NEEDED = "Ovoz studiyasi jadvali (TtsGeneration) bazada yo‘q — migratsiya kerak: npx prisma migrate deploy";
/** Prisma P2021 ("The table … does not exist") or Postgres 42P01 for the TTS table — the migration has not been applied. */
export function isMissingTable(error: unknown): boolean {
  const item = error as { code?: unknown; message?: unknown; meta?: { table?: unknown; modelName?: unknown }; cause?: unknown } | null;
  if (!item || typeof item !== "object") return false;
  const text = `${typeof item.message === "string" ? item.message : ""} ${String(item.meta?.table ?? "")} ${String(item.meta?.modelName ?? "")}`;
  if ((item.code === "P2021" || item.code === "42P01") && (/TtsGeneration/i.test(text) || !text.trim())) return true;
  if (/TtsGeneration/i.test(text) && /does not exist/i.test(text)) return true;
  return item.cause !== undefined && item.cause !== error ? isMissingTable(item.cause) : false;
}
