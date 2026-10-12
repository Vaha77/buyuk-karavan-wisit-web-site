// Instagram comment auto-replies: pure rules (no DB / network), covered by tests/instagram.test.mjs.
import { createHmac, timingSafeEqual } from "node:crypto";
import { usdToSellingUzs } from "../pricing/money";

/** Graph API version and hosts, from Meta's "Instagram API with Instagram Login" docs (v25.0 in every example). */
export const GRAPH_VERSION = "v25.0";
export const GRAPH_HOST = "https://graph.instagram.com";
export const OAUTH_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const OAUTH_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const SCOPES = ["instagram_business_basic", "instagram_business_manage_comments", "instagram_business_manage_messages", "instagram_business_manage_insights"] as const;

export { DEFAULT_DM_TEMPLATE, DEFAULT_GENERAL_REPLY, DEFAULT_KEYWORDS, DEFAULT_PUBLIC_REPLY, PLACEHOLDERS } from "./constants";
import { DEFAULT_KEYWORDS, type CommentKind } from "./constants";
export type { CommentKind } from "./constants";

/** Meta allows a Private Reply only within 7 days of the comment. */
export const REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 6;
/** Refresh the 60-day token when fewer than this many days are left (Meta: the token must be at least 24 h old). */
export const REFRESH_WHEN_DAYS_LEFT = 20;

// ---- Webhook signature -----------------------------------------------------------------------------------

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, app secret). Constant-time compare; false on anything malformed. */
export function validSignature(rawBody: Buffer | string, header: string | null | undefined, appSecret: string | null | undefined) {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const received = header.slice(7).trim();
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(received, "hex"));
}

/** GET verification: the challenge to echo back, or null (wrong mode / token). */
export function verifyChallenge(params: URLSearchParams, verifyToken: string | null | undefined) {
  const mode = params.get("hub.mode"), token = params.get("hub.verify_token"), challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !verifyToken || !token || challenge === null) return null;
  const a = Buffer.from(token), b = Buffer.from(verifyToken);
  return a.length === b.length && timingSafeEqual(a, b) ? challenge : null;
}

// ---- Keywords ------------------------------------------------------------------------------------------

/** Lower case, one kind of apostrophe, single spaces (o‘ / oʻ / o' / o` are the same letter for matching). */
export function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFC").replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim();
}

/** Comma / new-line separated input → unique, normalized keywords. */
export function parseKeywords(input: string | string[]) {
  const items = (Array.isArray(input) ? input : input.split(/[,\n]/)).map(normalizeText).filter(Boolean);
  return [...new Set(items)].slice(0, 40);
}

const hasLetterOrDigit = (value: string) => /[\p{L}\p{N}]/u.test(value);

/**
 * Does the comment ask for the price? Word keywords ("narx", "nech pul", "цена") match anywhere in the text, so
 * "narxi qancha?" and "Narxlari" both match. Symbol keywords ("+", "?") match only a comment made of symbols / emoji
 * (e.g. "+", "+++", "?"), so a phone number or an unrelated question does not trigger a DM.
 */
export function matchesKeywords(comment: string, keywords: readonly string[]) {
  const text = normalizeText(comment);
  if (!text) return false;
  const symbolOnly = !hasLetterOrDigit(text);
  const compact = text.replace(/\s+/g, "");
  return keywords.map(normalizeText).filter(Boolean).some(keyword => {
    if (hasLetterOrDigit(keyword)) return text.includes(keyword) || compact.includes(keyword.replace(/\s+/g, ""));
    return symbolOnly && compact.includes(keyword.replace(/\s+/g, ""));
  });
}

// ---- Price, link, template -----------------------------------------------------------------------------

