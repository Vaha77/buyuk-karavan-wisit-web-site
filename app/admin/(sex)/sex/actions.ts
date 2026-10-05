"use server";
import { z } from "zod";
import { requireSexUser } from "@/lib/auth/require-admin";
import { canCreateOrders } from "@/lib/sex/rules";
import { confirmNoRequest, createAgregatOrder, createZapchastOrder, transitionOrder } from "@/lib/sex/service";

export type SexActionResult = { ok: true; number?: number } | { ok: false; error: string };

const common = {
  purpose: z.enum(["SHOP", "CLIENT"]),
  customerId: z.string().max(40).nullable(),
  customerName: z.string().trim().max(160).nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sanani tanlang.").nullable(),
  note: z.string().trim().max(500).nullable().transform(value => value || null),
};
const agregatSchema = z.object({ ...common, groupKey: z.string().min(1).max(80), modelKey: z.string().min(1).max(60), assembly: z.enum(["k", "rb", "vd", "vz"]), liters: z.string().max(10).nullable(), hp: z.string().max(10).nullable(), fn: z.string().max(12).nullable(), qty: z.number().int("Soni butun bo‘lsin.").min(1, "Soni kamida 1.").max(999) });
const zapchastSchema = z.object({ ...common, items: z.array(z.object({ partId: z.string().min(1).max(40), qty: z.number().int("Soni butun bo‘lsin.").min(1, "Soni kamida 1.").max(9999) })).min(1, "Kamida bitta mahsulot qo‘shing.").max(50) });
const firstIssue = (error: z.ZodError) => error.issues[0]?.message || "Ma’lumotlarni tekshiring.";

export async function createAgregatOrderAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (!canCreateOrders(user.role)) return { ok: false, error: "Zakaz berish huquqi yo‘q." };
  const parsed = agregatSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await createAgregatOrder(user, parsed.data);
  return result.ok ? { ok: true, number: result.number } : result;
}

export async function createZapchastOrderAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (!canCreateOrders(user.role)) return { ok: false, error: "Zakaz berish huquqi yo‘q." };
  const parsed = zapchastSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await createZapchastOrder(user, parsed.data);
  return result.ok ? { ok: true, number: result.number } : result;
}

/** "+ Zayavkasiz chiqim": only the workshop writes it, for a chosen seller. */
export async function createNoRequestAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (user.role !== "WORKSHOP") return { ok: false, error: "Zayavkasiz chiqimni faqat sex mas’uli yozadi." };
  const parsed = zapchastSchema.extend({ sellerId: z.string().min(1, "Sotuvchini tanlang.").max(40) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await createZapchastOrder(user, parsed.data, parsed.data.sellerId);
  return result.ok ? { ok: true, number: result.number } : result;
}

const transitionSchema = z.object({ id: z.string().min(1).max(40), action: z.enum(["accept", "issue", "receive"]), issuedQty: z.record(z.string().max(40), z.number().int().min(0).max(9999)).optional() });
/** Status buttons; the role check for each step is in lib/sex/rules.ts (checkTransition). */
export async function transitionOrderAction(raw: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  const parsed = transitionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "So‘rov noto‘g‘ri." };
  const result = await transitionOrder(user, parsed.data.id, parsed.data.action, parsed.data.issuedQty);
  return result.ok ? { ok: true } : result;
}

export async function confirmNoRequestAction(id: unknown): Promise<SexActionResult> {
  const user = await requireSexUser();
  if (user.role !== "SELLER" || typeof id !== "string") return { ok: false, error: "Faqat sotuvchi tasdiqlaydi." };
  return confirmNoRequest(user, id);
}
