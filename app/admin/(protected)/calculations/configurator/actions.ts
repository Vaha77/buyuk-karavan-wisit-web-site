"use server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { KIT_MARKUP_MAX } from "@/lib/sex/configurator";
import { quoteKit, saveKitCalculation } from "@/lib/sex/kit-service";

const kitSchema = z.object({
  templateId: z.string().min(1).max(40),
  selection: z.object({ comp: z.string().min(1).max(60), cond: z.string().min(1).max(20), evap: z.string().min(1).max(20) }),
  markup: z.number().int().min(0).max(KIT_MARKUP_MAX),
  extras: z.array(z.object({ name: z.string().trim().max(200), price: z.number().min(0).max(10_000_000) })).max(30),
});

/** Client price for users who do not receive price-list prices (everyone except SUPER_ADMIN). */
export async function quoteKitAction(raw: unknown): Promise<{ ok: true; clientPrice: number } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = kitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Tanlovni tekshiring." };
  const quote = await quoteKit(parsed.data);
  return quote ? { ok: true, clientPrice: quote.clientPrice } : { ok: false, error: "Komplekt praysda topilmadi." };
}

const customerSchema = z.object({ kind: z.enum(["customer", "lead", "new"]), id: z.string().max(40).nullable(), name: z.string().trim().max(160), phone: z.string().trim().max(40) });
export async function saveKitAction(raw: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const actor = await requireAdmin();
  const parsed = kitSchema.extend({ customer: customerSchema }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Ma’lumotlarni tekshiring." };
  return saveKitCalculation(actor, parsed.data);
}