/** Selling price in so‘m, digits grouped by spaces ("12 450 000"), or null when there is no price / rate. Same rounding as the site. */
export function priceSom(priceUsd: string | null | undefined, rate: string | null | undefined) {
  if (!priceUsd || !rate) return null;
  const uzs = usdToSellingUzs(priceUsd, rate);
  if (uzs === null || uzs <= BigInt(0)) return null;
  return uzs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function productLink(siteUrl: string, slug: string, mediaId: string) {
  const url = new URL(`/products/${encodeURIComponent(slug)}`, siteUrl);
  url.searchParams.set("utm_source", "instagram");
  url.searchParams.set("utm_campaign", mediaId);
  return url.toString();
}

export type TemplateValues = { mahsulot: string; narx_som: string; havola: string; telefon: string; username?: string | null; second?: { mahsulot: string; narx_som: string; havola: string } | null };

export const SECOND_PLACEHOLDER = /\{(mahsulot2|narx_som2|havola2)\}/;
/** Without a second product, every line with {mahsulot2} {narx_som2} {havola2} is dropped (blank-line runs collapsed). */
export function dropSecondProductLines(template: string) {
  return template.split(/\r?\n/).filter(line => !SECOND_PLACEHOLDER.test(line)).join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * Fills {mahsulot} {narx_som} {havola} {telefon} {username} and, with `second`, {mahsulot2} {narx_som2} {havola2};
 * without `second` their lines are removed. Unknown {words} stay as typed. Instagram's text limit is 1000 chars.
 */
export function renderTemplate(template: string, values: TemplateValues) {
  const map: Record<string, string> = { mahsulot: values.mahsulot, narx_som: values.narx_som, havola: values.havola, telefon: values.telefon, username: values.username ? `@${values.username}` : "", ...(values.second ? { mahsulot2: values.second.mahsulot, narx_som2: values.second.narx_som, havola2: values.second.havola } : {}) };
  const text = values.second ? template : dropSecondProductLines(template);
  return text.replace(/\{([a-z_0-9]+)\}/g, (whole, key: string) => key in map ? map[key] : whole).trim().slice(0, 1000);
}

// ---- Timing, retries -----------------------------------------------------------------------------------

export const tooOld = (commentedAt: Date, now = new Date()) => now.getTime() - commentedAt.getTime() > REPLY_WINDOW_MS;

/** 1 min, 5 min, 15 min, 1 h, 3 h … after the n-th failed attempt. */
export function backoffMs(attempt: number) {
  const steps = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000];
  return steps[Math.min(Math.max(attempt, 1), steps.length) - 1];
}

export type GraphErrorInfo = { status: number; code?: number; subcode?: number; message?: string };

/**
 * Rate limits (HTTP 429, codes 4 / 17 / 32 / 613 / 80002 / 80006) and server / network errors are retried later;
 * anything else (no permission, user cannot be messaged, comment gone…) fails for good.
 */
export function isRetryable(error: GraphErrorInfo) {
  if (error.status === 429 || error.status === 0 || error.status >= 500) return true;
  return [1, 2, 4, 17, 32, 341, 613, 80002, 80006].includes(error.code ?? -1);
}
export function isRateLimit(error: GraphErrorInfo) {
  return error.status === 429 || [4, 17, 32, 613, 80002, 80006].includes(error.code ?? -1);
}

/** A short, token-free reason for the journal. */
export function errorReason(error: GraphErrorInfo) {
  const message = (error.message ?? "").replace(/access_token=[^&\s]+/gi, "access_token=***").replace(/\b(IG|EA)[A-Za-z0-9]{20,}\b/g, "***").slice(0, 200);
  return [error.code ? `#${error.code}${error.subcode ? `/${error.subcode}` : ""}` : `HTTP ${error.status || "—"}`, message].filter(Boolean).join(" ");
}

/** One person + one product = one lead (Lead.submissionKey is unique). */
export const leadKey = (fromId: string, productId: string) => `ig:${fromId}:${productId}`.slice(0, 100);

/** Reels have "/reel/" in the permalink (media_product_type is not available with Instagram Login). */
export const isReel = (permalink?: string | null) => !!permalink && /\/reels?\//.test(permalink);

// ---- Webhook payload -----------------------------------------------------------------------------------

export type CommentEvent = { accountId: string; commentId: string; mediaId: string; fromId: string; username: string | null; text: string; parentId: string | null; time: Date };
export type MessageEvent = { accountId: string; mid: string; fromId: string; recipientId: string | null; text: string | null; hasAttachments: boolean; kind: string; isEcho: boolean; time: Date };

const ATTACHMENT_KINDS: Record<string, string> = { image: "IMAGE", audio: "AUDIO", video: "VIDEO", file: "FILE", share: "SHARE", ig_reel: "SHARE", reel: "SHARE", story_mention: "STORY", sticker: "STICKER", animated_image: "IMAGE" };
/** TEXT, or the first attachment's type (rasm, ovoz, video, fayl, ulashilgan post / reels, story, stiker). */
export function messageKind(message: { text?: unknown; attachments?: unknown; reply_to?: unknown } | undefined) {
  const first = Array.isArray(message?.attachments) ? (message.attachments[0] as { type?: unknown } | undefined) : undefined;
  if (first) return typeof first.type === "string" ? ATTACHMENT_KINDS[first.type] ?? "OTHER" : "OTHER";
  return typeof message?.text === "string" && message.text ? "TEXT" : "OTHER";
}

const str = (value: unknown) => typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null;
/** entry.time is seconds, messaging timestamps milliseconds; anything else → now. */
function eventTime(value: unknown, now: Date) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return now;
  const date = new Date(value < 1e12 ? value * 1000 : value);
  return date.getTime() > now.getTime() + 60_000 ? now : date;
}

