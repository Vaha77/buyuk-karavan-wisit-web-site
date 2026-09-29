import type { Metadata } from "next";
import { ExchangeRateSettings } from "@/components/admin/exchange-rate-settings";
import { PrizesForm, TipsForm } from "@/components/admin/bklead/customer-forms";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { getCustomerYear } from "@/lib/customers/queries";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
export const metadata:Metadata={title:"Sozlamalar — Admin | BUYUK KARAVAN"};
export default async function Page(){
  const user = await requireAdmin();
  const { year } = tashkentYearMonth();
  const [rate, customerYear, settings] = await Promise.all([getUsdUzsRate(), getCustomerYear(year), getDb().siteSettings.findUnique({ where: { id: "global" }, select: { dashboardTips: true } }).catch(() => null)]);
  const canEdit = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  return <><ExchangeRateSettings rate={rate}/>{canEdit && <div className="bk" style={{ marginTop: 20 }}><PrizesForm year={year} prizes={customerYear.prizes}/><TipsForm tips={(settings?.dashboardTips as Record<string, string> | null) ?? {}}/></div>}</>;
}
