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
import { ADD_ACCOUNT, CALLBACK_PATH, STATE_COOKIE, authorizeUrl, requestOrigin } from "@/lib/instagram/oauth";
import { DEFAULT_QUESTION_DM, DEFAULT_QUESTION_REPLY } from "@/lib/instagram/constants";
import { dismissConversation } from "@/lib/instagram/direct";
import { refreshInsights } from "@/lib/instagram/insights";
import { parseMinute } from "@/lib/instagram/direct-rules";
import { isHeatPumpAccount } from "@/lib/instagram/heat-pump";
import { COOLER_TEXT_KEYS } from "@/lib/instagram/cooler";
import { DEFAULT_GENERAL_REPLY, DEFAULT_KEYWORDS, DEFAULT_PUBLIC_REPLY, errorReason, parseKeywords, parseVariants } from "@/lib/instagram/rules";
import { accountToken, processQueue, refreshTokenIfDue, syncMissedComments } from "@/lib/instagram/service";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const graphReason = (error: unknown) => error instanceof GraphError ? errorReason(error.info) : "Tarmoq xatosi";
const revalidate = () => { revalidatePath("/admin/settings"); revalidatePath("/admin/instagram"); };
const accountIdSchema = z.string().trim().regex(/^[a-z0-9]{1,64}$/i);
const id = (value: unknown) => accountIdSchema.safeParse(value).data ?? "";
const chatIdSchema = z.string().trim().regex(/^(-?\d{5,20})?$/, "Telegram chat ID raqam bo‘lsin (guruh: -100…).");

// ---- Sozlamalar → Instagram (Super Admin) ------------------------------------------------------------------

/**
 * "Yangi akkaunt ulash" (target "add") or "Qayta ulash" of one account: state cookie (10 min) → Instagram Login →
 * /api/instagram/oauth/callback.
 */
export async function connectInstagramAction(target: string = ADD_ACCOUNT): Promise<Result> {
  await requireRole("SUPER_ADMIN");
  const config = appConfig();
  if (!config.appId || !config.appSecret) return { ok: false, error: `Vercel’da o‘rnating: ${config.missing.join(", ")}.` };
  if (!isVaultEnabled()) return { ok: false, error: "Token shifrlab saqlanadi: Vercel’da PASSWORD_VIEW_KEY o‘rnating." };
  const state = `${randomBytes(24).toString("base64url")}.${target === ADD_ACCOUNT ? ADD_ACCOUNT : id(target) || ADD_ACCOUNT}`;
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: CALLBACK_PATH, maxAge: 600 });
  redirect(authorizeUrl(config.appId, requestOrigin(await headers()), state));
}

/** Wipes the token (the row stays, so "Qayta ulash" keeps the account's id, settings and history). */
export async function disconnectInstagramAction(accountId: string): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN");
  const account = await getDb().instagramAccount.findUnique({ where: { id: id(accountId) } });
  if (!account) return { ok: true };
  const token = accountToken(account);
  if (token) await unsubscribeWebhooks(token).catch(() => undefined);
  await getDb().instagramAccount.update({ where: { id: account.id }, data: { tokenEncrypted: "", tokenExpiresAt: new Date(0), webhookSubscribedAt: null, runnerUntil: null } });
  await writeAudit(actor, { action: "UPDATE", entityType: "SITE_SETTINGS", entityId: "instagram", entityName: "Instagram", summary: `Instagram @${account.username} uzildi` });
  revalidate();
  return { ok: true };
}

