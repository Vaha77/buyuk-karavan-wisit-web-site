// Instagram comment → Direct price: pure rules (no DB / network), covered by tests/instagram.test.mjs.
import { createHmac, timingSafeEqual } from "node:crypto";
import { usdToSellingUzs } from "../pricing/money";

/** Graph API version and hosts, from Meta's "Instagram API with Instagram Login" docs (v25.0 in every example). */
export const GRAPH_VERSION = "v25.0";
export const GRAPH_HOST = "https://graph.instagram.com";
export const OAUTH_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const OAUTH_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const SCOPES = ["instagram_business_basic", "instagram_business_manage_comments", "instagram_business_manage_messages"] as const;

export { DEFAULT_DM_TEMPLATE, DEFAULT_GENERAL_REPLY, DEFAULT_KEYWORDS, DEFAULT_PUBLIC_REPLY, PLACEHOLDERS } from "./constants";
import { DEFAULT_KEYWORDS } from "./constants";

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

export type TemplateValues = { mahsulot: string; narx_som: string; havola: string; telefon: string; username?: string | null };

/** Fills {mahsulot} {narx_som} {havola} {telefon} {username}; unknown {words} stay as typed. Instagram's text limit is 1000 chars. */
export function renderTemplate(template: string, values: TemplateValues) {
  const map: Record<string, string> = { mahsulot: values.mahsulot, narx_som: values.narx_som, havola: values.havola, telefon: values.telefon, username: values.username ? `@${values.username}` : "" };
  return template.replace(/\{([a-z_]+)\}/g, (whole, key: string) => key in map ? map[key] : whole).trim().slice(0, 1000);
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
export type MessageEvent = { accountId: string; mid: string; fromId: string; text: string | null; hasAttachments: boolean; isEcho: boolean; time: Date };

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
      const message = item?.message as { mid?: unknown; text?: unknown; is_echo?: unknown; attachments?: unknown } | undefined;
      const mid = str(message?.mid), fromId = str((item.sender as { id?: unknown } | undefined)?.id);
      if (!message || !mid || !fromId) continue;
      messages.push({ accountId, mid, fromId, text: typeof message.text === "string" ? message.text.slice(0, 4000) : null, hasAttachments: Array.isArray(message.attachments) && message.attachments.length > 0, isEcho: message.is_echo === true, time: eventTime(item.timestamp, now) });
    }
  }
  return { comments, messages };
}

// ---- Decision for a new comment ------------------------------------------------------------------------

export type RuleForDecision = { isActive: boolean; productId: string | null; keywords: string[] } | null;
export type Decision =
  | { action: "ignore" }
  | { action: "queue" }
  | { action: "skip"; reason: string; generalReply?: boolean };

/**
 * What to do with a comment: our own comments are ignored (not even logged); a price question on a post with an active
 * product rule is queued for a Private Reply; everything else is logged as skipped (with the "Direct'ga yozing" public
 * reply for price questions on posts without a product, when that is switched on).
 */
export function decideComment(event: Pick<CommentEvent, "fromId" | "username" | "text" | "time">, account: { igUserId: string; username: string; generalReplyEnabled: boolean }, rule: RuleForDecision, now = new Date()): Decision {
  if (event.fromId === account.igUserId || (event.username && account.username && event.username.toLowerCase() === account.username.toLowerCase())) return { action: "ignore" };
  if (tooOld(event.time, now)) return { action: "skip", reason: "7 kundan eski komment" };
  if (rule && !rule.isActive) return { action: "skip", reason: "Post uchun avto-javob o‘chirilgan" };
  const keywords = rule?.keywords.length ? rule.keywords : DEFAULT_KEYWORDS;
  if (!matchesKeywords(event.text, keywords)) return { action: "skip", reason: "Kalit so‘z yo‘q" };
  if (!rule?.productId) return { action: "skip", reason: "Postga mahsulot biriktirilmagan", generalReply: account.generalReplyEnabled };
  return { action: "queue" };
}
