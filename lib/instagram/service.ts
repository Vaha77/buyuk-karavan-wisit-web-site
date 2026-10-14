import "server-only";
import { setTimeout as sleep } from "node:timers/promises";
import type { InstagramAccount, InstagramComment, InstagramMediaRule } from "@/generated/prisma/client";
import { decryptPassword, encryptPassword } from "@/lib/auth/password-vault";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { getDb } from "@/lib/db";
import { getPublicHomeContent } from "@/lib/home/content";
import { expireDashboard } from "@/lib/referrals/tracking";
import { SITE_URL } from "@/lib/site-url";
import { publishLeadToTelegram } from "@/lib/telegram/service";
import { addUsage, classifyWithAi, writePositiveReply, type AiUsage } from "./ai";
import { DEFAULT_PUBLIC_REPLY, type CommentKind } from "./constants";
import { GraphError, getMediaPermalink, listComments, listMedia, refreshLongLived, replyToComment, sendPrivateReply } from "./graph";
import { ingestFetchedComments, ingestWebhook, type IngestStore, type MediaComments } from "./ingest";
import { afterDirectEvents, recordDirectEvents } from "./direct";
import { notifyNegative } from "./telegram";
import { MAX_ATTEMPTS, REFRESH_WHEN_DAYS_LEFT, backoffMs, chooseAction, classifyByKeywords, errorReason, isRateLimit, isRetryable, leadKey, pickVariant, priceSom, productLink, randomGapMs, renderTemplate, tashkentDayStart, tooOld, type Action, type GraphErrorInfo } from "./rules";

const ACCOUNT_ID = "global";
const LOCK_MS = 3 * 60_000;

const safeType = (error: unknown) => error instanceof GraphError ? `GraphError ${error.info.code ?? error.info.status}` : error instanceof Error ? error.name : "UnknownError";
const errorInfo = (error: unknown): GraphErrorInfo => error instanceof GraphError ? error.info : { status: 0, message: error instanceof Error ? error.name : "Xato" };

export const getInstagramAccount = () => getDb().instagramAccount.findUnique({ where: { id: ACCOUNT_ID } });

/** The decrypted access token, or null (no account / PASSWORD_VIEW_KEY missing or changed). Never logged. */
export function accountToken(account: Pick<InstagramAccount, "tokenEncrypted">) {
  try { return decryptPassword(account.tokenEncrypted); } catch { return null; }
}
export const encryptToken = (token: string) => encryptPassword(token);

// ---- Webhook ---------------------------------------------------------------------------------------------

const prismaStore: IngestStore = {
  async insertComment(row) {
    const result = await getDb().instagramComment.createMany({ data: [row], skipDuplicates: true });
    return result.count === 1;
  },
};

/**
 * Synchronous part of the webhook: comment rows and Direct conversations (DB only, fast). Classifying / replying to
 * comments and the Telegram side of Direct run in `afterNotification`, after the 200.
 */
export async function ingestNotification(payload: unknown) {
  const account = await getInstagramAccount();
  if (!account) return null;
  const result = await ingestWebhook(payload, account, prismaStore);
  const direct = await recordDirectEvents(result.direct, account);
  await getDb().instagramAccount.update({ where: { id: ACCOUNT_ID }, data: { lastWebhookAt: new Date() } }).catch(() => undefined);
  return { queued: result.queued, direct, account };
}

/** Background part of the webhook. Never throws. */
export async function afterNotification(result: NonNullable<Awaited<ReturnType<typeof ingestNotification>>>) {
  if (result.direct.touched.length || result.direct.phones.length) await afterDirectEvents(result.direct, result.account, accountToken(result.account)).catch(error => console.error("Instagram Direct failed", { type: safeType(error) }));
  if (result.queued.length) await processQueue({ budgetMs: 240_000 });
}

// ---- Queue helpers ---------------------------------------------------------------------------------------

/** Takes a comment for processing (3-minute lock), so two runs never handle the same comment. */
async function claim(commentId: string) {
  const now = new Date();
  const { count } = await getDb().instagramComment.updateMany({ where: { commentId, status: "PENDING", nextAttemptAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }, data: { lockedUntil: new Date(now.getTime() + LOCK_MS) } });
  return count === 1;
}

