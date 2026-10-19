"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireAdmin, requireRole } from "@/lib/auth/require-admin";
import { missingInPeriod, monthTotal, periodPoints, regionCodesFor, resolvePeriod, sumBuckets, type PeriodPoint, type ResolvedPeriod } from "@/lib/customers/region-period";
import { CUSTOMER_REGIONS } from "@/lib/dashboard/regions";
import { CustomerError, deleteRegularCustomer, saveDashboardTips, saveMonthlySale, saveRankingPrizes, saveRegularCustomer, type CustomerInput, type MonthlySaleInput } from "@/lib/customers/mutations";
import { getCustomerYear, regionDayRows, regionMonthRows } from "@/lib/customers/queries";
import { approvePurchase, PurchaseReviewError, rejectPurchase } from "@/lib/customers/seller-service";

export type CustomerActionResult = { ok: true; id?: string } | { ok: false; error: string };
function failure(error: unknown): CustomerActionResult {
  if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message || "Ma’lumotlarni tekshiring." };
  if (error instanceof CustomerError) return { ok: false, error: error.message };
  if (error instanceof PurchaseReviewError) return { ok: false, error: error.message };
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

export async function approvePurchaseAction(id: string): Promise<CustomerActionResult> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  try { await approvePurchase(actor, id); refresh(); revalidatePath("/admin/customers/purchases"); return { ok: true }; } catch (error) { return failure(error); }
}
export async function rejectPurchaseAction(id: string, reason: string): Promise<CustomerActionResult> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  try { await rejectPurchase(actor, id, typeof reason === "string" ? reason : ""); revalidatePath("/admin/customers/purchases"); return { ok: true }; } catch (error) { return failure(error); }
}

/** manual: "Bu oy" — monthly total minus the approved purchases drawn by day (amounts entered by hand, not split into days). */
export type RegionPeriodResult = ({ ok: true; points: PeriodPoint[]; total: number; manual: number; missing: Array<{ key: string; label: string; names: string[] }> } & ResolvedPeriod) | { ok: false; error: string };
/** Region panel "Davr" (read-only, whoever sees the page): daily from approved purchases, monthly / yearly from the monthly entries. */
export async function regionPeriodAction(input: { region: string; period?: string | null; from?: string | null; to?: string | null }): Promise<RegionPeriodResult> {
  await requireAdmin();
  if (typeof input?.region !== "string" || !CUSTOMER_REGIONS.some(region => region.code === input.region)) return { ok: false, error: "Viloyat topilmadi." };
  const now = new Date(), codes = regionCodesFor(input.region), asked = resolvePeriod(input, now);
  if (!asked.ok) return asked;
  try {
    let period = asked.period;
    if (period.grain === "day") {
      const month = period.mode === "month" ? period.from.slice(0, 7) : null;
      const [days, monthRows] = await Promise.all([regionDayRows(codes, period.from, period.to), month ? regionMonthRows(codes, period.from, period.to) : null]);
      const points = periodPoints(period, new Map(days.map(row => [row.key, Number(row.value)])), [], now);
      const drawn = Math.round(points.reduce((sum, point) => sum + (point.value ?? 0), 0) * 100) / 100, total = month && monthRows ? monthTotal(monthRows, month) : drawn;
      return { ok: true, ...period, points, total, manual: Math.max(0, Math.round((total - drawn) * 100) / 100), missing: [] };
    }
    const rows = await regionMonthRows(codes, period.mode === "all" ? null : period.from, period.to);
    if (period.mode === "all") {
      const first = rows.flatMap(row => (row.year !== null && row.month !== null ? [`${row.year}-${String(row.month).padStart(2, "0")}`] : [])).sort()[0] ?? null;
      const resolved = resolvePeriod({ period: "all" }, now, first);
      if (resolved.ok) period = resolved.period;
    }
    const missing = missingInPeriod(rows, period, now), points = periodPoints(period, sumBuckets(rows, period.grain), missing.map(item => item.key), now);
    return { ok: true, ...period, points, total: Math.round(points.reduce((sum, point) => sum + (point.value ?? 0), 0) * 100) / 100, manual: 0, missing };
  } catch (error) {
    console.error("[RegionPeriod]", { name: error instanceof Error ? error.name : "UnknownError" });
    return { ok: false, error: "Ma’lumot olinmadi. Qayta urinib ko‘ring." };
  }
}
