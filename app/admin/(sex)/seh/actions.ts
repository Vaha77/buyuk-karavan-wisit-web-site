"use server";
import { z } from "zod";
import { requireSexUser } from "@/lib/auth/require-admin";
import { canCreateOrders } from "@/lib/sex/rules";
import { transitionInputError, transitionInputSchema } from "@/lib/sex/validation";
import { cancelOrder, confirmNoRequest, setOrderTest, createAgregatOrder, createZapchastOrder, transitionOrder } from "@/lib/sex/service";
import { createLinkCode, resendOrder, sendPersonalTest } from "@/lib/sex/bot";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import type { DeliveryStatus } from "@/lib/sex/bot-text";

export type SexActionResult = { ok: true; number?: number; id?: string; telegram?: DeliveryStatus; repeated?: boolean } | { ok: false; error: string; duplicate?: { number: number } };

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
const agregatSchema = z.object({ ...common, groupKey: z.string().min(1).max(80), modelKey: z.string().min(1).max(60), assembly: z.enum(["k", "rb", "vd", "vz"]), liters: z.string().max(10).nullable(), hp: z.string().max(10).nullable(), fn: z.string().max(12).nullable(), qty: z.number().int("Soni butun bo‘lsin.").min(1, "Soni kamida 1.").max(999) });
const zapchastSchema = z.object({ ...common, items: z.array(z.object({ partId: z.string().min(1).max(40), qty: z.number().int("Soni butun bo‘lsin.").min(1, "Soni kamida 1.").max(9999) })).min(1, "Kamida bitta mahsulot qo‘shing.").max(50) });
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