/** Comment and Direct message events of an { object: "instagram", entry: [...] } notification; malformed items are skipped. */
export function parseWebhook(payload: unknown, now = new Date()) {
  const comments: CommentEvent[] = [], messages: MessageEvent[] = [];
  const body = payload as { object?: unknown; entry?: unknown };
  if (!body || typeof body !== "object" || body.object !== "instagram" || !Array.isArray(body.entry)) return { comments, messages };
  for (const entry of body.entry as Array<Record<string, unknown>>) {
    const accountId = str(entry?.id);
    if (!accountId) continue;
    for (const change of Array.isArray(entry.changes) ? entry.changes as Array<Record<string, unknown>> : []) {
      if (change?.field !== "comments" || !change.value || typeof change.value !== "object") continue;
      const value = change.value as { id?: unknown; text?: unknown; parent_id?: unknown; from?: { id?: unknown; username?: unknown }; media?: { id?: unknown } };
      const commentId = str(value.id), fromId = str(value.from?.id), mediaId = str(value.media?.id);
      if (!commentId || !fromId || !mediaId) continue;
      comments.push({ accountId, commentId, mediaId, fromId, username: str(value.from?.username), text: typeof value.text === "string" ? value.text.slice(0, 2000) : "", parentId: str(value.parent_id), time: eventTime(entry.time, now) });
    }
    for (const item of Array.isArray(entry.messaging) ? entry.messaging as Array<Record<string, unknown>> : []) {
      const message = item?.message as { mid?: unknown; text?: unknown; is_echo?: unknown; is_deleted?: unknown; attachments?: unknown } | undefined;
      const mid = str(message?.mid), fromId = str((item.sender as { id?: unknown } | undefined)?.id);
      if (!message || !mid || !fromId || message.is_deleted === true) continue;
      messages.push({ accountId, mid, fromId, recipientId: str((item.recipient as { id?: unknown } | undefined)?.id), text: typeof message.text === "string" ? message.text.slice(0, 4000) : null, hasAttachments: Array.isArray(message.attachments) && message.attachments.length > 0, kind: messageKind(message), isEcho: message.is_echo === true, time: eventTime(item.timestamp, now) });
    }
  }
  return { comments, messages };
}

// ---- Ingest: which comments enter the queue ------------------------------------------------------------

export type IngestDecision = { action: "ignore" } | { action: "queue" } | { action: "skip"; reason: string };

/**
 * Our own comments (and our public replies coming back as events) are ignored, not even logged. Replies to another comment
 * (reply to a reply), comments older than 7 days are logged as skipped. Everything else is queued: it is classified and
 * answered in the background (classification may call the AI, so it never runs inside the webhook request).
 */
