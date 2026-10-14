"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit/service";
import { isVaultEnabled } from "@/lib/auth/password-vault";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { appConfig, GraphError, subscribeWebhooks, unsubscribeWebhooks } from "@/lib/instagram/graph";
import { CALLBACK_PATH, STATE_COOKIE, authorizeUrl, requestOrigin } from "@/lib/instagram/oauth";
import { DEFAULT_QUESTION_DM, DEFAULT_QUESTION_REPLY } from "@/lib/instagram/constants";
import { dismissConversation } from "@/lib/instagram/direct";
import { refreshInsights } from "@/lib/instagram/insights";
import { parseMinute } from "@/lib/instagram/direct-rules";
import { DEFAULT_GENERAL_REPLY, DEFAULT_KEYWORDS, DEFAULT_PUBLIC_REPLY, errorReason, parseKeywords, parseVariants } from "@/lib/instagram/rules";
import { accountToken, getInstagramAccount, processQueue, refreshTokenIfDue, syncMissedComments } from "@/lib/instagram/service";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const graphReason = (error: unknown) => error instanceof GraphError ? errorReason(error.info) : "Tarmoq xatosi";
const revalidate = () => { revalidatePath("/admin/settings"); revalidatePath("/admin/instagram"); };

// ---- Sozlamalar → Instagram (Super Admin) ------------------------------------------------------------------

/** "Instagram'ni ulash": state cookie (10 min) → Instagram Login → /api/instagram/oauth/callback. */
export async function connectInstagramAction(): Promise<Result> {
  await requireRole("SUPER_ADMIN");
  const config = appConfig();
  if (!config.appId || !config.appSecret) return { ok: false, error: `Vercel’da o‘rnating: ${config.missing.join(", ")}.` };
  if (!isVaultEnabled()) return { ok: false, error: "Token shifrlab saqlanadi: Vercel’da PASSWORD_VIEW_KEY o‘rnating." };
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: CALLBACK_PATH, maxAge: 600 });
  redirect(authorizeUrl(config.appId, requestOrigin(await headers()), state));
}

export async function disconnectInstagramAction(): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN");
  const account = await getInstagramAccount();
  if (!account) return { ok: true };
  const token = accountToken(account);
  if (token) await unsubscribeWebhooks(token).catch(() => undefined);
  await getDb().instagramAccount.delete({ where: { id: "global" } });
  await writeAudit(actor, { action: "UPDATE", entityType: "SITE_SETTINGS", entityId: "instagram", entityName: "Instagram", summary: `Instagram @${account.username} uzildi` });
  revalidate();
  return { ok: true };
}

export async function refreshInstagramTokenAction(): Promise<Result> {
  await requireRole("SUPER_ADMIN");
  try {
    const result = await refreshTokenIfDue(true);
    revalidate();
    if (result.refreshed) return { ok: true, message: "Token yangilandi ✓" };
    const reasons: Record<string, string> = { "not-connected": "Akkaunt ulanmagan.", "too-new": "Token 24 soatdan yangi — Meta hali yangilashga ruxsat bermaydi.", expired: "Token muddati o‘tgan — qayta ulang.", unreadable: "Tokenni o‘qib bo‘lmadi — qayta ulang.", "no-key": "PASSWORD_VIEW_KEY yo‘q." };
    return { ok: false, error: reasons[result.reason] ?? "Yangilanmadi." };
  } catch (error) { return { ok: false, error: graphReason(error) }; }
}

export async function resubscribeWebhookAction(): Promise<Result> {
  await requireRole("SUPER_ADMIN");
  const account = await getInstagramAccount();
  const token = account && accountToken(account);
  if (!token) return { ok: false, error: "Akkaunt ulanmagan yoki token o‘qilmadi." };
  try {
    await subscribeWebhooks(token);
    await getDb().instagramAccount.update({ where: { id: "global" }, data: { webhookSubscribedAt: new Date(), webhookError: null } });
    revalidate();
    return { ok: true, message: "Webhook obunasi yangilandi ✓" };
  } catch (error) {
    const reason = graphReason(error);
    await getDb().instagramAccount.update({ where: { id: "global" }, data: { webhookError: reason } }).catch(() => undefined);
    revalidate();
    return { ok: false, error: reason };
  }
}

/** "O‘tkazib yuborilgan kommentlarni tekshirish": the hourly catch-up now; new comments are answered right after. */
export async function syncMissedCommentsAction(): Promise<Result> {
  await requireRole("SUPER_ADMIN");
  const result = await syncMissedComments({ days: 7, mediaLimit: 25 });
  if (!result.ok) return { ok: false, error: result.reason === "not-connected" ? "Akkaunt ulanmagan." : result.reason === "unreadable" ? "Tokenni o‘qib bo‘lmadi — qayta ulang." : result.error ?? "Instagram’dan olib bo‘lmadi." };
  // Replies keep their 20–90 s pauses; a runner that is already working picks these up itself.
  if (result.queued) after(() => processQueue({ budgetMs: 40_000 }));
  revalidate();
  return { ok: true, message: `Topildi: ${result.found} · Navbatga qo‘shildi: ${result.queued}${result.errors ? ` · ${result.errors} ta post o‘qilmadi` : ""}` };
}

