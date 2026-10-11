import "server-only";
import type { InstagramAccount } from "@/generated/prisma/client";
import { decryptPassword, encryptPassword } from "@/lib/auth/password-vault";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { getDb } from "@/lib/db";
import { getPublicHomeContent } from "@/lib/home/content";
import { expireDashboard } from "@/lib/referrals/tracking";
import { SITE_URL } from "@/lib/site-url";
import { publishLeadToTelegram } from "@/lib/telegram/service";
import { GraphError, refreshLongLived, replyToComment, sendPrivateReply } from "./graph";
import { ingestWebhook, type IngestStore } from "./ingest";
import { MAX_ATTEMPTS, REFRESH_WHEN_DAYS_LEFT, backoffMs, errorReason, isRateLimit, isRetryable, leadKey, priceSom, productLink, renderTemplate, tooOld, type GraphErrorInfo } from "./rules";

const ACCOUNT_ID = "global";
const LOCK_MS = 2 * 60_000;

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
  async rules(mediaIds) {
    const rows = await getDb().instagramMediaRule.findMany({ where: { mediaId: { in: mediaIds } }, select: { mediaId: true, isActive: true, productId: true, keywords: true } });
    return new Map(rows.map(row => [row.mediaId, row]));
  },
  async insertComment(row) {
    const result = await getDb().instagramComment.createMany({ data: [row], skipDuplicates: true });
    return result.count === 1;
  },
  async insertMessages(rows) {
    await getDb().instagramMessage.createMany({ data: rows, skipDuplicates: true });
  },
};

/** Synchronous part of the webhook: journal rows only (fast). Sending happens in processQueue, after the 200. */
export async function ingestNotification(payload: unknown) {
  const account = await getInstagramAccount();
  if (!account) return null;
  const result = await ingestWebhook(payload, account, prismaStore);
  await getDb().instagramAccount.update({ where: { id: ACCOUNT_ID }, data: { lastWebhookAt: new Date() } }).catch(() => undefined);
  return result;
}

// ---- Queue -----------------------------------------------------------------------------------------------

/** Takes a comment for sending (2-minute lock), so two runs never send the same Private Reply. */
async function claim(commentId: string, now: Date) {
  const { count } = await getDb().instagramComment.updateMany({ where: { commentId, status: "PENDING", nextAttemptAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }, data: { lockedUntil: new Date(now.getTime() + LOCK_MS) } });
  return count === 1;
}

async function sitePhone(account: InstagramAccount) {
  if (account.phone?.trim()) return account.phone.trim();
  const footer = await getPublicHomeContent().then(content => content.footer.phone).catch(() => "");
  return footer && !footer.includes("[") ? footer : "";
}

type Outcome = "sent" | "failed" | "skipped" | "retry" | "rate-limited";

/**
 * Sends the Private Reply for one claimed comment, then (best effort) the public reply and the lead. A failure is either
 * retried with backoff (rate limit, server / network error) or recorded with its reason; it never throws.
 */
async function processComment(commentId: string, account: InstagramAccount, token: string, context: { rate: string | null; phone: string }): Promise<Outcome> {
  const db = getDb();
  const comment = await db.instagramComment.findUnique({ where: { commentId } });
  if (!comment || comment.status !== "PENDING") return "skipped";
  const finish = (status: "FAILED" | "SKIPPED", reason: string) => db.instagramComment.update({ where: { commentId }, data: { status, reason, lockedUntil: null } });
  if (tooOld(comment.createdAt)) { await finish("SKIPPED", "7 kundan eski komment"); return "skipped"; }

  const rule = await db.instagramMediaRule.findUnique({ where: { mediaId: comment.mediaId }, include: { product: { select: { id: true, name: true, slug: true, priceUsd: true, isVisible: true, archivedAt: true } } } });
  if (!rule || !rule.isActive) { await finish("SKIPPED", "Post uchun avto-javob o‘chirilgan"); return "skipped"; }
  const product = rule.product;
  if (!product) { await finish("SKIPPED", "Postga mahsulot biriktirilmagan"); return "skipped"; }
  if (!product.isVisible || product.archivedAt) { await finish("FAILED", "Mahsulot saytda yashirin yoki arxivda"); return "failed"; }
  const price = priceSom(product.priceUsd?.toString(), context.rate);
  if (!price) {
    // No CBU rate yet is temporary; no price in Prays is not.
    if (product.priceUsd && comment.attempts + 1 < MAX_ATTEMPTS) {
      await db.instagramComment.update({ where: { commentId }, data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + backoffMs(comment.attempts + 1)), reason: "CBU kursi olinmadi — qayta urinadi", lockedUntil: null } });
      return "retry";
    }
    await finish("FAILED", product.priceUsd ? "CBU kursi olinmadi" : "Prays'da sotuv narxi yo‘q");
    return "failed";
  }
  const link = productLink(SITE_URL, product.slug, comment.mediaId);
  const text = renderTemplate(rule.dmTemplate, { mahsulot: product.name, narx_som: price, havola: link, telefon: context.phone, username: comment.username });

  try {
    const sent = await sendPrivateReply(token, account.igUserId, commentId, text);
    await db.instagramComment.update({ where: { commentId }, data: { status: "SENT", reason: null, dmMessageId: sent.message_id ?? null, dmSentAt: new Date(), productId: product.id, productName: product.name, attempts: { increment: 1 }, lockedUntil: null } });
  } catch (error) {
    const info = errorInfo(error), attempts = comment.attempts + 1;
    console.error("Instagram private reply failed", { type: safeType(error) });
    if (isRetryable(info) && attempts < MAX_ATTEMPTS && !tooOld(comment.createdAt, new Date(Date.now() + backoffMs(attempts)))) {
      await db.instagramComment.update({ where: { commentId }, data: { attempts, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)), reason: `Qayta urinadi: ${errorReason(info)}`, productId: product.id, productName: product.name, lockedUntil: null } });
      return isRateLimit(info) ? "rate-limited" : "retry";
    }
    await db.instagramComment.update({ where: { commentId }, data: { status: "FAILED", attempts, reason: errorReason(info), productId: product.id, productName: product.name, lockedUntil: null } });
    return "failed";
  }

  if (rule.publicReplyEnabled && rule.publicReplyText.trim()) {
    try {
      const reply = await replyToComment(token, commentId, rule.publicReplyText.trim().slice(0, 300));
      await db.instagramComment.update({ where: { commentId }, data: { publicReplyId: reply.id ?? null } });
    } catch (error) {
      console.error("Instagram public reply failed", { type: safeType(error) });
      await db.instagramComment.update({ where: { commentId }, data: { publicReplyError: errorReason(errorInfo(error)) } }).catch(() => undefined);
    }
  }

  try {
    const leadId = await createInstagramLead({ fromId: comment.fromId, username: comment.username, text: comment.text, product, permalink: rule.permalink, mediaId: comment.mediaId });
    if (leadId) await db.instagramComment.update({ where: { commentId }, data: { leadId } });
  } catch (error) {
    console.error("Instagram lead failed", { type: safeType(error) });
  }
  return "sent";
}

