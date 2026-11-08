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
import { addUsage, classifyEshikmaster, classifyWithAi, heatPumpChat, writePositiveReply, type AiUsage } from "./ai";
import { DEFAULT_PUBLIC_REPLY, isEshikmaster, type CommentKind } from "./constants";
import { GraphError, getMediaPermalink, listComments, listMedia, refreshLongLived, replyToComment, sendPrivateReply } from "./graph";
import { ingestFetchedComments, ingestWebhook, type IngestStore, type MediaComments } from "./ingest";
import { afterDirectEvents, recordDirectEvents } from "./direct";
import { directLink } from "./direct-rules";
import { negativeText, notifyNegative } from "./telegram";
import { bindThread, buildCalc, coolerCommentTexts, heatPumpAiEnabled, sendHeatPumpTelegram, classifyHeatPump, handleHeatPumpDirect, openThread, upsertHeatPumpLead } from "./heat-pump-bot";
import { askText, coolerAction, coolerTons } from "./cooler";
import { heatPumpAction, heatPumpOutgoing, heatPumpReplyAnswered, extractHeight, heatPumpGate, isHeatPumpAccount, langOf, specialistNotice, texts, type HeatPumpIntent, type Lang } from "./heat-pump";
import { MAX_ATTEMPTS, REFRESH_WHEN_DAYS_LEFT, aiReplyProblem, tooSimilar, accountBrand, accountName, backoffMs, chooseAction, classifyByKeywords, errorReason, isRateLimit, isRetryable, kindFromAsks, leadKey, parseWebhook, pickVariant, priceSom, productLink, randomGapMs, renderTemplate, tashkentDayStart, tooOld, type Action, type GraphErrorInfo } from "./rules";

/** The account connected before multi-account (Buyuk Karavan): its rows were migrated with this id. */
export const FIRST_ACCOUNT_ID = "global";
const LOCK_MS = 3 * 60_000;

const safeType = (error: unknown) => error instanceof GraphError ? `GraphError ${error.info.code ?? error.info.status}` : error instanceof Error ? error.name : "UnknownError";
const errorInfo = (error: unknown): GraphErrorInfo => error instanceof GraphError ? error.info : { status: 0, message: error instanceof Error ? error.name : "Xato" };

/** Connected accounts (with a token), the first connected first; `all` adds disconnected ones (Sozlamalar). */
export const listInstagramAccounts = (all = false) => getDb().instagramAccount.findMany({ where: all ? {} : { tokenEncrypted: { not: "" } }, orderBy: { createdAt: "asc" } });
/** One account by id; without an id (or an unknown one) the first connected. */
export async function getInstagramAccount(id?: string | null) {
  const db = getDb();
  return (id ? await db.instagramAccount.findUnique({ where: { id } }) : null) ?? db.instagramAccount.findFirst({ orderBy: { createdAt: "asc" } });
}
export { accountBrand, accountName } from "./rules";

/** The decrypted access token, or null (no account / PASSWORD_VIEW_KEY missing or changed). Never logged. */
export function accountToken(account: Pick<InstagramAccount, "tokenEncrypted">) {
  try { return decryptPassword(account.tokenEncrypted); } catch { return null; }
}
export const encryptToken = (token: string) => encryptPassword(token);

// ---- Webhook ---------------------------------------------------------------------------------------------

/** Comment rows of one account (the row carries its accountId). */
const storeFor = (accountId: string): IngestStore => ({
  async insertComment(row) {
    const result = await getDb().instagramComment.createMany({ data: [{ ...row, accountId }], skipDuplicates: true });
    return result.count === 1;
  },
  // Teplonasos / xolodilnik posts only, and only on the "global" account.
  ...(isHeatPumpAccount(accountId) ? { allowsReply: async (mediaId: string) => !!await getDb().instagramMediaRule.findFirst({ where: { mediaId, accountId, OR: [{ heatPump: true }, { cooler: true }] }, select: { mediaId: true } }) } : {}),
});

/**
 * Synchronous part of the webhook: comment rows and Direct conversations (DB only, fast), for every connected account
 * named in the notification (entry.id = igUserId); entries of an unknown account are ignored. Classifying / replying to
 * comments and the Telegram side of Direct run in `afterNotification`, after the 200.
 */
