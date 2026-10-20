"use server";
import { z } from "zod";
import { requireSexUser } from "@/lib/auth/require-admin";
import { canCreateOrders } from "@/lib/sex/rules";
import { transitionInputError, transitionInputSchema } from "@/lib/sex/validation";
import { checkStoreDiff, cancelOrder, confirmNoRequest, editOrder, rejectCorrection, requestCorrection, setOrderTest, createAgregatOrder, createZapchastOrder, transitionOrder } from "@/lib/sex/service";
import { createLinkCode, resendOrder, sendPersonalTest } from "@/lib/sex/bot";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import type { DeliveryStatus } from "@/lib/sex/bot-text";
import { ProjectImageError, uploadProjectImage } from "@/lib/projects/storage";

export type SexActionResult = { ok: true; number?: string; id?: string; telegram?: DeliveryStatus; repeated?: boolean } | { ok: false; error: string; duplicate?: { number: string } };

const common = {
  purpose: z.enum(["SHOP", "CLIENT"]),
  customerId: z.string().max(40).nullable(),
  customerName: z.string().trim().max(160).nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sanani tanlang.").nullable(),
  note: z.string().trim().max(500).nullable().transform(value => value || null),
  // One id per form submit (idempotency) and the "Baribir yana yuborasizmi?" answer.
  requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "So‘rov identifikatori noto‘g‘ri.").nullable().default(null),
  confirmDuplicate: z.boolean().default(false),
};
const agregatSchema = z.object({
  ...common, groupKey: z.string().min(1).max(80), modelKey: z.string().min(1).max(60), assembly: z.enum(["k", "rb", "vd", "vz", "ch"]), liters: z.string().max(10).nullable(), hp: z.string().max(10).nullable(),
  // Vazdushniy agregat: the chosen condenser product; Chiller: composition (required) and an optional price ("kelishiladi").
  condenserId: z.string().max(40).nullable().default(null), composition: z.string().trim().max(1000).nullable().default(null), manualPrice: z.number().positive("Narx musbat bo‘lsin.").max(1_000_000).nullable().default(null),
  qty: z.number().int("Soni butun bo‘lsin.").min(1, "Soni kamida 1.").max(999),
});
const zapchastSchema = z.object({ ...common, items: z.array(z.object({ productId: z.string().min(1).max(40), qty: z.number().int("Soni butun bo‘lsin.").min(1, "Soni kamida 1.").max(9999) })).min(1, "Kamida bitta mahsulot qo‘shing.").max(50) });
const firstIssue = (error: z.ZodError) => error.issues[0]?.message || "Ma’lumotlarni tekshiring.";

export async function createAgregatOrderAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (!canCreateOrders(user.role)) return { ok: false, error: "Zakaz berish huquqi yo‘q." };
  const parsed = agregatSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await createAgregatOrder(user, parsed.data, { requestId: parsed.data.requestId, confirmDuplicate: parsed.data.confirmDuplicate });
  return result.ok ? { ok: true, number: result.number, id: result.id, telegram: result.telegram, repeated: result.repeated } : result;
}

export async function createZapchastOrderAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (!canCreateOrders(user.role)) return { ok: false, error: "Zakaz berish huquqi yo‘q." };
  const parsed = zapchastSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await createZapchastOrder(user, parsed.data, undefined, { requestId: parsed.data.requestId, confirmDuplicate: parsed.data.confirmDuplicate });
  return result.ok ? { ok: true, number: result.number, id: result.id, telegram: result.telegram, repeated: result.repeated } : result;
}

/** "+ Zayavkasiz chiqim": only the workshop writes it, for a chosen seller. */
export async function createNoRequestAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (user.role !== "WORKSHOP") return { ok: false, error: "Zayavkasiz chiqimni faqat seh mas’uli yozadi." };
  const parsed = zapchastSchema.extend({ sellerId: z.string().min(1, "Sotuvchini tanlang.").max(40) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await createZapchastOrder(user, parsed.data, parsed.data.sellerId, { requestId: parsed.data.requestId, confirmDuplicate: true });
  return result.ok ? { ok: true, number: result.number, id: result.id, telegram: result.telegram } : result;
}

/** Status buttons; the role check for each step is in lib/sex/rules.ts (checkTransition). */
export async function transitionOrderAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  const parsed = transitionInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: transitionInputError(parsed.error) };
  const result = await transitionOrder(user, parsed.data.id, parsed.data.action, parsed.data.issuedQty);
  return result.ok ? { ok: true } : result;
}

export async function confirmNoRequestAction(id: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (user.role !== "SELLER" || typeof id !== "string") return { ok: false, error: "Faqat sotuvchi tasdiqlaydi." };
  return confirmNoRequest(user, id);
}

/** "Telegram ulash": a one-time deep link (15 min) that binds this user's private chat to the bot. */
export type TelegramLinkResult = { ok: true; url: string | null; code: string; expiresAt: string } | { ok: false; error: string };
export async function createTelegramLinkAction(): Promise<TelegramLinkResult> {
  const user = await requireSexUser();
  try { return { ok: true, ...(await createLinkCode(user.id)) }; }
  catch { return { ok: false, error: "Kod yaratilmadi. Qayta urinib ko‘ring." }; }
}

/** "Menga test xabar (shaxsiy)". */
export async function sendMyTelegramTestAction(): Promise<SexActionResult> {
  const user = await requireSexUser();
  return sendPersonalTest(user.telegramChatId);
}