/**
 * Pacing: reserves the next outgoing reply slot atomically. Returns 0 when this run may reply now (the following slot is
 * then 20–90 s later), else how many ms to wait.
 */
async function reserveSlot() {
  const now = new Date();
  const { count } = await getDb().instagramAccount.updateMany({ where: { id: ACCOUNT_ID, OR: [{ nextActionAt: null }, { nextActionAt: { lte: now } }] }, data: { nextActionAt: new Date(now.getTime() + randomGapMs()) } });
  if (count === 1) return 0;
  const account = await getDb().instagramAccount.findUnique({ where: { id: ACCOUNT_ID }, select: { nextActionAt: true } });
  return Math.max(1_000, (account?.nextActionAt?.getTime() ?? now.getTime()) - now.getTime());
}

async function sitePhone(account: InstagramAccount) {
  if (account.phone?.trim()) return account.phone.trim();
  const footer = await getPublicHomeContent().then(content => content.footer.phone).catch(() => "");
  return footer && !footer.includes("[") ? footer : "";
}

type RuleProduct = { id: string; name: string; slug: string; priceUsd: { toString(): string } | null; isVisible: boolean; archivedAt: Date | null };
type RuleWithProduct = InstagramMediaRule & { product: RuleProduct | null; secondProduct?: RuleProduct | null };
const RULE_PRODUCT = { select: { id: true, name: true, slug: true, priceUsd: true, isVisible: true, archivedAt: true } } as const;
type Context = { account: InstagramAccount; token: string; rate: string | null; phone: string; deadline: number };
type Outcome = "sent" | "failed" | "skipped" | "notified" | "retry" | "rate-limited" | "wait";

/** Keywords first; when they are unclear the AI decides; without the AI the keyword fallback, else UNKNOWN (no reply). */
async function classify(comment: InstagramComment, rule: RuleWithProduct | null): Promise<{ kind: CommentKind; by: string; usage: AiUsage }> {
  const keywords = classifyByKeywords(comment.text, rule?.keywords ?? []);
  if (keywords.definite) return { kind: keywords.definite, by: "KEYWORD", usage: { tokens: 0, costUsd: 0 } };
  const ai = await classifyWithAi(comment.text);
  if (ai) return { kind: ai.kind, by: "AI", usage: ai.usage };
  return { kind: keywords.fallback ?? "UNKNOWN", by: "KEYWORD_FALLBACK", usage: { tokens: 0, costUsd: 0 } };
}

/** The DM text for PRICE / QUESTION: the post's template (placeholders optional), or the general question text. */
function dmFor(template: string, rule: RuleWithProduct | null, comment: InstagramComment, context: Context): { text: string } | { error: string } {
  const product = rule?.product ?? null;
  const needsProduct = /\{(mahsulot|narx_som|havola)\}/.test(template);
  if (needsProduct && !product) return { error: "Matnda {mahsulot}/{narx_som}/{havola} bor, lekin mahsulot biriktirilmagan" };
  if (product && (!product.isVisible || product.archivedAt) && needsProduct) return { error: "Mahsulot saytda yashirin yoki arxivda" };
  let price = "";
  if (template.includes("{narx_som}")) {
    price = priceSom(product?.priceUsd?.toString(), context.rate) ?? "";
    if (!price) return { error: product?.priceUsd ? "CBU kursi olinmadi" : "Prays'da sotuv narxi yo‘q" };
  }
  // Second product: used only when it is on the site and (if the text asks for it) has a price; otherwise its lines go.
  const extra = rule?.secondProduct ?? null;
  const extraPrice = extra && template.includes("{narx_som2}") ? priceSom(extra.priceUsd?.toString(), context.rate) : "";
  const second = extra && extra.isVisible && !extra.archivedAt && extraPrice !== null ? { mahsulot: extra.name, narx_som: extraPrice, havola: productLink(SITE_URL, extra.slug, comment.mediaId) } : null;
  return { text: renderTemplate(template, { mahsulot: product?.name ?? "", narx_som: price, havola: product ? productLink(SITE_URL, product.slug, comment.mediaId) : "", telefon: context.phone, username: comment.username, second }) };
}

