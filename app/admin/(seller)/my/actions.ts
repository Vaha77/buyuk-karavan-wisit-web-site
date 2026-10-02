"use server";

import { revalidatePath } from "next/cache";
import { requireSeller } from "@/lib/auth/require-admin";
import { CustomerNotFound, SellerError } from "@/lib/customers/seller-repo";
import { addCustomerAsSeller, createPurchaseAsSeller, recordContactAsSeller, updateCustomerAsSeller } from "@/lib/customers/seller-service";
import { CALL_INTERVALS, CONTACT_RESULTS, type ContactResult } from "@/lib/customers/seller-rules";
import { isCountryCode, isRegionOf } from "@/lib/dashboard/regions";

// Every action starts with requireSeller(); the repository then scopes each query to the seller's own customers.
export type SellerActionResult = { ok: true; id?: string } | { ok: false; error: string };

function failure(error: unknown): SellerActionResult {
  if (error instanceof CustomerNotFound) return { ok: false, error: "Mijoz topilmadi." };
  if (error instanceof SellerError) return { ok: false, error: error.message };
  console.error("[SellerAction]", { name: error instanceof Error ? error.name : "UnknownError" });
  return { ok: false, error: "Saqlab bo‘lmadi. Qayta urinib ko‘ring." };
}
function refresh(customerId?: string) { revalidatePath("/admin/my"); revalidatePath("/admin/my/today"); revalidatePath("/admin/my/purchase"); if (customerId) revalidatePath(`/admin/my/customers/${customerId}`); }
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
function location(country: unknown, regionCode: unknown) {
  const code = isCountryCode(country) ? country : "UZ";
  const region = typeof regionCode === "string" && regionCode && isRegionOf(regionCode, code) ? regionCode : null;
  return { country: code, regionCode: region };
}
const interval = (value: unknown) => (CALL_INTERVALS as readonly number[]).includes(Number(value)) ? Number(value) : 60;
function parseDay(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+05:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function addMyCustomerAction(input: { name: string; phone: string; country: string; regionCode: string; note: string; callIntervalDays: number }): Promise<SellerActionResult> {
  const seller = await requireSeller();
  try {
    const result = await addCustomerAsSeller(seller.user, { name: text(input.name, 120), phone: text(input.phone, 40), ...location(input.country, input.regionCode), note: text(input.note, 500) || null, callIntervalDays: interval(input.callIntervalDays) });
    if (!result.ok) return { ok: false, error: result.message };
    refresh(); return { ok: true, id: result.id };
  } catch (error) { return failure(error); }
}

export async function updateMyCustomerAction(id: string, input: { name: string; country: string; regionCode: string; note: string; callIntervalDays: number }): Promise<SellerActionResult> {
  const seller = await requireSeller();
  try { await updateCustomerAsSeller(seller.user, text(id, 40), { name: text(input.name, 120), ...location(input.country, input.regionCode), note: text(input.note, 500) || null, callIntervalDays: interval(input.callIntervalDays) }); refresh(id); return { ok: true }; } catch (error) { return failure(error); }
}

export async function recordContactAction(customerId: string, input: { result: string; note: string; nextContactAt: string }): Promise<SellerActionResult> {
  const seller = await requireSeller();
  try {
    if (!(input.result in CONTACT_RESULTS)) return { ok: false, error: "Natijani tanlang." };
    const saved = await recordContactAsSeller(seller.user, text(customerId, 40), { result: input.result as ContactResult, note: text(input.note, 500) || null, nextContactAt: parseDay(input.nextContactAt) });
    refresh(customerId); return { ok: true, id: saved.id };
  } catch (error) { return failure(error); }
}

export async function createPurchaseAction(input: { customerId: string; date: string; amount: string; currency: string; note: string }): Promise<SellerActionResult> {
  const seller = await requireSeller();
  try {
    const date = parseDay(input.date);
    if (!date || date.getTime() > Date.now() + 86_400_000) return { ok: false, error: "Sanani tanlang (kelajakdagi sana bo‘lmaydi)." };
    const amount = Number(text(input.amount, 30).replace(/[\s,]/g, ""));
    if (input.currency !== "USD" && input.currency !== "UZS") return { ok: false, error: "Valyutani tanlang." };
    // The DATE column stores the calendar day; keep it as UTC midnight of that day.
    const saved = await createPurchaseAsSeller(seller.user, text(input.customerId, 40), { date: new Date(`${input.date}T00:00:00Z`), amount, currency: input.currency, note: text(input.note, 500) || null });
    refresh(input.customerId); return { ok: true, id: saved.id };
  } catch (error) { return failure(error); }
}