/** BKLead lead for a sent DM; one per person + product (Lead.submissionKey). Returns the lead id (new or existing). */
async function createInstagramLead(input: { fromId: string; username: string | null; text: string; product: { id: string; name: string; slug: string }; permalink: string | null; mediaId: string }) {
  const db = getDb(), submissionKey = leadKey(input.fromId, input.product.id);
  const existing = await db.lead.findUnique({ where: { submissionKey }, select: { id: true } });
  if (existing) return existing.id;
  const handle = input.username ? `@${input.username}` : `Instagram ${input.fromId}`;
  const notes = [`Instagram komment: «${input.text.slice(0, 500)}»`, `Instagram: ${input.username ? `https://instagram.com/${input.username}` : handle}`, `Post: ${input.permalink ?? input.mediaId}`, "Narx Direct'ga avtomatik yuborildi."].join("\n");
  const created = await db.lead.createManyAndReturn({ data: [{ submissionKey, customerName: handle, requestType: "Instagram: narx so‘rovi", product: input.product.name, productId: input.product.id, productSlug: input.product.slug, notes, source: "INSTAGRAM" }], skipDuplicates: true, select: { id: true } });
  const row = created[0];
  if (!row) return (await db.lead.findUnique({ where: { submissionKey }, select: { id: true } }))?.id ?? null;
  await db.leadActivity.create({ data: { leadId: row.id, type: "LEAD_CREATED" } });
  try { expireDashboard(); } catch { /* outside a request scope */ }
  await publishLeadToTelegram(row.id);
  return row.id;
}

/** "Direct'ga yozing…" public replies for price questions on posts without a product. */
async function sendGeneralReplies(commentIds: string[], account: InstagramAccount, token: string) {
  for (const commentId of commentIds) {
    try {
      const reply = await replyToComment(token, commentId, account.generalReplyText.trim().slice(0, 300));
      await getDb().instagramComment.update({ where: { commentId }, data: { publicReplyId: reply.id ?? null, reason: "Postga mahsulot biriktirilmagan · umumiy javob yozildi" } });
    } catch (error) {
      console.error("Instagram general reply failed", { type: safeType(error) });
      await getDb().instagramComment.update({ where: { commentId }, data: { publicReplyError: errorReason(errorInfo(error)) } }).catch(() => undefined);
      if (isRateLimit(errorInfo(error))) break;
    }
  }
}

/**
 * Sends due Private Replies (oldest first, at most `limit`). Stops at the first rate-limit answer — the rest waits for its
 * backoff. Never throws: a failure here must not affect the site or the webhook.
 */
export async function processQueue(options: { limit?: number; generalReplies?: string[] } = {}) {
  const totals = { sent: 0, failed: 0, skipped: 0, retry: 0 };
  try {
    const account = await getInstagramAccount();
    if (!account) return totals;
    const token = accountToken(account);
    if (!token) { console.error("Instagram token unreadable (PASSWORD_VIEW_KEY)"); return totals; }
    if (options.generalReplies?.length && account.generalReplyEnabled && account.generalReplyText.trim()) await sendGeneralReplies(options.generalReplies, account, token);
    const now = new Date();
    const due = await getDb().instagramComment.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: now } }, orderBy: { createdAt: "asc" }, take: options.limit ?? 20, select: { commentId: true } });
    if (!due.length) return totals;
    const [rate, phone] = await Promise.all([getUsdUzsRate().then(value => value?.rate ?? null).catch(() => null), sitePhone(account)]);
    for (const { commentId } of due) {
      if (!await claim(commentId, now)) continue;
      const outcome = await processComment(commentId, account, token, { rate, phone }).catch(async error => {
        console.error("Instagram comment processing failed", { type: safeType(error) });
        await getDb().instagramComment.update({ where: { commentId }, data: { lockedUntil: null, nextAttemptAt: new Date(Date.now() + backoffMs(1)) } }).catch(() => undefined);
        return "retry" as const;
      });
      if (outcome === "rate-limited") { totals.retry++; break; }
      totals[outcome]++;
    }
  } catch (error) {
    console.error("Instagram queue failed", { type: safeType(error) });
  }
  return totals;
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