/** BKLead lead; one per person + product (or + post when there is no product). Returns the lead id (new or existing). */
async function createInstagramLead(comment: InstagramComment, rule: RuleWithProduct | null, kind: "PRICE" | "QUESTION") {
  const db = getDb(), product = rule?.product ?? null;
  const submissionKey = leadKey(comment.fromId, product?.id ?? `post:${comment.mediaId}`);
  const existing = await db.lead.findUnique({ where: { submissionKey }, select: { id: true } });
  if (existing) return existing.id;
  const handle = comment.username ? `@${comment.username}` : `Instagram ${comment.fromId}`;
  const notes = [`Instagram komment: «${comment.text.slice(0, 500)}»`, `Instagram: ${comment.username ? `https://instagram.com/${comment.username}` : handle}`, `Post: ${rule?.permalink ?? comment.mediaId}`, kind === "PRICE" ? "Narx Direct'ga avtomatik yuborildi." : "Savol: Direct'ga avtomatik javob yuborildi, mutaxassis bog‘lansin."].join("\n");
  const created = await db.lead.createManyAndReturn({ data: [{ submissionKey, customerName: handle, requestType: kind === "PRICE" ? "Instagram: narx so‘rovi" : "Instagram: savol", product: product?.name ?? null, productId: product?.id ?? null, productSlug: product?.slug ?? null, notes, source: "INSTAGRAM" }], skipDuplicates: true, select: { id: true } });
  const row = created[0];
  if (!row) return (await db.lead.findUnique({ where: { submissionKey }, select: { id: true } }))?.id ?? null;
  await db.leadActivity.create({ data: { leadId: row.id, type: "LEAD_CREATED" } });
  try { expireDashboard(); } catch { /* outside a request scope */ }
  await publishLeadToTelegram(row.id);
  return row.id;
}

// ---- One comment -----------------------------------------------------------------------------------------

/**
 * Classifies one claimed comment and does what its kind needs. Replies wait for a pacing slot (20–90 s apart). A Graph
 * failure is retried with backoff (rate limit, server / network error) or recorded with its reason; it never throws.
 */
async function processComment(commentId: string, context: Context): Promise<Outcome> {
  const db = getDb();
  let comment = await db.instagramComment.findUnique({ where: { commentId } });
  if (!comment || comment.status !== "PENDING") return "skipped";
  const update = async (data: Parameters<typeof db.instagramComment.update>[0]["data"]) => { comment = await db.instagramComment.update({ where: { commentId }, data }); };
  const finish = async (status: "FAILED" | "SKIPPED" | "SENT" | "NOTIFIED", reason: string | null, extra: Parameters<typeof db.instagramComment.update>[0]["data"] = {}) => update({ status, reason, lockedUntil: null, ...extra });
  if (tooOld(comment.createdAt)) { await finish("SKIPPED", "7 kundan eski komment"); return "skipped"; }

  const rule: RuleWithProduct | null = await db.instagramMediaRule.findUnique({ where: { mediaId: comment.mediaId }, include: { product: RULE_PRODUCT, secondProduct: RULE_PRODUCT } });
  if (!comment.kind) {
    const result = await classify(comment, rule);
    await update({ kind: result.kind, classifiedBy: result.by, aiTokens: result.usage.tokens, aiCostUsd: result.usage.costUsd, productId: rule?.product?.id ?? null, productName: rule?.product?.name ?? null });
  }
  const kind = comment.kind as CommentKind;
  const account = context.account;
  const [answered, repliesToday] = await Promise.all([
    db.instagramComment.count({ where: { mediaId: comment.mediaId, fromId: comment.fromId, commentId: { not: commentId }, OR: [{ dmSentAt: { not: null } }, { publicReplyAt: { not: null } }] } }),
    db.instagramComment.count({ where: { publicReplyAt: { gte: tashkentDayStart() } } }),
  ]);
  const action: Action = chooseAction(kind, account, { rule, alreadyAnswered: answered > 0, repliesToday, generalReplyEnabled: account.generalReplyEnabled });

  if (action.type === "skip") { await finish("SKIPPED", action.reason); return "skipped"; }
  if (action.type === "notify") {
    let permalink = rule?.permalink ?? null;
    if (!permalink) permalink = await getMediaPermalink(context.token, comment.mediaId).catch(() => null);
    const sent = await notifyNegative({ commentId, username: comment.username, text: comment.text, permalink, createdAt: comment.createdAt, accountUsername: account.username });
    if (sent) { await finish("NOTIFIED", "Salbiy — adminga yuborildi", { notifiedAt: new Date() }); return "notified"; }
    await finish("FAILED", "Salbiy — Telegram ulangan Super Admin topilmadi yoki xabar ketmadi");
    return "failed";
  }

  // POSITIVE: the AI writes a fresh reply first (no slot is spent when it fails).
  let positive: string | null = null;
  if (action.type === "positive") {
    const recent = (await db.instagramComment.findMany({ where: { kind: "POSITIVE", publicReplyText: { not: null } }, orderBy: { publicReplyAt: "desc" }, take: 20, select: { publicReplyText: true } })).map(row => row.publicReplyText!);
    const written = await writePositiveReply(comment.text, recent);
    if (written) await update({ aiTokens: comment.aiTokens + written.usage.tokens, aiCostUsd: addUsage({ tokens: 0, costUsd: comment.aiCostUsd === null ? null : Number(comment.aiCostUsd) }, written.usage).costUsd });
    if (!written?.reply) { await finish("SKIPPED", written ? "AI mos javob yozmadi" : "AI ishlamadi — javobsiz"); return "skipped"; }
    positive = written.reply;
  }

  // Texts for the DM (PRICE / QUESTION) are checked before a slot is taken.
  let dm: string | null = null;
  if (action.type === "price" || action.type === "question") {
    const template = action.type === "price" ? rule!.dmTemplate : rule?.product ? rule.dmTemplate : account.questionDmTemplate;
    let result = dmFor(template, rule, comment, context);
    if ("error" in result && action.type === "question") result = dmFor(account.questionDmTemplate, rule, comment, context);
    if ("error" in result) {
      if (result.error === "CBU kursi olinmadi" && comment.attempts + 1 < MAX_ATTEMPTS) {
        await update({ attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + backoffMs(comment.attempts + 1)), reason: "CBU kursi olinmadi — qayta urinadi", lockedUntil: null });
        return "retry";
      }
      await finish("FAILED", result.error);
      return "failed";
    }
    dm = result.text;
  }

  // Pacing: wait for the slot while this run has time, else come back later.
  for (;;) {
    const wait = await reserveSlot();
    if (!wait) break;
    if (Date.now() + wait > context.deadline) {
      await update({ nextAttemptAt: new Date(Date.now() + wait), lockedUntil: null });
      return "wait";
    }
    await sleep(wait);
  }

  const reply = action.type === "price" && action.publicReply ? pickVariant(rule!.publicReplyVariants, rule!.publicReplyEnabled ? rule!.publicReplyText || DEFAULT_PUBLIC_REPLY : "")
    : action.type === "question" && action.publicReply ? account.questionReplyText
    : action.type === "general" ? account.generalReplyText
    : action.type === "positive" ? positive : null;
  const publicReply = action.type === "price" && !rule!.publicReplyEnabled ? null : reply?.trim() || null;

  if (dm) {
    // Saved before sending: the echo of this DM may arrive before the API call returns, and must count as automatic.
    await update({ dmText: dm, dmSentAt: new Date() });
    try {
      const sent = await sendPrivateReply(context.token, account.igUserId, commentId, dm);
      await update({ dmText: dm, dmMessageId: sent.message_id ?? null, dmSentAt: new Date(), attempts: { increment: 1 } });
    } catch (error) {
      const info = errorInfo(error), attempts = comment.attempts + 1;
      console.error("Instagram private reply failed", { type: safeType(error) });
      await update({ dmText: null, dmSentAt: null });
      if (isRetryable(info) && attempts < MAX_ATTEMPTS && !tooOld(comment.createdAt, new Date(Date.now() + backoffMs(attempts)))) {
        await update({ attempts, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)), reason: `Qayta urinadi: ${errorReason(info)}`, lockedUntil: null });
        return isRateLimit(info) ? "rate-limited" : "retry";
      }
      await finish("FAILED", errorReason(info), { attempts });
      return "failed";
    }
  }

  let publicError: string | null = null;
  if (publicReply) {
    try {
      const result = await replyToComment(context.token, commentId, publicReply.slice(0, 300));
      await update({ publicReplyId: result.id ?? null, publicReplyText: publicReply, publicReplyAt: new Date() });
    } catch (error) {
      console.error("Instagram public reply failed", { type: safeType(error) });
      publicError = errorReason(errorInfo(error));
      await update({ publicReplyError: publicError });
      if (!dm) {
        // A public-only reply (POSITIVE / general) that failed: retry later if temporary.
        const info = errorInfo(error), attempts = comment.attempts + 1;
        if (isRetryable(info) && attempts < MAX_ATTEMPTS) { await update({ attempts, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)), reason: `Qayta urinadi: ${publicError}`, lockedUntil: null }); return isRateLimit(info) ? "rate-limited" : "retry"; }
        await finish("FAILED", publicError, { attempts });
        return "failed";
      }
    }
  }

  const reason = action.type === "general" ? "Postga mahsulot biriktirilmagan · umumiy javob yozildi"
    : (action.type === "price" || action.type === "question") && !action.publicReply ? "Kunlik limit — faqat Direct" : null;
  await finish("SENT", reason);
  if (action.type === "price" || action.type === "question") {
    try {
      const leadId = await createInstagramLead(comment, rule, action.type === "price" ? "PRICE" : "QUESTION");
      if (leadId) await update({ leadId });
    } catch (error) {
      console.error("Instagram lead failed", { type: safeType(error) });
    }
  }
  return "sent";
}