export async function refreshInstagramTokenAction(accountId: string): Promise<Result> {
  await requireRole("SUPER_ADMIN");
  try {
    const result = await refreshTokenIfDue(id(accountId), true);
    revalidate();
    if (result.refreshed) return { ok: true, message: "Token yangilandi ✓" };
    const reasons: Record<string, string> = { "not-connected": "Akkaunt ulanmagan.", "too-new": "Token 24 soatdan yangi — Meta hali yangilashga ruxsat bermaydi.", expired: "Token muddati o‘tgan — qayta ulang.", unreadable: "Tokenni o‘qib bo‘lmadi — qayta ulang.", "no-key": "PASSWORD_VIEW_KEY yo‘q." };
    return { ok: false, error: reasons[result.reason] ?? "Yangilanmadi." };
  } catch (error) { return { ok: false, error: graphReason(error) }; }
}

export async function resubscribeWebhookAction(accountId: string): Promise<Result> {
  await requireRole("SUPER_ADMIN");
  const account = await getDb().instagramAccount.findUnique({ where: { id: id(accountId) } });
  const token = account && accountToken(account);
  if (!token) return { ok: false, error: "Akkaunt ulanmagan yoki token o‘qilmadi." };
  try {
    await subscribeWebhooks(token);
    await getDb().instagramAccount.update({ where: { id: account.id }, data: { webhookSubscribedAt: new Date(), webhookError: null } });
    revalidate();
    return { ok: true, message: "Webhook obunasi yangilandi ✓" };
  } catch (error) {
    const reason = graphReason(error);
    await getDb().instagramAccount.update({ where: { id: account.id }, data: { webhookError: reason } }).catch(() => undefined);
    revalidate();
    return { ok: false, error: reason };
  }
}

/** "O‘tkazib yuborilgan kommentlarni tekshirish": the hourly catch-up now; new comments are answered right after. */
export async function syncMissedCommentsAction(accountId: string): Promise<Result> {
  await requireRole("SUPER_ADMIN");
  const result = await syncMissedComments(id(accountId), { days: 7, mediaLimit: 25 });
  if (!result.ok) return { ok: false, error: result.reason === "not-connected" ? "Akkaunt ulanmagan." : result.reason === "unreadable" ? "Tokenni o‘qib bo‘lmadi — qayta ulang." : result.error ?? "Instagram’dan olib bo‘lmadi." };
  // Replies keep their 8–25 s pauses; a runner that is already working picks these up itself.
  if (result.queued) after(() => processQueue({ accountId: id(accountId), budgetMs: 40_000 }));
  revalidate();
  return { ok: true, message: `Topildi: ${result.found} · Navbatga qo‘shildi: ${result.queued}${result.errors ? ` · ${result.errors} ta post o‘qilmadi` : ""}` };
}

// ---- Instagram section (Super Admin, Admin) -------------------------------------------------------------

const ruleSchema = z.object({
  accountId: accountIdSchema,
  mediaId: z.string().trim().regex(/^\d{5,40}$/),
  priceText: z.string().trim().max(900, "Narx matni 900 belgidan oshmasin.").optional().default(""),
  productId: z.string().trim().min(1).max(100).nullable(),
  secondProductId: z.string().trim().min(1).max(100).nullable().optional().default(null),
  isActive: z.boolean(),
  keywords: z.string().max(2000),
  dmTemplate: z.string().trim().max(900, "DM matni 900 belgidan oshmasin."),
  publicReplyEnabled: z.boolean(),
  publicReplyText: z.string().trim().max(300, "Ochiq javob 300 belgidan oshmasin."),
  publicReplyVariants: z.string().max(4000).default(""),
  permalink: z.string().trim().url().max(500).nullable(),
  caption: z.string().max(5000).nullable(),
  postedAt: z.string().max(40).nullable(),
  heatPump: z.boolean().optional().default(false),
  cooler: z.boolean().optional().default(false),
});

