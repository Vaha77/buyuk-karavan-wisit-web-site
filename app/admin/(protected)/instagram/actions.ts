"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit/service";
import { isVaultEnabled } from "@/lib/auth/password-vault";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { appConfig, GraphError, subscribeWebhooks, unsubscribeWebhooks } from "@/lib/instagram/graph";
import { CALLBACK_PATH, STATE_COOKIE, authorizeUrl, requestOrigin } from "@/lib/instagram/oauth";
import { DEFAULT_GENERAL_REPLY, DEFAULT_KEYWORDS, DEFAULT_PUBLIC_REPLY, errorReason, parseKeywords } from "@/lib/instagram/rules";
import { accountToken, getInstagramAccount, processQueue, refreshTokenIfDue } from "@/lib/instagram/service";

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

// ---- Instagram section (Super Admin, Admin) -------------------------------------------------------------

const ruleSchema = z.object({
  mediaId: z.string().trim().regex(/^\d{5,40}$/),
  productId: z.string().trim().min(1).max(100).nullable(),
  isActive: z.boolean(),
  keywords: z.string().max(2000),
  dmTemplate: z.string().trim().min(5, "DM matni bo‘sh bo‘lmasin.").max(900, "DM matni 900 belgidan oshmasin."),
  publicReplyEnabled: z.boolean(),
  publicReplyText: z.string().trim().max(300, "Ochiq javob 300 belgidan oshmasin."),
  permalink: z.string().trim().url().max(500).nullable(),
  caption: z.string().max(5000).nullable(),
  postedAt: z.string().max(40).nullable(),
});

export async function saveMediaRuleAction(raw: unknown): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const parsed = ruleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ma’lumotlarni tekshiring." };
  const value = parsed.data;
  if (!value.dmTemplate.includes("{narx_som}")) return { ok: false, error: "DM matnida {narx_som} bo‘lishi kerak." };
  if (value.publicReplyEnabled && !value.publicReplyText) return { ok: false, error: "Ochiq javob matnini yozing yoki o‘chiring." };
  if (value.productId && !await getDb().product.findFirst({ where: { id: value.productId, archivedAt: null }, select: { id: true } })) return { ok: false, error: "Mahsulot topilmadi." };
  const keywords = parseKeywords(value.keywords);
  const postedAt = value.postedAt ? new Date(value.postedAt) : null;
  const data = { productId: value.productId, isActive: value.isActive, keywords: keywords.length ? keywords : DEFAULT_KEYWORDS, dmTemplate: value.dmTemplate, publicReplyEnabled: value.publicReplyEnabled, publicReplyText: value.publicReplyText || DEFAULT_PUBLIC_REPLY, permalink: value.permalink, caption: value.caption?.slice(0, 500) ?? null, postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null, updatedById: actor.id };
  await getDb().instagramMediaRule.upsert({ where: { mediaId: value.mediaId }, create: { mediaId: value.mediaId, ...data }, update: data });
  await writeAudit(actor, { action: "UPDATE", entityType: "INSTAGRAM_MEDIA", entityId: value.mediaId, entityName: value.permalink ?? value.mediaId, summary: `Instagram post sozlamasini saqladi (${value.isActive ? "faol" : "o‘chiq"})`, after: { productId: value.productId, isActive: value.isActive, keywords: data.keywords, publicReplyEnabled: value.publicReplyEnabled } });
  revalidatePath("/admin/instagram");
  return { ok: true, message: "Saqlandi ✓" };
}

const generalSchema = z.object({ generalReplyEnabled: z.boolean(), generalReplyText: z.string().trim().max(300), phone: z.string().trim().max(40) });

export async function saveInstagramGeneralAction(raw: unknown): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const parsed = generalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ma’lumotlarni tekshiring." };
  const value = parsed.data;
  if (value.generalReplyEnabled && !value.generalReplyText) return { ok: false, error: "Umumiy javob matnini yozing." };
  const { count } = await getDb().instagramAccount.updateMany({ where: { id: "global" }, data: { generalReplyEnabled: value.generalReplyEnabled, generalReplyText: value.generalReplyText || DEFAULT_GENERAL_REPLY, phone: value.phone || null } });
  if (!count) return { ok: false, error: "Avval Sozlamalarda Instagram’ni ulang." };
  await writeAudit(actor, { action: "UPDATE", entityType: "SITE_SETTINGS", entityId: "instagram", entityName: "Instagram", summary: "Instagram umumiy sozlamalarini saqladi", after: value });
  revalidatePath("/admin/instagram");
  return { ok: true, message: "Saqlandi ✓" };
}

/** "Navbatni hozir yuborish": sends due retries now instead of waiting for the next webhook / the daily cron. */
export async function runInstagramQueueAction(): Promise<Result> {
  await requireRole("SUPER_ADMIN", "ADMIN");
  const totals = await processQueue({ limit: 30 });
  revalidatePath("/admin/instagram");
  return { ok: true, message: `Yuborildi: ${totals.sent} · xato: ${totals.failed} · navbatda: ${totals.retry}` };
}
