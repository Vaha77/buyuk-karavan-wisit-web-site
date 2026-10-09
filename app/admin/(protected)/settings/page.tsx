import type { Metadata } from "next";
import { ExchangeRateSettings } from "@/components/admin/exchange-rate-settings";
import { PrizesForm, TipsForm } from "@/components/admin/bklead/customer-forms";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { getCustomerYear } from "@/lib/customers/queries";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { getZoneThresholds } from "@/lib/sales-plan/queries";
import { ZoneThresholdsForm } from "@/components/admin/bklead/zone-settings";
import { WorkshopLimitForm } from "@/components/admin/sex/workshop-limit-form";
import { TelegramLink } from "@/components/admin/sex/telegram-link";
import "@/components/admin/sex/sex.css";
import { DEFAULT_WORKSHOP_DAILY_LIMIT } from "@/lib/sex/rules";
export const metadata:Metadata={title:"Sozlamalar — Admin | BUYUK KARAVAN"};
export default async function Page(){
  const user = await requireAdmin();
  const { year } = tashkentYearMonth();
  const [rate, customerYear, settings, thresholds] = await Promise.all([getUsdUzsRate(), getCustomerYear(year), getDb().siteSettings.findUnique({ where: { id: "global" }, select: { dashboardTips: true, workshopDailyLimit: true } }).catch(() => null), getZoneThresholds()]);
  const canEdit = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  return <><ExchangeRateSettings rate={rate}/>{canEdit && <div className="bk" style={{ marginTop: 20 }}><PrizesForm year={year} prizes={customerYear.prizes}/><TipsForm tips={(settings?.dashboardTips as Record<string, string> | null) ?? {}}/><ZoneThresholdsForm thresholds={thresholds}/><WorkshopLimitForm limit={settings?.workshopDailyLimit ?? DEFAULT_WORKSHOP_DAILY_LIMIT}/><section className="bk-card" aria-labelledby="seh-tg-title" style={{ display: "grid", gap: 12 }}><div><h2 id="seh-tg-title">Seh Telegram boti</h2><p className="bk-muted">Seh guruhiga faqat “Sehdan chiqdi” hisobotlari boradi. O‘zingizni ulab, shaxsiy test xabar bilan tekshirishingiz mumkin.</p></div><TelegramLink linked={!!user.telegramChatId} groupTest/></section></div>}</>;
}