export async function ingestNotification(payload: unknown) {
  const { comments, messages } = parseWebhook(payload);
  const ids = [...new Set([...comments, ...messages].map(event => event.accountId))];
  if (!ids.length) return null;
  // Disconnected accounts (token wiped) are ignored, as before when the row was deleted.
  const accounts = await getDb().instagramAccount.findMany({ where: { igUserId: { in: ids }, tokenEncrypted: { not: "" } } });
  if (!accounts.length) return null;
  const results = [];
  for (const account of accounts) {
    const result = await ingestWebhook(payload, account, storeFor(account.id));
    // Direct off (e.g. @eshikmaster): no conversations, cards or Direct leads.
    const direct = account.directEnabled ? await recordDirectEvents(result.direct, account) : { touched: [], created: [], phones: [] };
    await getDb().instagramAccount.update({ where: { id: account.id }, data: { lastWebhookAt: new Date() } }).catch(() => undefined);
    results.push({ queued: result.queued, direct, events: result.direct, account });
  }
  return results;
}

/** Background part of the webhook, each account on its own (own queue, pacing and lock). Never throws. */
export async function afterNotification(results: NonNullable<Awaited<ReturnType<typeof ingestNotification>>>) {
  await Promise.all(results.map(async result => {
    if (isHeatPumpAccount(result.account.id) && result.events.length) await handleHeatPumpDirect(result.events, result.account, accountToken(result.account));
    if (result.direct.touched.length || result.direct.phones.length) await afterDirectEvents(result.direct, result.account, accountToken(result.account)).catch(error => console.error("Instagram Direct failed", { type: safeType(error) }));
    if (result.queued.length) await processQueue({ accountId: result.account.id, budgetMs: 240_000 });
  }));
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
 * then 8–25 s later), else how many ms to wait.
 */
async function reserveSlot(accountId: string) {
  const now = new Date();
  const { count } = await getDb().instagramAccount.updateMany({ where: { id: accountId, OR: [{ nextActionAt: null }, { nextActionAt: { lte: now } }] }, data: { nextActionAt: new Date(now.getTime() + randomGapMs()) } });
  if (count === 1) return 0;
  const account = await getDb().instagramAccount.findUnique({ where: { id: accountId }, select: { nextActionAt: true } });
  return Math.max(1_000, (account?.nextActionAt?.getTime() ?? now.getTime()) - now.getTime());
}

async function sitePhone(account: InstagramAccount) {
  if (account.phone?.trim()) return account.phone.trim();
  // The site footer is Buyuk Karavan's: never another brand's phone.
  if (account.id !== FIRST_ACCOUNT_ID) return "";
  const footer = await getPublicHomeContent().then(content => content.footer.phone).catch(() => "");
  return footer && !footer.includes("[") ? footer : "";
}

type RuleProduct = { id: string; name: string; slug: string; priceUsd: { toString(): string } | null; isVisible: boolean; archivedAt: Date | null };
type RuleWithProduct = InstagramMediaRule & { product: RuleProduct | null; secondProduct?: RuleProduct | null };
const RULE_PRODUCT = { select: { id: true, name: true, slug: true, priceUsd: true, isVisible: true, archivedAt: true } } as const;
type Context = { account: InstagramAccount; token: string; rate: string | null; phone: string; deadline: number };
type Outcome = "sent" | "failed" | "skipped" | "notified" | "retry" | "rate-limited" | "wait";

