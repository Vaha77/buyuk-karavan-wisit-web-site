"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireImportUser } from "@/lib/auth/require-admin";
import { createOrder, decideOrder, markSent, resubmitOrder } from "@/lib/import/service";
import { MAX_QTY, parseNeededBy } from "@/lib/import/rules";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const text = (max: number) => z.string().trim().max(max).nullish().transform(value => value || null);
const OrderSchema = z.object({
  orderId: z.string().max(40).nullish(), requestId: z.string().max(40).nullish(),
  items: z.array(z.object({ productId: z.string().min(1).max(40), qty: z.number().int().min(1).max(MAX_QTY) })).min(1, "Savatcha bo‘sh.").max(500),
  client: text(200), neededBy: z.string().max(10).nullish(), comment: text(1000),
});

/** "Rasmiylashtirish" (new order) or "Qayta yuborish" (a RETURNED order of this seller). */
export async function submitImportOrderAction(raw: unknown): Promise<Result<{ number: string }>> {
  const user = await requireImportUser();
  const parsed = OrderSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ma’lumot noto‘g‘ri." };
  const neededBy = parseNeededBy(parsed.data.neededBy);
  if (neededBy === undefined) return { ok: false, error: "Muddat sanasi noto‘g‘ri." };
  const input = { items: parsed.data.items, client: parsed.data.client, neededBy, comment: parsed.data.comment, requestId: parsed.data.requestId };
  const result = parsed.data.orderId ? await resubmitOrder(user, parsed.data.orderId, input) : await createOrder(user, input);
  if (result.ok) revalidatePath("/admin/import", "layout");
  return result;
}

const DecisionSchema = z.object({
  orderId: z.string().min(1).max(40), decision: z.enum(["approve", "return", "reject"]), note: text(500),
  quantities: z.record(z.string().max(40), z.number().int().min(0).max(MAX_QTY)).optional(),
});
export async function decideImportOrderAction(raw: unknown): Promise<Result<{ already: boolean }>> {
  const user = await requireImportUser();
  const parsed = DecisionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ma’lumot noto‘g‘ri." };
  const result = await decideOrder(user, parsed.data.orderId, parsed.data.decision, parsed.data.note, parsed.data.quantities);
  if (result.ok) revalidatePath("/admin/import", "layout");
  return result;
}

/** Boss: "Zavodga yuborildi" for the APPROVED orders shown on the summary. */
export async function markImportSentAction(raw: unknown): Promise<Result<{ count: number }>> {
  const user = await requireImportUser();
  if (user.role !== "SUPER_ADMIN") return { ok: false, error: "Faqat Super Admin." };
  const parsed = z.array(z.string().min(1).max(40)).min(1).max(1000).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Zayavka tanlanmagan." };
  const count = await markSent(parsed.data);
  revalidatePath("/admin/import", "layout");
  return { ok: true, count };
}