export async function saveMediaRuleAction(raw: unknown): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const parsed = ruleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ma’lumotlarni tekshiring." };
  const value = { ...parsed.data, cooler: parsed.data.cooler && !parsed.data.heatPump };
  const variants = parseVariants(value.publicReplyVariants);
  const secondProductId = !value.heatPump && value.secondProductId && value.secondProductId !== value.productId ? value.secondProductId : null;
  if (!await getDb().instagramAccount.findUnique({ where: { id: value.accountId }, select: { id: true } })) return { ok: false, error: "Akkaunt topilmadi." };
  if (value.productId && !await getDb().product.findFirst({ where: { id: value.productId, archivedAt: null }, select: { id: true } })) return { ok: false, error: "Mahsulot topilmadi." };
  // Teplonasos / xolodilnik posts do not use the product, price text or DM template, so they are not checked.
  if (!value.heatPump && !value.cooler) {
    if (value.dmTemplate.length < 5) return { ok: false, error: "DM matni bo‘sh bo‘lmasin." };
    // Free text; {narx_som} / {mahsulot} / {havola} need a product.
    if (/\{(mahsulot|narx_som|havola)\}/.test(value.dmTemplate) && !value.productId && !value.priceText) return { ok: false, error: "Matnda {mahsulot}/{narx_som}/{havola} bor — mahsulot tanlang yoki ularni olib tashlang." };
    if (value.publicReplyEnabled && !variants.length && !value.publicReplyText) return { ok: false, error: "Ochiq javob matnini yozing yoki o‘chiring." };
    // {mahsulot2} {narx_som2} {havola2} without a second product are fine: their lines are dropped when the DM is sent.
    if (/\{(mahsulot|narx_som|havola)\}/.test(value.priceText)) return { ok: false, error: "Narx matnida {mahsulot}/{narx_som}/{havola} ishlatilmaydi — narxni o‘zingiz yozing." };
    if (secondProductId && !await getDb().product.findFirst({ where: { id: secondProductId, archivedAt: null }, select: { id: true } })) return { ok: false, error: "Qo‘shimcha mahsulot topilmadi." };
  }
  const keywords = parseKeywords(value.keywords);
  const postedAt = value.postedAt ? new Date(value.postedAt) : null;
  // Teplonasos posts exist only on the "global" account (@buyuk_karavan).
  if (value.heatPump && !isHeatPumpAccount(value.accountId)) return { ok: false, error: "Teplonasos turi faqat @buyuk_karavan uchun." };
  if (value.cooler && !isHeatPumpAccount(value.accountId)) return { ok: false, error: "Xolodilnik turi faqat @buyuk_karavan uchun." };
  const data = { accountId: value.accountId, heatPump: value.heatPump, cooler: value.cooler, priceText: value.priceText || null, productId: value.productId, secondProductId, isActive: value.isActive, keywords: keywords.length ? keywords : DEFAULT_KEYWORDS, dmTemplate: value.dmTemplate, publicReplyEnabled: value.publicReplyEnabled, publicReplyText: variants[0] ?? (value.publicReplyText || DEFAULT_PUBLIC_REPLY), publicReplyVariants: variants, permalink: value.permalink, caption: value.caption?.slice(0, 500) ?? null, postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null, updatedById: actor.id };
  await getDb().instagramMediaRule.upsert({ where: { mediaId: value.mediaId }, create: { mediaId: value.mediaId, ...data }, update: data });
  await writeAudit(actor, { action: "UPDATE", entityType: "INSTAGRAM_MEDIA", entityId: value.mediaId, entityName: value.permalink ?? value.mediaId, summary: `Instagram post sozlamasini saqladi (${value.isActive ? "faol" : "o‘chiq"})`, after: { productId: value.productId, secondProductId, isActive: value.isActive, keywords: data.keywords, publicReplyEnabled: value.publicReplyEnabled } });
  revalidatePath("/admin/instagram");
  return { ok: true, message: "Saqlandi ✓" };
}