// ---- Queue runner ----------------------------------------------------------------------------------------

/**
 * Handles due comments oldest first until `budgetMs` runs out. Only one runner works at a time (account.runnerUntil);
 * others return at once — the running one picks up their comments. Stops at a rate-limit answer. Never throws.
 */
export async function processQueue(options: { budgetMs?: number; limit?: number } = {}) {
  const totals = { sent: 0, failed: 0, skipped: 0, notified: 0, retry: 0, waiting: 0, busy: false };
  const db = getDb();
  const started = Date.now(), budget = options.budgetMs ?? 45_000, deadline = started + budget;
  try {
    const lock = await db.instagramAccount.updateMany({ where: { id: ACCOUNT_ID, OR: [{ runnerUntil: null }, { runnerUntil: { lt: new Date() } }] }, data: { runnerUntil: new Date(deadline + 30_000) } });
    if (lock.count !== 1) { totals.busy = true; return totals; }
    try {
      const account = await getInstagramAccount();
      if (!account) return totals;
      const token = accountToken(account);
      if (!token) { console.error("Instagram access unreadable (PASSWORD_VIEW_KEY)"); return totals; }
      const [rate, phone] = await Promise.all([getUsdUzsRate().then(value => value?.rate ?? null).catch(() => null), sitePhone(account)]);
      const context: Context = { account, token, rate, phone, deadline: deadline - 15_000 };
      let handled = 0;
      while (Date.now() < deadline - 15_000 && handled < (options.limit ?? 100)) {
        const next = await db.instagramComment.findFirst({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] }, orderBy: { createdAt: "asc" }, select: { commentId: true } });
        if (!next) {
          // Nothing due now: wait for a comment due within the remaining time (paced replies), else stop.
          const soon = await db.instagramComment.findFirst({ where: { status: "PENDING", nextAttemptAt: { lte: new Date(deadline - 20_000) } }, orderBy: { nextAttemptAt: "asc" }, select: { nextAttemptAt: true } });
          if (!soon) break;
          await sleep(Math.max(500, soon.nextAttemptAt.getTime() - Date.now()));
          continue;
        }
        if (!await claim(next.commentId)) continue;
        handled++;
        const outcome = await processComment(next.commentId, context).catch(async error => {
          console.error("Instagram comment processing failed", { type: safeType(error) });
          await db.instagramComment.update({ where: { commentId: next.commentId }, data: { lockedUntil: null, nextAttemptAt: new Date(Date.now() + backoffMs(1)) } }).catch(() => undefined);
          return "retry" as const;
        });
        if (outcome === "rate-limited") { totals.retry++; break; }
        if (outcome === "wait") { totals.waiting++; break; }
        totals[outcome]++;
      }
    } finally {
      await db.instagramAccount.updateMany({ where: { id: ACCOUNT_ID }, data: { runnerUntil: null } }).catch(() => undefined);
    }
  } catch (error) {
    console.error("Instagram queue failed", { type: safeType(error) });
  }
  return totals;
}