export function decideIngest(event: Pick<CommentEvent, "fromId" | "username" | "parentId" | "time">, account: { igUserId: string; username: string }, now = new Date()): IngestDecision {
  if (event.fromId === account.igUserId || (event.username && account.username && event.username.toLowerCase() === account.username.toLowerCase())) return { action: "ignore" };
  if (event.parentId) return { action: "skip", reason: "Javob-komment (reply) — javob berilmaydi" };
  if (tooOld(event.time, now)) return { action: "skip", reason: "7 kundan eski komment" };
  return { action: "queue" };
}

// ---- Keyword classifier --------------------------------------------------------------------------------

type ClassKind = "PRICE" | "POSITIVE" | "QUESTION" | "NEGATIVE" | "SPAM";

const SPAM = [/https?:\/\//, /\bwww\./, /\bt\.me\//, /\b[a-z0-9-]+\.(?:com|ru|uz|net|org|io|me|link|shop|xyz)\b/, /(?:^|\s)@\w+.*@\w+.*@\w+/, /\bfollow (?:me|back)\b/, /\bcheck (?:my|out my)\b/, /\bdm me\b/, /\bfree followers?\b/, /подпиш/, /заработ/, /казино|casino|crypto|bitcoin|крипт|ставк|1xbet|promo ?code|промокод|реклам/];
const NEGATIVE = ["qimmat", "киммат", "қиммат", "aldov", "aldam", "aldash", "aldadi", "firib", "ishlamadi", "ishlamaydi", "ishlamay", "yomon", "ёмон", "sifatsiz", "buzil", "buzuq", "shikoyat", "обман", "мошен", "развод", "дорого", "плохо", "ужас", "отстой", "не работает", "сломал", "жалоба", "scam", "fake", "terrible", "axmoq", "ahmoq", "tupoy", "тупой"];
const NEGATIVE_EMOJI = /[👎😡🤬🤮💩😠😤🖕]/u;
const QUESTION = ["qayer", "qaer", "қаер", "каер", "manzil", "манзил", "adres", "адрес", "yetkaz", "етказ", "dostav", "доставк", "kafolat", "кафолат", "garant", "гарант", "qachon", "қачон", "когда", "где", "bormi", "bor mi", "mumkinmi", "qanday", "қандай", "как ", "zakaz", "заказ", "buyurtma", "ulgurji", "оптом", "rassrochka", "рассрочк", "nasiya", "кредит", "kredit", "ish vaqti", "telefon raqam", "номер"];
const POSITIVE = ["zo'r", "зўр", "зур", "qoyil", "қойил", "gap yo'q", "гап йўқ", "ajoyib", "ажойиб", "rahmat", "raxmat", "раҳмат", "рахмат", "barakalla", "mashalloh", "mashaalloh", "omad", "super", "супер", "класс", "klass", "отлично", "молодц", "круто", "красиво", "спасибо", "yaxshi", "яхши", "chiroyli", "чиройли", "zo'r ekan", "nice", "cool", "wow", "great", "amazing", "love", "👍"];
const POSITIVE_EMOJI = /[🔥😍👍❤️❤💯👏🤩😊🙂😁😀🥰💪✅⭐🌟🙏💙💚💛🧡💜🤍]/u;
const hasLetters = (value: string) => /\p{L}/u.test(value);
const hasEmoji = (value: string) => /\p{Extended_Pictographic}/u.test(value);
const containsWord = (text: string, words: readonly string[]) => words.some(word => text.includes(word));

/**
 * Fast keyword pass. `definite` when exactly one kind matched; otherwise (none or several) the AI decides, and if the AI is
 * unavailable `fallback` is used: the most cautious of the matches (SPAM > NEGATIVE > PRICE > QUESTION > POSITIVE), or
 * null (= no reply). A price match hides the generic "?" question signal, so "narxi qancha?" is just PRICE.
 */
export function classifyByKeywords(comment: string, priceKeywords: readonly string[] = []) {
  const text = normalizeText(comment);
  const matched = new Set<ClassKind>();
  if (!text) return { definite: null, fallback: null, matched: [] as ClassKind[] };
  if (SPAM.some(pattern => pattern.test(text))) matched.add("SPAM");
  if (containsWord(text, NEGATIVE) || NEGATIVE_EMOJI.test(text)) matched.add("NEGATIVE");
  const price = matchesKeywords(text, priceKeywords.length ? priceKeywords : [...DEFAULT_KEYWORDS]);
  if (price) matched.add("PRICE");
  if (containsWord(`${text} `, QUESTION) || (!price && hasLetters(text) && text.includes("?"))) matched.add("QUESTION");
  if (containsWord(text, POSITIVE) || (!hasLetters(text) && (POSITIVE_EMOJI.test(text) || hasEmoji(text)) && !NEGATIVE_EMOJI.test(text) && !price)) matched.add("POSITIVE");
  const list = [...matched];
  const order: ClassKind[] = ["SPAM", "NEGATIVE", "PRICE", "QUESTION", "POSITIVE"];
  const fallback = order.find(kind => matched.has(kind)) ?? null;
  return { definite: list.length === 1 ? list[0] : null, fallback, matched: list };
}

// ---- Choosing the action -------------------------------------------------------------------------------

export type ActionSettings = { priceEnabled: boolean; positiveEnabled: boolean; questionEnabled: boolean; negativeNotify: boolean; dailyReplyLimit: number };
export type ActionContext = {
  rule: { isActive: boolean; productId: string | null } | null;
  /** This person already got a reply (DM or public) on this post. */
  alreadyAnswered: boolean;
  /** Public replies sent today (Tashkent day). */
  repliesToday: number;
  generalReplyEnabled: boolean;
};
export type Action =
  | { type: "skip"; reason: string }
  | { type: "notify" }
  | { type: "price"; publicReply: boolean }
  | { type: "general" }
  | { type: "positive" }
  | { type: "question"; publicReply: boolean };

/**
 * What to do for a classified comment. NEGATIVE is never answered (Telegram notice only), SPAM / UNKNOWN never; one reply
 * per person per post; a post with "Avto-javoblar faol" off gets no replies; over the daily limit no public reply goes out
 * (a PRICE / QUESTION DM still does, POSITIVE is skipped since it is a public reply only).
 */
export function chooseAction(kind: CommentKind, settings: ActionSettings, context: ActionContext): Action {
  if (kind === "SPAM") return { type: "skip", reason: "Spam — javobsiz" };
  if (kind === "UNKNOWN") return { type: "skip", reason: "Turi aniqlanmadi — javobsiz" };
  if (kind === "NEGATIVE") return settings.negativeNotify ? { type: "notify" } : { type: "skip", reason: "Salbiy — xabarnoma o‘chirilgan" };
  if (context.rule && !context.rule.isActive) return { type: "skip", reason: "Post uchun avto-javoblar o‘chirilgan" };
  if (context.alreadyAnswered) return { type: "skip", reason: "Bu odamga shu postda javob berilgan" };
  const underLimit = context.repliesToday < settings.dailyReplyLimit;
  if (kind === "PRICE") {
    if (!settings.priceEnabled) return { type: "skip", reason: "Narx javoblari o‘chirilgan" };
    if (!context.rule?.productId) return context.generalReplyEnabled && underLimit ? { type: "general" } : { type: "skip", reason: context.generalReplyEnabled ? "Kunlik javob limiti tugadi" : "Postga mahsulot biriktirilmagan" };
    return { type: "price", publicReply: underLimit };
  }
  if (kind === "POSITIVE") {
    if (!settings.positiveEnabled) return { type: "skip", reason: "Ijobiy kommentlarga javob o‘chirilgan" };
    return underLimit ? { type: "positive" } : { type: "skip", reason: "Kunlik javob limiti tugadi" };
  }
  if (!settings.questionEnabled) return { type: "skip", reason: "Savollarga javob o‘chirilgan" };
  return { type: "question", publicReply: underLimit };
}

// ---- Public replies ------------------------------------------------------------------------------------

export function pickVariant(variants: readonly string[], fallback: string, random = Math.random) {
  const list = variants.map(item => item.trim()).filter(Boolean);
  return list.length ? list[Math.floor(random() * list.length) % list.length] : fallback;
}

/** "a\nb\n\nc" → ["a", "b", "c"], at most 10 variants of 300 chars. */
export const parseVariants = (input: string | string[]) => [...new Set((Array.isArray(input) ? input : input.split("\n")).map(item => item.trim().slice(0, 300)).filter(Boolean))].slice(0, 10);

const emojiCount = (value: string) => [...value.matchAll(/\p{Extended_Pictographic}/gu)].length;
const FORBIDDEN = /\d|narx|нарх|цен|price|so['‘’ʻ]?m|сўм|сум|\$|chegirma|чегирма|skidka|скидк|aksiya|акци|bepul|бесплат|tekin|va'?da|обеща|kafolat|гарант|%/i;

/** A POSITIVE reply from the AI: one sentence, 3–12 words, no price / promise / discount, at most one emoji (exactly one if the comment had emoji). */
export function validPositiveReply(reply: string, comment: string) {
  const text = reply.trim();
  if (!text || text.length > 160 || /\n/.test(text)) return false;
  const words = text.replace(/\p{Extended_Pictographic}|️|‍/gu, " ").split(/\s+/).filter(word => /[\p{L}]/u.test(word));
  if (words.length < 3 || words.length > 12) return false;
  if ((text.replace(/[.!?…]+$/u, "").match(/[.!?…]\s+\S/gu) ?? []).length > 0) return false;
  if (FORBIDDEN.test(text) || /https?:|www\.|@\w/.test(text)) return false;
  const emoji = emojiCount(text);
  return hasEmoji(comment) ? emoji === 1 : emoji <= 1;
}

const wordsOf = (value: string) => new Set(normalizeText(value).replace(/\p{Extended_Pictographic}|️|‍/gu, " ").replace(/[^\p{L}\p{N}\s']/gu, " ").split(" ").filter(word => word.length > 1));

/** Same text, or ≥ 60 % word overlap (Jaccard), counts as a repeat. */
export function isSimilar(a: string, b: string) {
  const x = wordsOf(a), y = wordsOf(b);
  if (!x.size || !y.size) return normalizeText(a) === normalizeText(b);
  let both = 0;
  for (const word of x) if (y.has(word)) both++;
  return both / (x.size + y.size - both) >= 0.6;
}
export const tooSimilar = (reply: string, recent: readonly string[]) => recent.some(item => isSimilar(reply, item));

// ---- Pacing, daily limit, AI cost ----------------------------------------------------------------------

export const MIN_GAP_MS = 20_000;
export const MAX_GAP_MS = 90_000;
/** Random 20–90 s pause between two outgoing replies (looks human, stays under Meta's spam radar). */
export const randomGapMs = (random = Math.random) => MIN_GAP_MS + Math.floor(random() * (MAX_GAP_MS - MIN_GAP_MS + 1));

/** Start of the current day in Tashkent (UTC+5, no DST) as a UTC Date. */
export function tashkentDayStart(now = new Date()) {
  const shifted = new Date(now.getTime() + 5 * 3_600_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 5 * 3_600_000);
}

/** USD per 1M tokens (input, output); unknown model → null cost (tokens are still logged). */
const PRICES: Record<string, [number, number]> = { "gpt-4.1-mini": [0.4, 1.6], "gpt-4.1-nano": [0.1, 0.4], "gpt-4o-mini": [0.15, 0.6], "gpt-5-mini": [0.25, 2], "gpt-5-nano": [0.05, 0.4] };
export function aiCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const price = PRICES[model] ?? PRICES[Object.keys(PRICES).find(key => model.startsWith(`${key}-`)) ?? ""];
  if (!price) return null;
  return Math.round(((inputTokens * price[0] + outputTokens * price[1]) / 1_000_000) * 1e6) / 1e6;
}