const generalSchema = z.object({
  accountId: accountIdSchema,
  label: z.string().trim().max(80), brandName: z.string().trim().max(160),
  address: z.string().trim().max(300), landmark: z.string().trim().max(300), mapLink: z.string().trim().max(500), workHours: z.string().trim().max(200),
  contactRepliesEnabled: z.boolean(),
  phoneDmTemplate: z.string().trim().max(900), addressDmTemplate: z.string().trim().max(900), hoursDmTemplate: z.string().trim().max(900), noPriceDmTemplate: z.string().trim().max(900),
  directChatId: chatIdSchema, negativeChatId: chatIdSchema,
  aiReplyAll: z.boolean(), aiPrompt: z.string().trim().max(4000), leadsEnabled: z.boolean(), directEnabled: z.boolean(),
  generalReplyEnabled: z.boolean(), generalReplyText: z.string().trim().max(300), phone: z.string().trim().max(40),
  priceEnabled: z.boolean(), positiveEnabled: z.boolean(), questionEnabled: z.boolean(), negativeNotify: z.boolean(),
  dailyReplyLimit: z.number().int().min(1).max(1000),
  questionReplyText: z.string().trim().max(300), questionDmTemplate: z.string().trim().max(900),
});

export async function saveInstagramGeneralAction(raw: unknown): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const parsed = generalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.find(issue => issue.message.startsWith("Telegram"))?.message ?? "Ma’lumotlarni tekshiring." };
  const value = parsed.data;
  if ([value.phoneDmTemplate, value.addressDmTemplate, value.hoursDmTemplate, value.noPriceDmTemplate].some(text => /\{(mahsulot|narx_som|havola)\}/.test(text))) return { ok: false, error: "Aloqa va “narx telefonda” matnlarida {mahsulot}/{narx_som}/{havola} ishlatilmaydi." };
  if (value.generalReplyEnabled && !value.generalReplyText) return { ok: false, error: "Umumiy javob matnini yozing." };
  if (/\{(mahsulot|narx_som|havola)\}/.test(value.questionDmTemplate)) return { ok: false, error: "Umumiy savol matnida faqat {telefon} va {username} ishlatiladi." };
  const current = await getDb().instagramAccount.findUnique({ where: { id: value.accountId }, select: { phoneDmTemplate: true, addressDmTemplate: true, hoursDmTemplate: true } });
  const { count } = await getDb().instagramAccount.updateMany({ where: { id: value.accountId }, data: { label: value.label || null, brandName: value.brandName || null, address: value.address || null, landmark: value.landmark || null, mapLink: value.mapLink || null, workHours: value.workHours || null, contactRepliesEnabled: value.contactRepliesEnabled, phoneDmTemplate: value.phoneDmTemplate || current?.phoneDmTemplate, addressDmTemplate: value.addressDmTemplate || current?.addressDmTemplate, hoursDmTemplate: value.hoursDmTemplate || current?.hoursDmTemplate, noPriceDmTemplate: value.noPriceDmTemplate || null, directChatId: value.directChatId || null, negativeChatId: value.negativeChatId || null, aiReplyAll: value.aiReplyAll, aiPrompt: value.aiPrompt || null, leadsEnabled: value.leadsEnabled, directEnabled: value.directEnabled, generalReplyEnabled: value.generalReplyEnabled, generalReplyText: value.generalReplyText || DEFAULT_GENERAL_REPLY, phone: value.phone || null, priceEnabled: value.priceEnabled, positiveEnabled: value.positiveEnabled, questionEnabled: value.questionEnabled, negativeNotify: value.negativeNotify, dailyReplyLimit: value.dailyReplyLimit, questionReplyText: value.questionReplyText || DEFAULT_QUESTION_REPLY, questionDmTemplate: value.questionDmTemplate || DEFAULT_QUESTION_DM } });
  if (!count) return { ok: false, error: "Avval Sozlamalarda Instagram’ni ulang." };
  await writeAudit(actor, { action: "UPDATE", entityType: "SITE_SETTINGS", entityId: "instagram", entityName: "Instagram", summary: "Instagram umumiy sozlamalarini saqladi", after: value });
  revalidatePath("/admin/leads");
  revalidatePath("/admin/instagram");
  return { ok: true, message: "Saqlandi ✓" };
}

