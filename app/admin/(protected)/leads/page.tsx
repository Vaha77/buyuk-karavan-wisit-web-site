import type { Metadata } from "next";
import { AdminLeadsPage } from "@/components/admin/admin-leads-page";
import "@/components/admin/admin-leads.css";
import { getAdminLeads } from "@/lib/leads/queries";
import { COUNTRY_NAMES, regionName, type LeadCountry } from "@/lib/dashboard/regions";
export const metadata: Metadata = { title: "Mijoz so‘rovlari — Admin | BUYUK KARAVAN" };
// ?region= (from the dashboard map) filters by country or region; ?lead= opens one lead (from referral visitors).
export default async function Page({ searchParams }: { searchParams: Promise<{ region?: string; lead?: string }> }) {
  const { region = "", lead = "" } = await searchParams;
  const code = region.trim().toUpperCase();
  const regionLabel = !code ? "" : code === "NONE" ? "Aniqlanmagan" : code in COUNTRY_NAMES ? COUNTRY_NAMES[code as LeadCountry] : regionName(code);
  return <AdminLeadsPage leads={await getAdminLeads({ region: code })} initialSelectedId={lead || null} regionLabel={regionLabel}/>;
}