// ---- Instagram section (Super Admin, Admin) -------------------------------------------------------------

const ruleSchema = z.object({
  mediaId: z.string().trim().regex(/^\d{5,40}$/),
  productId: z.string().trim().min(1).max(100).nullable(),
  secondProductId: z.string().trim().min(1).max(100).nullable().optional().default(null),
  isActive: z.boolean(),
  keywords: z.string().max(2000),
  dmTemplate: z.string().trim().min(5, "DM matni bo‘sh bo‘lmasin.").max(900, "DM matni 900 belgidan oshmasin."),
  publicReplyEnabled: z.boolean(),
  publicReplyText: z.string().trim().max(300, "Ochiq javob 300 belgidan oshmasin."),
  publicReplyVariants: z.string().max(4000).default(""),
  permalink: z.string().trim().url().max(500).nullable(),
  caption: z.string().max(5000).nullable(),
  postedAt: z.string().max(40).nullable(),
});

export async function saveMediaRuleAction(raw: unknown): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const parsed = ruleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ma’lumotlarni tekshiring." };
  const value = parsed.data;
  // Free text; {narx_som} / {mahsulot} / {havola} need a product.
  if (/\{(mahsulot|narx_som|havola)\}/.test(value.dmTemplate) && !value.productId) return { ok: false, error: "Matnda {mahsulot}/{narx_som}/{havola} bor — mahsulot tanlang yoki ularni olib tashlang." };
  const variants = parseVariants(value.publicReplyVariants);
  if (value.publicReplyEnabled && !variants.length && !value.publicReplyText) return { ok: false, error: "Ochiq javob matnini yozing yoki o‘chiring." };
  if (value.productId && !await getDb().product.findFirst({ where: { id: value.productId, archivedAt: null }, select: { id: true } })) return { ok: false, error: "Mahsulot topilmadi." };
  // {mahsulot2} {narx_som2} {havola2} without a second product are fine: their lines are dropped when the DM is sent.
  const secondProductId = value.secondProductId && value.secondProductId !== value.productId ? value.secondProductId : null;
  if (secondProductId && !await getDb().product.findFirst({ where: { id: secondProductId, archivedAt: null }, select: { id: true } })) return { ok: false, error: "Qo‘shimcha mahsulot topilmadi." };
  const keywords = parseKeywords(value.keywords);
  const postedAt = value.postedAt ? new Date(value.postedAt) : null;
  const data = { productId: value.productId, secondProductId, isActive: value.isActive, keywords: keywords.length ? keywords : DEFAULT_KEYWORDS, dmTemplate: value.dmTemplate, publicReplyEnabled: value.publicReplyEnabled, publicReplyText: variants[0] ?? (value.publicReplyText || DEFAULT_PUBLIC_REPLY), publicReplyVariants: variants, permalink: value.permalink, caption: value.caption?.slice(0, 500) ?? null, postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null, updatedById: actor.id };
  await getDb().instagramMediaRule.upsert({ where: { mediaId: value.mediaId }, create: { mediaId: value.mediaId, ...data }, update: data });
  await writeAudit(actor, { action: "UPDATE", entityType: "INSTAGRAM_MEDIA", entityId: value.mediaId, entityName: value.permalink ?? value.mediaId, summary: `Instagram post sozlamasini saqladi (${value.isActive ? "faol" : "o‘chiq"})`, after: { productId: value.productId, secondProductId, isActive: value.isActive, keywords: data.keywords, publicReplyEnabled: value.publicReplyEnabled } });
  revalidatePath("/admin/instagram");
  return { ok: true, message: "Saqlandi ✓" };
}

const generalSchema = z.object({
  generalReplyEnabled: z.boolean(), generalReplyText: z.string().trim().max(300), phone: z.string().trim().max(40),
  priceEnabled: z.boolean(), positiveEnabled: z.boolean(), questionEnabled: z.boolean(), negativeNotify: z.boolean(),
  dailyReplyLimit: z.number().int().min(1).max(1000),
  questionReplyText: z.string().trim().max(300), questionDmTemplate: z.string().trim().max(900),
});