// ---- Catch-up --------------------------------------------------------------------------------------------

export type SyncResult = { ok: true; media: number; found: number; queued: number; skipped: number; duplicates: number; errors: number } | { ok: false; reason: "not-connected" | "unreadable" | "error"; error?: string };

/**
 * Comments the webhook missed: the latest `mediaLimit` posts, their comments of the last `days` days, ingested with the
 * webhook's rules (existing comment ids do nothing). New ones are PENDING and answered by processQueue as usual.
 */
export async function syncMissedComments(options: { days?: number; mediaLimit?: number } = {}): Promise<SyncResult> {
  const days = options.days ?? 7, mediaLimit = options.mediaLimit ?? 25;
  const account = await getInstagramAccount();
  if (!account) return { ok: false, reason: "not-connected" };
  const token = accountToken(account);
  if (!token) return { ok: false, reason: "unreadable" };
  const since = new Date(Date.now() - days * 86_400_000);
  let media;
  try { media = (await listMedia(token, account.igUserId, mediaLimit)).filter(item => item.comments_count !== 0); }
  catch (error) { console.error("Instagram catch-up failed", { type: safeType(error) }); return { ok: false, reason: "error", error: errorReason(errorInfo(error)) }; }
  const batches: MediaComments[] = [];
  let errors = 0;
  for (let index = 0; index < media.length; index += 5) {
    await Promise.all(media.slice(index, index + 5).map(item => listComments(token, item.id, since).then(comments => { batches.push({ mediaId: item.id, comments }); }).catch(error => { errors++; console.error("Instagram comments fetch failed", { type: safeType(error) }); })));
  }
  const result = await ingestFetchedComments(batches, account, prismaStore, { days });
  return { ok: true, media: media.length, found: result.found, queued: result.queued.length, skipped: result.skipped, duplicates: result.duplicates, errors };
}