/** Keywords first; when they are unclear the AI decides; without the AI the keyword fallback, else UNKNOWN (no reply). */
async function classify(comment: InstagramComment, rule: RuleWithProduct | null, account: InstagramAccount): Promise<{ kind: CommentKind; by: string; usage: AiUsage; m2?: number | null; kw?: number | null; intent?: HeatPumpIntent | null; reply?: string; extra?: string; lang?: Lang; specialist?: boolean }> {
  // Xolodilnik post ("global" only): a tonnage starts the Direct chat; anything else is classified as usual.
  if (coolerTons(rule, account.id, comment.text)) return { kind: "COOLER", by: "KEYWORD", usage: { tokens: 0, costUsd: 0 } };
  // Teplonasos post: only the "global" account (@eshikmaster never gets this flow).
  if (rule?.heatPump && isHeatPumpAccount(account.id)) {
    // AI on: the person's earlier comments on this post go with it (context for "450" → "200" → "onamga ham").
    const aiFirst = await heatPumpAiEnabled();
    const history = aiFirst ? (await getDb().instagramComment.findMany({ where: { mediaId: comment.mediaId, fromId: comment.fromId, commentId: { not: comment.commentId } }, orderBy: { createdAt: "asc" }, take: 5, select: { text: true } })).map(row => row.text) : [];
    const { result, by, usage, reply, extra, lang, specialist } = await classifyHeatPump(comment.text, history, aiFirst).catch(error => {
      console.error("Instagram heat pump parse failed", { commentId: comment.commentId, type: safeType(error) });
      return { result: null, by: "PARSE_FAILED", usage: { tokens: 0, costUsd: 0 }, reply: undefined, extra: undefined, lang: undefined, specialist: undefined };
    });
    // Nothing on a teplonasos post stays silent: not understood → the friendly reply.
    return { kind: result?.kind ?? "POSITIVE", by, usage, reply, extra, lang, specialist, ...(result?.kind === "HEAT_PUMP" ? { m2: result.m2, kw: result.kw ?? null, intent: result.intent } : {}) };
  }
  // @eshikmaster: every comment goes to the AI; the keywords only when the AI does not answer.
  if (isEshikmaster(account)) {
    const ai = await classifyEshikmaster(comment.text);
    if (ai) return { kind: ai.kind, by: "AI", usage: ai.usage, reply: ai.reply };
    const fallback = classifyByKeywords(comment.text, rule?.keywords ?? [], { contact: account.contactRepliesEnabled, asks: true });
    return { kind: fallback.definite ?? fallback.fallback ?? "UNKNOWN", by: "KEYWORD_FALLBACK", usage: { tokens: 0, costUsd: 0 } };
  }
  const keywords = classifyByKeywords(comment.text, rule?.keywords ?? [], { contact: account.contactRepliesEnabled, asks: account.aiReplyAll });
  // aiReplyAll: a keyword QUESTION still goes to the AI, which may find an address / phone / price ask.
  if (keywords.definite && !(account.aiReplyAll && keywords.definite === "QUESTION")) return { kind: keywords.definite, by: "KEYWORD", usage: { tokens: 0, costUsd: 0 } };
  const ai = await classifyWithAi(comment.text, accountBrand(account), account.aiReplyAll);
  if (ai) return { kind: (ai.kind === "QUESTION" && kindFromAsks(ai.asks)) || ai.kind, by: "AI", usage: ai.usage };
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
  const { account } = context;
  return { text: renderTemplate(template, { mahsulot: product?.name ?? "", narx_som: price, havola: product ? productLink(SITE_URL, product.slug, comment.mediaId) : "", telefon: context.phone, username: comment.username, second, contact: { manzil: account.address, moljal: account.landmark, xarita: account.mapLink, ishVaqti: account.workHours } }) };
}

