"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireRole } from "@/lib/auth/require-admin";
import { copySalesPlans, createSalesPeriod, deleteSalesPerson, saveSalesMonthly, saveSalesPerson, saveSalesPlans, SalesPlanError, type PersonInput } from "@/lib/sales-plan/mutations";

export type SalesPlanActionResult = { ok: true; id?: string; count?: number } | { ok: false; error: string };
function failure(error: unknown): SalesPlanActionResult {
  if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message || "Ma’lumotlarni tekshiring." };
  if (error instanceof SalesPlanError) return { ok: false, error: error.message };
  console.error("[SalesPlanAction]", { name: error instanceof Error ? error.name : "UnknownError" });
  return { ok: false, error: "Saqlab bo‘lmadi. Qayta urinib ko‘ring." };
}
function refresh() { revalidatePath("/admin/sales-plan"); revalidatePath("/admin/sales-plan/people"); }
const admin = () => requireRole("SUPER_ADMIN", "ADMIN");

export async function saveSalesPersonAction(id: string | null, input: PersonInput): Promise<SalesPlanActionResult> {
  const actor = await admin();
  try { const person = await saveSalesPerson(id, input, actor); refresh(); return { ok: true, id: person.id }; } catch (error) { return failure(error); }
}
export async function deleteSalesPersonAction(id: string): Promise<SalesPlanActionResult> {
  const actor = await admin();
  try { await deleteSalesPerson(id, actor); refresh(); return { ok: true }; } catch (error) { return failure(error); }
}
export async function createSalesPeriodAction(input: { name: string; startYear: number; startMonth: number; monthCount: number }): Promise<SalesPlanActionResult> {
  const actor = await admin();
  try { const period = await createSalesPeriod(input, actor); refresh(); return { ok: true, id: period.id }; } catch (error) { return failure(error); }
}
export async function saveSalesPlansAction(periodId: string, plans: Array<{ personId: string; plan: string }>): Promise<SalesPlanActionResult> {
  const actor = await admin();
  try { const count = await saveSalesPlans({ periodId, plans }, actor); refresh(); return { ok: true, count }; } catch (error) { return failure(error); }
}
export async function copySalesPlansAction(periodId: string, fromPeriodId: string): Promise<SalesPlanActionResult> {
  const actor = await admin();
  try { const count = await copySalesPlans(periodId, fromPeriodId, actor); refresh(); return { ok: true, count }; } catch (error) { return failure(error); }
}
export async function saveSalesMonthlyAction(input: { year: number; month: number; entries: Array<{ personId: string; amount: string }>; clear: string[] }): Promise<SalesPlanActionResult> {
  const actor = await admin();
  try { const count = await saveSalesMonthly(input, actor); refresh(); return { ok: true, count }; } catch (error) { return failure(error); }
}