// ---- Token -----------------------------------------------------------------------------------------------

/** Refreshes the 60-day token when fewer than 20 days are left (and it is older than 24 h, as Meta requires). */
export async function refreshTokenIfDue(force = false) {
  const account = await getInstagramAccount();
  if (!account) return { refreshed: false, reason: "not-connected" };
  const now = Date.now();
  const daysLeft = (account.tokenExpiresAt.getTime() - now) / 86_400_000;
  if (!force && daysLeft > REFRESH_WHEN_DAYS_LEFT) return { refreshed: false, reason: "not-due" };
  if (now - account.tokenRefreshedAt.getTime() < 86_400_000) return { refreshed: false, reason: "too-new" };
  if (account.tokenExpiresAt.getTime() <= now) return { refreshed: false, reason: "expired" };
  const token = accountToken(account);
  if (!token) return { refreshed: false, reason: "unreadable" };
  const fresh = await refreshLongLived(token);
  const tokenEncrypted = encryptToken(fresh.token);
  if (!tokenEncrypted) return { refreshed: false, reason: "no-key" };
  await getDb().instagramAccount.update({ where: { id: ACCOUNT_ID }, data: { tokenEncrypted, tokenExpiresAt: fresh.expiresAt, tokenRefreshedAt: new Date() } });
  return { refreshed: true, reason: "ok" };
}
