import type { Metadata } from "next";
import { AdminLeadsPage } from "@/components/admin/admin-leads-page";
import "@/components/admin/admin-leads.css";
import { getAdminLeads } from "@/lib/leads/queries";
import { getLeadStats } from "@/lib/leads/stats";
import { COUNTRY_NAMES, regionName, type LeadCountry } from "@/lib/dashboard/regions";
export const metadata: Metadata = { title: "Mijoz so‘rovlari — Admin | BUYUK KARAVAN" };
// ?period= picks the charts' range (default 7 kun); ?region= (from the dashboard map) filters by country or region; ?lead= opens one lead (from referral visitors).
export default async function Page({ searchParams }: { searchParams: Promise<{ region?: string; lead?: string; period?: string }> }) {
  const { region = "", lead = "", period } = await searchParams;
  const code = region.trim().toUpperCase();
  const regionLabel = !code ? "" : code === "NONE" ? "Aniqlanmagan" : code in COUNTRY_NAMES ? COUNTRY_NAMES[code as LeadCountry] : regionName(code);
  const [leads, charts] = await Promise.all([getAdminLeads({ region: code }), getLeadStats(period, code)]);
  return <AdminLeadsPage leads={leads} charts={charts} initialSelectedId={lead || null} regionLabel={regionLabel}/>;
}