/** BKLead lead; one per person + product (or + post when there is no product). Returns the lead id (new or existing). */
async function createInstagramLead(comment: InstagramComment, rule: RuleWithProduct | null, kind: "PRICE" | "QUESTION", account: InstagramAccount) {
  const db = getDb(), product = rule?.product ?? null;
  const submissionKey = leadKey(comment.fromId, product?.id ?? `post:${comment.mediaId}`);
  const existing = await db.lead.findUnique({ where: { submissionKey }, select: { id: true } });
  if (existing) return existing.id;
  const handle = comment.username ? `@${comment.username}` : `Instagram ${comment.fromId}`;
  const notes = [`Instagram komment (@${account.username}): «${comment.text.slice(0, 500)}»`, `Instagram: ${comment.username ? `https://instagram.com/${comment.username}` : handle}`, `Post: ${rule?.permalink ?? comment.mediaId}`, kind === "PRICE" ? "Narx Direct'ga avtomatik yuborildi." : "Savol: Direct'ga avtomatik javob yuborildi, mutaxassis bog‘lansin."].join("\n");
  const created = await db.lead.createManyAndReturn({ data: [{ submissionKey, customerName: handle, requestType: kind === "PRICE" ? "Instagram: narx so‘rovi" : "Instagram: savol", product: product?.name ?? null, productId: product?.id ?? null, productSlug: product?.slug ?? null, notes, source: "INSTAGRAM", instagramAccountId: account.id }], skipDuplicates: true, select: { id: true } });
  const row = created[0];
  if (!row) return (await db.lead.findUnique({ where: { submissionKey }, select: { id: true } }))?.id ?? null;
  await db.leadActivity.create({ data: { leadId: row.id, type: "LEAD_CREATED" } });
  try { expireDashboard(); } catch { /* outside a request scope */ }
  await publishLeadToTelegram(row.id);
  return row.id;
}

// ---- One comment -----------------------------------------------------------------------------------------

/**
 * Classifies one claimed comment and does what its kind needs. Replies wait for a pacing slot (8–25 s apart). A Graph
 * failure is retried with backoff (rate limit, server / network error) or recorded with its reason; it never throws.
 */
async function processComment(commentId: string, context: Context): Promise<Outcome> {
  const db = getDb();
  let comment = await db.instagramComment.findUnique({ where: { commentId } });
  if (!comment || comment.status !== "PENDING") return "skipped";
  const update = async (data: Parameters<typeof db.instagramComment.update>[0]["data"]) => { comment = await db.instagramComment.update({ where: { commentId }, data }); };
  const finish = async (status: "FAILED" | "SKIPPED" | "SENT" | "NOTIFIED", reason: string | null, extra: Parameters<typeof db.instagramComment.update>[0]["data"] = {}) => {
    // Why a comment got no reply (parse_failed = its kind / m² was not understood).
    if (status === "SKIPPED" || status === "FAILED") console.info("Instagram comment unanswered", { commentId, code: comment?.kind === "UNKNOWN" ? "parse_failed" : status.toLowerCase(), reason });
    return update({ status, reason, lockedUntil: null, ...extra });
  };
  if (tooOld(comment.createdAt)) { await finish("SKIPPED", "7 kundan eski komment"); return "skipped"; }

  const rule: RuleWithProduct | null = await db.instagramMediaRule.findUnique({ where: { mediaId: comment.mediaId }, include: { product: RULE_PRODUCT, secondProduct: RULE_PRODUCT } });
  // @eshikmaster: the reply written together with the classification (not kept for a retry, then it is written anew).
  let classifiedReply = "", classifiedExtra = "", classifiedLang: Lang | null = null, classifiedSpecialist = false;
  if (!comment.kind) {
    const result = await classify(comment, rule, context.account);
    classifiedReply = result.reply ?? ""; classifiedExtra = result.extra ?? ""; classifiedLang = result.lang ?? null; classifiedSpecialist = !!result.specialist;
    await update({ heatPumpKw: result.kw ?? null, kind: result.kind, classifiedBy: result.by, aiTokens: result.usage.tokens, aiCostUsd: result.usage.costUsd, productId: rule?.product?.id ?? null, productName: rule?.product?.name ?? null, heatPumpM2: result.m2 ?? null, heatPumpIntent: result.intent ?? null });
  }
  const kind = comment.kind as CommentKind;
  const account = context.account;
  if (comment.parentId && kind !== "COOLER" && !heatPumpReplyAnswered(kind, comment.heatPumpIntent, !!rule?.heatPump && isHeatPumpAccount(account.id))) { await finish("SKIPPED", "Javob-komment (reply) — javob berilmaydi"); return "skipped"; }
  const [answeredRows, repliesToday, calcs] = await Promise.all([
    db.instagramComment.findMany({ where: { mediaId: comment.mediaId, fromId: comment.fromId, commentId: { not: commentId }, OR: [{ dmSentAt: { not: null } }, { publicReplyAt: { not: null } }] }, select: { text: true, dmSentAt: true, publicReplyAt: true } }),
    db.instagramComment.count({ where: { accountId: account.id, publicReplyAt: { gte: tashkentDayStart() } } }),
    // Teplonasos: the m² / kW calculations this person already got on this post (a repeat is silent, 5 per 24 h together).
    kind === "HEAT_PUMP" ? db.instagramComment.findMany({ where: { mediaId: comment.mediaId, fromId: comment.fromId, commentId: { not: commentId }, heatPumpIntent: { in: ["calc", "kw"] }, dmSentAt: { not: null } }, select: { heatPumpM2: true, heatPumpKw: true, heatPumpIntent: true, dmSentAt: true } }) : [],
  ]);
  const today = calcs.filter(row => row.dmSentAt!.getTime() > Date.now() - 86_400_000).length;
  const calc = comment.heatPumpIntent === "calc" && comment.heatPumpM2 ? { m2: comment.heatPumpM2, previous: calcs.filter(row => row.heatPumpIntent === "calc").map(row => row.heatPumpM2 ?? 0), today }
    : comment.heatPumpIntent === "kw" && comment.heatPumpKw ? { m2: comment.heatPumpKw, previous: calcs.filter(row => row.heatPumpIntent === "kw").map(row => row.heatPumpKw ?? 0), today, unit: "kW" as const } : undefined;
  const heatPost = !!rule?.heatPump && isHeatPumpAccount(account.id), heatPump = kind === "HEAT_PUMP" && heatPost;
  const friendly = heatPost ? texts(langOf(comment.text)).friendly : null;
  if (kind === "HEAT_PUMP" && !heatPump) { await finish("SKIPPED", "Teplonasos posti emas"); return "skipped"; }
  // Teplonasos post: every new comment gets its own answer (no "one per person"); same text again / 8 in 24 h → silent.
  const gate = heatPost && kind !== "NEGATIVE" ? heatPumpGate(comment.text, answeredRows.map(row => ({ text: row.text, at: (row.dmSentAt ?? row.publicReplyAt)! }))) : null;
  if (gate) { await finish("SKIPPED", gate); return "skipped"; }
  const answered = heatPost ? 0 : answeredRows.length;
  const action: Action | ReturnType<typeof heatPumpAction> | ReturnType<typeof coolerAction> = kind === "COOLER" ? coolerAction(rule, answered > 0, repliesToday < account.dailyReplyLimit) : heatPump ? heatPumpAction(rule, answered > 0, repliesToday < account.dailyReplyLimit, calc) : chooseAction(kind, heatPost ? { ...account, positiveEnabled: true } : account, { rule, alreadyAnswered: answered > 0, repliesToday, generalReplyEnabled: account.generalReplyEnabled });

  if (action.type === "skip") { await finish("SKIPPED", action.reason); return "skipped"; }
  if (action.type === "notify") {
    let permalink = rule?.permalink ?? null;
    if (!permalink) permalink = await getMediaPermalink(context.token, comment.mediaId).catch(() => null);
    // Teplonasos post: only the private chat of +998 91 637 77 77.
    const sent = heatPost ? (await sendHeatPumpTelegram(negativeText({ username: comment.username, text: comment.text, permalink, createdAt: comment.createdAt, accountName: accountName(account) })) ? 1 : 0) : await notifyNegative({ commentId, username: comment.username, text: comment.text, permalink, createdAt: comment.createdAt, accountUsername: account.username, accountName: accountName(account), groupChatId: account.negativeChatId });
    if (sent) { await finish("NOTIFIED", "Salbiy — adminga yuborildi", { notifiedAt: new Date() }); return "notified"; }
    await finish("FAILED", "Salbiy — Telegram ulangan Super Admin topilmadi yoki xabar ketmadi");
    return "failed";
  }

  // POSITIVE: the AI writes a fresh reply first (no slot is spent when it fails).
  let positive: string | null = null;
  if (action.type === "positive") {
    const recent = (await db.instagramComment.findMany({ where: { accountId: account.id, kind: "POSITIVE", publicReplyText: { not: null } }, orderBy: { publicReplyAt: "desc" }, take: 20, select: { publicReplyText: true } })).map(row => row.publicReplyText!);
    // Teplonasos AI reply was already checked (safeAiText: emoji-only praise is fine there).
    const ready = classifiedReply && (heatPost || !aiReplyProblem(classifiedReply)) && !tooSimilar(classifiedReply, recent) ? { reply: classifiedReply, usage: { tokens: 0, costUsd: 0 }, reason: "" } : null;
    const written = ready ?? await writePositiveReply(comment.text, recent, accountBrand(account), { prompt: account.aiPrompt, relaxed: account.aiReplyAll, simpleThanks: isEshikmaster(account) });
    if (written) await update({ aiTokens: comment.aiTokens + written.usage.tokens, aiCostUsd: addUsage({ tokens: 0, costUsd: comment.aiCostUsd === null ? null : Number(comment.aiCostUsd) }, written.usage).costUsd });
    if (!written?.reply && !friendly) { await finish("SKIPPED", written ? `AI mos javob yozmadi: ${written.reason}` : "AI ishlamadi — javobsiz"); return "skipped"; }
    positive = written?.reply || friendly;
  }

  // Texts for the DM (PRICE / QUESTION / contact) are checked before a slot is taken. PRICE without a product: the post's
  // price text, else the account's "no price" DM.
  let dm: string | null = null, heatReply: string | null = null, heatSummary: string | null = null;
  const heatLang = classifiedLang ?? langOf(comment.text);
  if (action.type === "heatpump" && "limit" in action) heatReply = texts(heatLang).calcLimit;
  else if (action.type === "heatpump") {
    const intent = comment.heatPumpIntent as HeatPumpIntent, m2 = comment.heatPumpM2, kw = comment.heatPumpKw, lang = heatLang;
    try {
      const calc = intent === "calc" && m2 ? await buildCalc(m2, context.rate, lang) : intent === "kw" && kw ? await buildCalc(0, context.rate, lang, kw) : null;
      // The AI-first answer came with the classification; otherwise (AI off / retry) the Direct AI writes one.
      const answer = intent === "question" && !classifiedExtra ? await heatPumpChat(comment.text, null) : null;
      if (answer) await update({ aiTokens: comment.aiTokens + answer.usage.tokens, aiCostUsd: addUsage({ tokens: 0, costUsd: comment.aiCostUsd === null ? null : Number(comment.aiCostUsd) }, answer.usage).costUsd });
      // A ceiling over 3 m: the calculation says the specialist will count exactly.
      const tall = calc && (extractHeight(comment.text) ?? 0) > 3 ? texts(lang).tall : "";
      const out = heatPumpOutgoing(intent, { m2, kw, calc: calc?.text, answer: classifiedExtra || answer?.reply, extra: [tall, classifiedExtra].filter(Boolean).join("\n") }, lang);
      dm = out.dm; heatReply = out.reply; heatSummary = calc?.summary ?? null;
    } catch (error) {
      console.error("Instagram heat pump calc failed", { commentId, type: safeType(error) });
      heatReply = friendly;
    }
  }
  const tons = action.type === "cooler" ? coolerTons(rule, account.id, comment.text) : null;
  if (action.type === "cooler") {
    if (!tons) { await finish("SKIPPED", "Xolodilnik posti emas yoki tonna topilmadi"); return "skipped"; }
    const texts = await coolerCommentTexts(langOf(comment.text));
    dm = askText(texts, tons); heatReply = texts.reply;
  }
  if (action.type === "price" || action.type === "question" || action.type === "contact") {
    const contactTemplates = { PHONE: account.phoneDmTemplate, ADDRESS: account.addressDmTemplate, HOURS: account.hoursDmTemplate };
    const template = action.type === "contact" ? contactTemplates[action.kind]
      // aiReplyAll accounts (@eshikmaster): price always gets the account's fixed DM, never the post's product / price text.
      : action.type === "price" ? (rule?.productId && !account.aiReplyAll ? rule.dmTemplate : (!account.aiReplyAll && rule?.priceText?.trim()) || account.noPriceDmTemplate || "")
      : rule?.product ? rule.dmTemplate : account.questionDmTemplate;
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
    const wait = await reserveSlot(account.id);
    if (!wait) break;
    if (Date.now() + wait > context.deadline) {
      await update({ nextAttemptAt: new Date(Date.now() + wait), lockedUntil: null });
      return "wait";
    }
    await sleep(wait);
  }

  const reply = action.type === "price" && rule?.productId && !account.aiReplyAll && action.publicReply ? pickVariant(rule?.publicReplyVariants ?? [], rule && !rule.publicReplyEnabled ? "" : rule?.publicReplyText || DEFAULT_PUBLIC_REPLY)
    : (action.type === "question" || action.type === "contact" || (action.type === "price" && (!rule?.productId || account.aiReplyAll))) && action.publicReply ? account.questionReplyText
    : action.type === "general" ? account.generalReplyText
    : action.type === "positive" ? positive
    : (action.type === "heatpump" || action.type === "cooler") && action.publicReply ? heatReply : null;
  let publicReply = action.type === "price" && rule && !rule.publicReplyEnabled ? null : reply?.trim() || null, dmFailed: string | null = null;

  // Teplonasos: the thread is marked before the DM goes out (the customer's answer may come at once).
  // Xolodilnik uses the same thread (flow "cooler"), so the teplonasos Direct handler answers it.
  let thread = dm && (action.type === "heatpump" || tons) ? await openThread({ accountId: account.id, igsid: comment.fromId, mediaId: comment.mediaId, username: comment.username, dm, m2: comment.heatPumpM2, summary: heatSummary, tons: tons ?? undefined }) : null;
  if (dm) {
    // Saved before sending: the echo of this DM may arrive before the API call returns, and must count as automatic.
    await update({ dmText: dm, dmSentAt: new Date() });
    try {
      const sent = await sendPrivateReply(context.token, account.igUserId, commentId, dm);
      await update({ dmText: dm, dmMessageId: sent.message_id ?? null, dmSentAt: new Date(), attempts: { increment: 1 } });
      if (thread) thread = await bindThread(thread.id, account.id, comment.fromId, sent).catch(error => { console.error("Instagram heat pump thread bind failed", { type: safeType(error) }); return thread; });
    } catch (error) {
      const info = errorInfo(error), attempts = comment.attempts + 1;
      console.error("Instagram private reply failed", { type: safeType(error) });
      await update({ dmText: null, dmSentAt: null });
      if (isRetryable(info) && attempts < MAX_ATTEMPTS && !tooOld(comment.createdAt, new Date(Date.now() + backoffMs(attempts)))) {
        await update({ attempts, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)), reason: `Qayta urinadi: ${errorReason(info)}`, lockedUntil: null });
        return isRateLimit(info) ? "rate-limited" : "retry";
      }
      // Teplonasos: the Direct did not go out, the comment still gets the friendly public reply.
      if (action.type !== "heatpump" || !publicReply) { await finish("FAILED", errorReason(info), { attempts }); return "failed"; }
      dmFailed = errorReason(info);
      console.error("Instagram heat pump Direct failed, friendly reply instead", { commentId, reason: dmFailed });
      publicReply = friendly;
      dm = null;
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

  const reason = dmFailed ? `Direct ketmadi (${dmFailed}) — do‘stona javob yozildi` : action.type === "general" ? "Postga mahsulot biriktirilmagan · umumiy javob yozildi"
    : action.type === "heatpump" && "limit" in action ? "Sutkalik 5 ta hisob — mutaxassis telefoni yozildi"
    : action.type === "heatpump" && comment.heatPumpIntent === "other" ? "Mavzudan tashqari — call-center"
    : (action.type === "price" || action.type === "question" || action.type === "contact" || action.type === "heatpump" || action.type === "cooler") && !action.publicReply ? "Kunlik limit — faqat Direct" : null;
  await finish("SENT", reason);
  // A comment question no fact answers: the specialist is told in the teplonasos Telegram chat.
  if (classifiedSpecialist && dm && action.type === "heatpump") await sendHeatPumpTelegram(specialistNotice({ username: comment.username, igsid: comment.fromId, question: comment.text, calc: null, link: directLink(comment.username) })).catch(error => console.error("Instagram heat pump specialist notice failed", { type: safeType(error) }));
  // Teplonasos lead: m² written or price asked.
  if (account.leadsEnabled && action.type === "heatpump" && dm && (comment.heatPumpIntent === "calc" || comment.heatPumpIntent === "ask")) {
    try {
      const saved = thread && await getDb().heatPumpThread.findUnique({ where: { id: thread.id } });
      const leadId = saved && await upsertHeatPumpLead(saved, account, comment.text);
      if (leadId) { await update({ leadId }); await getDb().heatPumpThread.update({ where: { id: saved.id }, data: { leadId } }); }
    } catch (error) {
      console.error("Instagram heat pump lead failed", { type: safeType(error) });
    }
  }
  if (account.leadsEnabled && (action.type === "price" || action.type === "question" || action.type === "contact")) {
    try {
      const leadId = await createInstagramLead(comment, rule, action.type === "price" ? "PRICE" : "QUESTION", account);
      if (leadId) await update({ leadId });
    } catch (error) {
      console.error("Instagram lead failed", { type: safeType(error) });
    }
  }
  return "sent";
}

// ---- Queue runner ----------------------------------------------------------------------------------------

type QueueTotals = { sent: number; failed: number; skipped: number; notified: number; retry: number; waiting: number; busy: boolean; idle: boolean };

/**
 * Without `accountId`: every account's queue at the same time (each with its own pacing and lock), totals summed.
 * With it: that account's due comments oldest first until `budgetMs` runs out. Only one runner per account works at a
 * time (account.runnerUntil); others return at once — the running one picks up their comments. Stops at a rate-limit
 * answer. Never throws.
 */
export async function processQueue(options: { accountId?: string; budgetMs?: number; limit?: number } = {}): Promise<QueueTotals> {
  if (!options.accountId) {
    const accounts = await listInstagramAccounts().catch(() => []);
    const all = await Promise.all(accounts.map(account => processQueue({ ...options, accountId: account.id })));
    const sum = (key: "sent" | "failed" | "skipped" | "notified" | "retry" | "waiting") => all.reduce((total, item) => total + item[key], 0);
    return { sent: sum("sent"), failed: sum("failed"), skipped: sum("skipped"), notified: sum("notified"), retry: sum("retry"), waiting: sum("waiting"), busy: all.some(item => item.busy), idle: all.every(item => item.idle) };
  }
  const accountId = options.accountId;
  const totals: QueueTotals = { sent: 0, failed: 0, skipped: 0, notified: 0, retry: 0, waiting: 0, busy: false, idle: false };
  const db = getDb();
  const started = Date.now(), budget = options.budgetMs ?? 45_000, deadline = started + budget;
  try {
    // Nothing due within this run: return before the lock, the CBU rate and the phone lookup.
    const due = await db.instagramComment.findFirst({ where: { accountId, status: "PENDING", nextAttemptAt: { lte: new Date(deadline - 20_000) } }, select: { commentId: true } });
    if (!due) { totals.idle = true; return totals; }
    const lock = await db.instagramAccount.updateMany({ where: { id: accountId, OR: [{ runnerUntil: null }, { runnerUntil: { lt: new Date() } }] }, data: { runnerUntil: new Date(deadline + 30_000) } });
    if (lock.count !== 1) { totals.busy = true; return totals; }
    try {
      const account = await db.instagramAccount.findUnique({ where: { id: accountId } });
      if (!account) return totals;
      const token = accountToken(account);
      if (!token) { console.error("Instagram access unreadable (PASSWORD_VIEW_KEY)"); return totals; }
      const [rate, phone] = await Promise.all([getUsdUzsRate().then(value => value?.rate ?? null).catch(() => null), sitePhone(account)]);
      const context: Context = { account, token, rate, phone, deadline: deadline - 15_000 };
      let handled = 0;
      while (Date.now() < deadline - 15_000 && handled < (options.limit ?? 100)) {
        const next = await db.instagramComment.findFirst({ where: { accountId, status: "PENDING", nextAttemptAt: { lte: new Date() }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] }, orderBy: { createdAt: "asc" }, select: { commentId: true } });
        if (!next) {
          // Nothing due now: wait for a comment due within the remaining time (paced replies), else stop.
          const soon = await db.instagramComment.findFirst({ where: { accountId, status: "PENDING", nextAttemptAt: { lte: new Date(deadline - 20_000) } }, orderBy: { nextAttemptAt: "asc" }, select: { nextAttemptAt: true } });
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
      await db.instagramAccount.updateMany({ where: { id: accountId }, data: { runnerUntil: null } }).catch(() => undefined);
    }
  } catch (error) {
    console.error("Instagram queue failed", { type: safeType(error) });
  }
  return totals;
}

// ---- Catch-up --------------------------------------------------------------------------------------------

export type SyncResult = { ok: true; media: number; found: number; queued: number; skipped: number; duplicates: number; errors: number } | { ok: false; reason: "not-connected" | "unreadable" | "error"; error?: string };

/** Every account's catch-up (hourly cron), one after another. */
export async function syncAllMissedComments(options: { days?: number; mediaLimit?: number } = {}) {
  const results: Array<SyncResult & { account: string }> = [];
  for (const account of await listInstagramAccounts()) results.push({ account: account.username, ...await syncMissedComments(account.id, options) });
  return results;
}

/**
 * Comments one account's webhook missed: its latest `mediaLimit` posts, their comments of the last `days` days, ingested
 * with the webhook's rules (existing comment ids do nothing). New ones are PENDING and answered by processQueue as usual.
 */
export async function syncMissedComments(accountId: string, options: { days?: number; mediaLimit?: number } = {}): Promise<SyncResult> {
  const days = options.days ?? 7, mediaLimit = options.mediaLimit ?? 25;
  const account = await getDb().instagramAccount.findUnique({ where: { id: accountId } });
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
  const result = await ingestFetchedComments(batches, account, storeFor(account.id), { days });
  return { ok: true, media: media.length, found: result.found, queued: result.queued.length, skipped: result.skipped, duplicates: result.duplicates, errors };
}

// ---- Token -----------------------------------------------------------------------------------------------

/** Every account's token (hourly cron); one failing account does not stop the others. */
export async function refreshAllTokens() {
  return Promise.all((await listInstagramAccounts()).map(account => refreshTokenIfDue(account.id).then(result => ({ account: account.username, ...result })).catch(error => {
    console.error("Instagram token refresh failed", { type: safeType(error) });
    return { account: account.username, refreshed: false, reason: "error" };
  })));
}

/** Refreshes the 60-day token when fewer than 20 days are left (and it is older than 24 h, as Meta requires). */
export async function refreshTokenIfDue(accountId: string, force = false) {
  const account = await getDb().instagramAccount.findUnique({ where: { id: accountId } });
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
  await getDb().instagramAccount.update({ where: { id: account.id }, data: { tokenEncrypted, tokenExpiresAt: fresh.expiresAt, tokenRefreshedAt: new Date() } });
  return { refreshed: true, reason: "ok" };
}