export async function saveInstagramGeneralAction(raw: unknown): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const parsed = generalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ma’lumotlarni tekshiring." };
  const value = parsed.data;
  if (value.generalReplyEnabled && !value.generalReplyText) return { ok: false, error: "Umumiy javob matnini yozing." };
  if (/\{(mahsulot|narx_som|havola)\}/.test(value.questionDmTemplate)) return { ok: false, error: "Umumiy savol matnida faqat {telefon} va {username} ishlatiladi." };
  const { count } = await getDb().instagramAccount.updateMany({ where: { id: "global" }, data: { generalReplyEnabled: value.generalReplyEnabled, generalReplyText: value.generalReplyText || DEFAULT_GENERAL_REPLY, phone: value.phone || null, priceEnabled: value.priceEnabled, positiveEnabled: value.positiveEnabled, questionEnabled: value.questionEnabled, negativeNotify: value.negativeNotify, dailyReplyLimit: value.dailyReplyLimit, questionReplyText: value.questionReplyText || DEFAULT_QUESTION_REPLY, questionDmTemplate: value.questionDmTemplate || DEFAULT_QUESTION_DM } });
  if (!count) return { ok: false, error: "Avval Sozlamalarda Instagram’ni ulang." };
  await writeAudit(actor, { action: "UPDATE", entityType: "SITE_SETTINGS", entityId: "instagram", entityName: "Instagram", summary: "Instagram umumiy sozlamalarini saqladi", after: value });
  revalidatePath("/admin/instagram");
  return { ok: true, message: "Saqlandi ✓" };
}

/** "Navbatni hozir yuborish": handles due comments now instead of waiting for the next webhook / the daily cron. */
export async function runInstagramQueueAction(): Promise<Result> {
  await requireRole("SUPER_ADMIN", "ADMIN");
  const totals = await processQueue({ budgetMs: 40_000 });
  revalidatePath("/admin/instagram");
  if (totals.busy) return { ok: true, message: "Navbat hozir ishlayapti — javoblar 20–90 soniya oralig‘ida ketadi." };
  return { ok: true, message: `Yuborildi: ${totals.sent} · adminga: ${totals.notified} · o‘tkazildi: ${totals.skipped} · xato: ${totals.failed} · navbatda: ${totals.retry + totals.waiting}` };
}

// ---- Direct tab ------------------------------------------------------------------------------------------

const directSettingsSchema = z.object({ workStart: z.string(), workEnd: z.string(), autoAckEnabled: z.boolean(), autoAckText: z.string().trim().max(600) });

/** Working hours (Tashkent) and the optional one-time auto message. */
export async function saveDirectSettingsAction(raw: unknown): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const parsed = directSettingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ma’lumotlarni tekshiring." };
  const start = parseMinute(parsed.data.workStart), end = parseMinute(parsed.data.workEnd);
  if (start === null || end === null || end <= start) return { ok: false, error: "Ish vaqtini HH:MM ko‘rinishida kiriting (boshlanishi tugashidan oldin)." };
  if (parsed.data.autoAckEnabled && !parsed.data.autoAckText) return { ok: false, error: "Avto-xabar matnini yozing." };
  const { count } = await getDb().instagramAccount.updateMany({ where: { id: "global" }, data: { directWorkStart: start, directWorkEnd: end, directAutoAckEnabled: parsed.data.autoAckEnabled, ...(parsed.data.autoAckText ? { directAutoAckText: parsed.data.autoAckText } : {}) } });
  if (!count) return { ok: false, error: "Avval Sozlamalarda Instagram’ni ulang." };
  await writeAudit(actor, { action: "UPDATE", entityType: "SITE_SETTINGS", entityId: "instagram-direct", entityName: "Instagram Direct", summary: "Instagram Direct sozlamalarini saqladi", after: { workStart: parsed.data.workStart, workEnd: parsed.data.workEnd, autoAckEnabled: parsed.data.autoAckEnabled } });
  revalidatePath("/admin/instagram");
  return { ok: true, message: "Saqlandi ✓" };
}

/** "Kerak emas / spam" from the panel, with a reason (Telegram cards are updated). */
export async function dismissDirectAction(conversationId: string, reason: string): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const text = String(reason ?? "").trim().slice(0, 200);
  if (!text) return { ok: false, error: "Sababini yozing." };
  const done = await dismissConversation(String(conversationId), text, actor.name);
  if (!done) return { ok: false, error: "Holat allaqachon o‘zgargan." };
  await writeAudit(actor, { action: "UPDATE", entityType: "INSTAGRAM_DIRECT", entityId: String(conversationId), summary: `Instagram yozishmasini “Kerak emas” qildi: ${text}` });
  revalidatePath("/admin/instagram");
  return { ok: true, message: "Kerak emas ✓" };
}

// ---- Statistika tab --------------------------------------------------------------------------------------

/** "Hozir yangilash": Insights now (the daily cron does the same at 06:00). */
export async function refreshInsightsAction(): Promise<Result> {
  await requireRole("SUPER_ADMIN", "ADMIN");
  const result = await refreshInsights();
  revalidatePath("/admin/instagram");
  if (!result.ok) return { ok: false, error: result.errors[0] ?? "Ma’lumot olinmadi." };
  return { ok: true, message: `Yangilandi ✓ ${result.days} kun, ${result.media} post${result.audience ? ", auditoriya" : ""}${result.errors.length ? ` · ${result.errors.length} ta ogohlantirish` : ""}` };
}
