"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireRole } from "@/lib/auth/require-admin";
import { CustomerError, deleteRegularCustomer, saveDashboardTips, saveMonthlySale, saveRankingPrizes, saveRegularCustomer, type CustomerInput, type MonthlySaleInput } from "@/lib/customers/mutations";
import { getCustomerYear } from "@/lib/customers/queries";

export type CustomerActionResult = { ok: true; id?: string } | { ok: false; error: string };
function failure(error: unknown): CustomerActionResult {
  if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message || "Ma’lumotlarni tekshiring." };
  if (error instanceof CustomerError) return { ok: false, error: error.message };
  console.error("[CustomerAction]", { name: error instanceof Error ? error.name : "UnknownError" });
  return { ok: false, error: "Saqlab bo‘lmadi. Qayta urinib ko‘ring." };
}
function refresh() { revalidatePath("/admin"); revalidatePath("/admin/customers"); }

export async function saveCustomerAction(id: string | null, input: CustomerInput): Promise<CustomerActionResult> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  try { const customer = await saveRegularCustomer(id, input, actor); refresh(); return { ok: true, id: customer.id }; } catch (error) { return failure(error); }
}
export async function deleteCustomerAction(id: string): Promise<CustomerActionResult> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  try { await deleteRegularCustomer(id, actor); refresh(); return { ok: true }; } catch (error) { return failure(error); }
}
export async function saveMonthlySaleAction(input: MonthlySaleInput): Promise<CustomerActionResult> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  try { const sale = await saveMonthlySale(input, actor); refresh(); return { ok: true, id: sale.id }; } catch (error) { return failure(error); }
}
export async function savePrizesAction(year: number, prizes: Array<{ place: number; prizeText: string }>): Promise<CustomerActionResult> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  try { await saveRankingPrizes({ year, prizes }, actor); refresh(); revalidatePath("/admin/settings"); return { ok: true }; } catch (error) { return failure(error); }
}
export async function saveTipsAction(tips: Record<string, string>): Promise<CustomerActionResult> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  try { await saveDashboardTips(tips, actor); refresh(); revalidatePath("/admin/settings"); return { ok: true }; } catch (error) { return failure(error); }
}
/** Entry form preview for a year other than the one shown on the page. */
export async function loadCustomerYearAction(year: number) {
  await requireRole("SUPER_ADMIN", "ADMIN");
  return getCustomerYear(Math.min(2100, Math.max(2020, Math.trunc(year))));
}