/** "Telegramga yuborilmadi · qayta yuborish" (staff who manage orders). */
export async function resendTelegramAction(id: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (typeof id !== "string" || !id) return { ok: false, error: "Zakaz tanlanmagan." };
  // Staff who manage orders, or the seller who placed this one (from the order form right after sending).
  const order = await getDb().workshopOrder.findUnique({ where: { id }, select: { sellerId: true } });
  if (!order) return { ok: false, error: "Zakaz topilmadi." };
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN" && order.sellerId !== user.id) return { ok: false, error: "Bu zakazni qayta yuborish huquqi yo‘q." };
  const delivered = await resendOrder(id);
  revalidatePath("/admin/seh");
  return delivered ? { ok: true, telegram: "sent" } : { ok: false, error: "Telegramga yana yuborilmadi — seh mas’uli botni ulaganini tekshiring." };
}

/** "Bekor qilish": the seller their own NEW order; SUPER_ADMIN until it leaves the workshop, with a reason (lib/sex/rules.ts checkCancel). */
export async function cancelOrderAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  const parsed = z.object({ id: z.string().min(1, "Zakaz tanlanmagan.").max(40), reason: z.string().trim().max(300).nullable().default(null) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return cancelOrder(user, parsed.data.id, parsed.data.reason);
}

/** "Test deb belgilash / olib tashlash" — SUPER_ADMIN only (checked again in setOrderTest). */
export async function setOrderTestAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  const parsed = z.object({ id: z.string().min(1, "Zakaz tanlanmagan.").max(40), isTest: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return setOrderTest(user, parsed.data.id, parsed.data.isTest);
}

/** "Tuzatish so‘rash" on a closed-month order (everyone but SUPER_ADMIN; checked in requestCorrection). */
export async function requestCorrectionAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  const parsed = z.object({ id: z.string().min(1).max(40), reason: z.string().trim().min(3, "Sababni yozing.").max(500) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return requestCorrection(user, parsed.data.id, parsed.data.reason);
}

export async function rejectCorrectionAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  const parsed = z.object({ id: z.string().min(1).max(40), reason: z.string().trim().min(3, "Sababni yozing.").max(300) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return rejectCorrection(user, parsed.data.id, parsed.data.reason);
}

/** SUPER_ADMIN "Tahrirlash" / "Ko‘rib tahrirlash" (checked again in editOrder). */
export async function editOrderAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  const count = z.number().int("Soni butun bo‘lsin.").min(0).max(9999);
  const parsed = z.object({
    id: z.string().min(1).max(40), requestId: z.string().max(40).nullable().default(null),
    customerName: z.string().trim().max(160).nullable().transform(value => value || null), note: z.string().trim().max(500).nullable().transform(value => value || null), qty: count.min(1, "Soni kamida 1."),
    items: z.array(z.object({ id: z.string().min(1).max(40), qty: count, issuedQty: count.nullable() })).max(50),
  }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, requestId, ...input } = parsed.data;
  return editOrder(user, id, input, requestId);
}

/** Omborchi: "✓ Qabul qildim", "Kamchilik bor / Soni boshqa" (actual count + reason, checked in transitionOrder) and "🚚 Mijozga yuklandi" (optional car number / photo). */
export async function storeStepAction(form: FormData): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (user.role !== "STOREKEEPER") return { ok: false, error: "Bu tugma faqat omborchi uchun." };
  const id = String(form.get("id") ?? ""), action = form.get("action"), qty = form.get("qty"), photo = form.get("photo");
  if (!id || id.length > 40 || (action !== "store" && action !== "load")) return { ok: false, error: "So‘rov noto‘g‘ri." };
  let photoUrl: string | null = null;
  if (action === "load" && photo instanceof File && photo.size > 0) {
    try { photoUrl = await uploadProjectImage(`ombor-${id}`, photo); }
    catch (error) { return { ok: false, error: error instanceof ProjectImageError ? error.message : "Rasm yuklanmadi." }; }
  }
  const result = await transitionOrder(user, id, action, undefined, "site", { receivedQty: qty === null || qty === "" ? undefined : Number(qty), note: String(form.get("note") ?? "") || null, car: String(form.get("car") ?? "") || null, photoUrl });
  return result.ok ? { ok: true } : result;
}

/** Omborchi "Sehdan so‘rash": one spare part as an ordinary zapchast request, "Magazinga", placed by the omborchi. */
export async function storeRequestAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (user.role !== "STOREKEEPER") return { ok: false, error: "Faqat omborchi uchun." };
  const parsed = z.object({ productId: z.string().min(1, "Zapchastni tanlang.").max(40), qty: z.number().int("Soni butun bo‘lsin.").min(1, "Soni kamida 1.").max(9999), note: common.note, requestId: common.requestId, confirmDuplicate: common.confirmDuplicate }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { productId, qty, note, requestId, confirmDuplicate } = parsed.data;
  const result = await createZapchastOrder(user, { purpose: "SHOP", customerId: null, customerName: null, dueDate: null, note, items: [{ productId, qty }] }, undefined, { requestId, confirmDuplicate });
  return result.ok ? { ok: true, number: result.number, id: result.id, telegram: result.telegram } : result;
}

/** "Tasdiqlash kerak" → "Ko‘rdim" on an omborchi shortage report (SUPER_ADMIN, checked in checkStoreDiff). */
export async function checkStoreDiffAction(id: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (typeof id !== "string" || !id) return { ok: false, error: "Zakaz tanlanmagan." };
  return checkStoreDiff(user, id);
}