/** "Navbatni hozir yuborish": handles due comments now instead of waiting for the next webhook / the daily cron. */
export async function runInstagramQueueAction(accountId: string): Promise<Result> {
  await requireRole("SUPER_ADMIN", "ADMIN");
  const totals = await processQueue({ accountId: id(accountId), budgetMs: 40_000 });
  revalidatePath("/admin/instagram");
  if (totals.idle) return { ok: true, message: "Navbat bo‘sh — yuboriladigan komment yo‘q." };
  if (totals.busy) return { ok: true, message: "Navbat hozir ishlayapti — javoblar 8–25 soniya oralig‘ida ketadi." };
  return { ok: true, message: `Yuborildi: ${totals.sent} · adminga: ${totals.notified} · o‘tkazildi: ${totals.skipped} · xato: ${totals.failed} · navbatda: ${totals.retry + totals.waiting}` };
}

// ---- Direct tab ------------------------------------------------------------------------------------------

const directSettingsSchema = z.object({ accountId: accountIdSchema, workStart: z.string(), workEnd: z.string(), autoAckEnabled: z.boolean(), autoAckText: z.string().trim().max(600) });

/** Working hours (Tashkent) and the optional one-time auto message. */
export async function saveDirectSettingsAction(raw: unknown): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const parsed = directSettingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ma’lumotlarni tekshiring." };
  const start = parseMinute(parsed.data.workStart), end = parseMinute(parsed.data.workEnd);
  if (start === null || end === null || end <= start) return { ok: false, error: "Ish vaqtini HH:MM ko‘rinishida kiriting (boshlanishi tugashidan oldin)." };
  if (parsed.data.autoAckEnabled && !parsed.data.autoAckText) return { ok: false, error: "Avto-xabar matnini yozing." };
  const { count } = await getDb().instagramAccount.updateMany({ where: { id: parsed.data.accountId }, data: { directWorkStart: start, directWorkEnd: end, directAutoAckEnabled: parsed.data.autoAckEnabled, ...(parsed.data.autoAckText ? { directAutoAckText: parsed.data.autoAckText } : {}) } });
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
export async function refreshInsightsAction(accountId: string): Promise<Result> {
  await requireRole("SUPER_ADMIN", "ADMIN");
  const result = await refreshInsights({ accountId: id(accountId) });
  revalidatePath("/admin/instagram");
  if (!result.ok) return { ok: false, error: result.errors[0] ?? "Ma’lumot olinmadi." };
  return { ok: true, message: `Yangilandi ✓ ${result.days} kun, ${result.media} post${result.audience ? ", auditoriya" : ""}${result.errors.length ? ` · ${result.errors.length} ta ogohlantirish` : ""}` };
}

// ---- Teplonasos jadvali ("global" account only) -----------------------------------------------------------

const heatPumpSchema = z.object({
  rows: z.array(z.object({
    id: z.string().trim().max(40).nullable(),
    brand: z.string().trim().min(1, "Brendni yozing.").max(40), model: z.string().trim().min(1, "Modelni yozing.").max(60),
    hp: z.number().positive().max(1000), nominalKw: z.number().positive().max(1000), winterKw: z.number().positive().max(1000),
    voltage: z.union([z.literal(220), z.literal(380)]), priceUsd: z.number().positive().max(1_000_000),
    bufferIncluded: z.boolean(), isActive: z.boolean(),
  })).max(50),
  bufferUsd: z.number().min(0).max(100_000), bufferLiters: z.number().int().min(1).max(10_000),
  aiEnabled: z.boolean().optional().default(true),
});

/** Saves the whole table (rows left out are deleted) and the buffer tank price. */
export async function saveHeatPumpTableAction(raw: unknown): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const parsed = heatPumpSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ma’lumotlarni tekshiring." };
  const { rows, bufferUsd, bufferLiters, aiEnabled } = parsed.data;
  const db = getDb();
  await db.$transaction([
    db.heatPumpModel.deleteMany({ where: { id: { notIn: rows.map(row => row.id).filter((rowId): rowId is string => !!rowId) } } }),
    ...rows.map(({ id: rowId, ...row }) => rowId ? db.heatPumpModel.upsert({ where: { id: rowId }, create: { id: rowId, ...row }, update: row }) : db.heatPumpModel.create({ data: row })),
    db.siteSettings.upsert({ where: { id: "global" }, create: { id: "global", heatPumpBufferUsd: bufferUsd, heatPumpBufferLiters: bufferLiters, heatPumpAi: aiEnabled }, update: { heatPumpBufferUsd: bufferUsd, heatPumpBufferLiters: bufferLiters, heatPumpAi: aiEnabled } }),
  ]);
  await writeAudit(actor, { action: "UPDATE", entityType: "SITE_SETTINGS", entityId: "heat-pump", entityName: "Teplonasos jadvali", summary: `Teplonasos jadvalini saqladi (${rows.length} model)`, after: parsed.data });
  revalidatePath("/admin/instagram");
  return { ok: true, message: "Saqlandi ✓" };
}

// ---- Xolodilnik: Komplektlar + Direct matnlari -------------------------------------------------------------

const coolerTextSchema = z.object(Object.fromEntries(COOLER_TEXT_KEYS.map(key => [key, z.string().trim().max(900, "Matn 900 belgidan oshmasin.")])) as Record<(typeof COOLER_TEXT_KEYS)[number], z.ZodString>);
const coolerSchema = z.object({
  kits: z.array(z.object({
    id: z.string().trim().max(40).nullable(),
    minTons: z.number().int().min(1).max(100_000), maxTons: z.number().int().min(1).max(100_000),
    name: z.string().trim().min(1, "Komplekt nomini yozing.").max(80),
    items: z.array(z.string().trim().min(1).max(120)).max(30),
    productId: z.string().trim().min(1).max(100).nullable(),
    priceUsd: z.number().positive().max(10_000_000).nullable(),
    isActive: z.boolean(),
  }).refine(kit => kit.minTons <= kit.maxTons, "Tonna oralig‘i: “dan” ≤ “gacha” bo‘lsin.")).max(30),
  texts: z.object({ uz: coolerTextSchema, ru: coolerTextSchema }),
});

/** Saves the whole Komplektlar table (rows left out are deleted) and the Direct texts (empty = default). */
export async function saveCoolerSettingsAction(raw: unknown): Promise<Result> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const parsed = coolerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ma’lumotlarni tekshiring." };
  const { kits, texts } = parsed.data;
  const db = getDb();
  const productIds = [...new Set(kits.map(kit => kit.productId).filter((productId): productId is string => !!productId))];
  if (productIds.length && await db.product.count({ where: { id: { in: productIds }, archivedAt: null } }) !== productIds.length) return { ok: false, error: "Mahsulot topilmadi." };
  await db.$transaction([
    db.coolerKit.deleteMany({ where: { id: { notIn: kits.map(kit => kit.id).filter((kitId): kitId is string => !!kitId) } } }),
    ...kits.map(({ id: kitId, ...kit }) => kitId ? db.coolerKit.upsert({ where: { id: kitId }, create: { id: kitId, ...kit }, update: kit }) : db.coolerKit.create({ data: kit })),
    db.siteSettings.upsert({ where: { id: "global" }, create: { id: "global", coolerTexts: texts }, update: { coolerTexts: texts } }),
  ]);
  await writeAudit(actor, { action: "UPDATE", entityType: "SITE_SETTINGS", entityId: "cooler", entityName: "Xolodilnik komplektlari", summary: `Xolodilnik komplektlarini saqladi (${kits.length} ta)`, after: parsed.data });
  revalidatePath("/admin/instagram");
  return { ok: true, message: "Saqlandi ✓" };
}
