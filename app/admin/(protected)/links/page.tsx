import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatInt, formatPercent, formatUsd, percentOf } from "@/lib/dashboard/format";
import { dayKey, periodQuery, resolvePeriod } from "@/lib/dashboard/period";
import { getLinkSummary } from "@/lib/referrals/queries";
import { SITE_URL } from "@/lib/site-url";
import { LinksTable } from "@/components/admin/bklead/links-table";
import { RangeSelect } from "@/components/admin/bklead/bits";

export const metadata: Metadata = { title: "Referal linklar — Admin | BUYUK KARAVAN" };

export default async function LinksPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireAdmin();
  const period = resolvePeriod(await searchParams);
  const { rows, totals, active } = await getLinkSummary(period);
  const canEdit = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const withLeads = rows.filter(row => row.clicks > 0 && row.leads > 0).sort((a, b) => b.conversion - a.conversion);
  const attention = rows.filter(row => row.clicks >= 50).sort((a, b) => a.conversion - b.conversion || (b.costPerLead ?? 0) - (a.costPerLead ?? 0))[0];
  return <div className="bk">
    <Link className="bk-back" href={`/admin${periodQuery(period)}`}>← Dashboard</Link>
    <div className="bk-head">
      <div><h1>Referal linklar</h1><p className="bk-muted">Har bir reklama, bloger yoki post uchun alohida link — kim kirdi va nima qildi</p></div>
      <div className="bk-actions"><RangeSelect value={period.key} from={dayKey(period.from)} to={dayKey(new Date(period.to.getTime() - 86_400_000))}/>{canEdit && <Link className="bk-btn is-primary" href="/admin/links/new"><Plus size={16}/>Yangi link</Link>}</div>
    </div>
    <div className="bk-grid-4">
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Faol linklar</div><strong>{formatInt(active)}</strong></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Kliklar · {period.label.toLocaleLowerCase("uz-UZ")}</div><strong>{formatInt(totals.clicks)}</strong></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Zayavkalar</div><strong>{formatInt(totals.leads)}<small>· {formatPercent(percentOf(totals.leads, totals.clicks))}</small></strong></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Xarajat → bitta lid narxi</div><strong>{formatUsd(totals.costUsd)}<small>· {totals.paidLeads ? formatUsd(totals.costUsd / totals.paidLeads, 1) : "—"}</small></strong></div>
    </div>
    <LinksTable rows={rows} siteHost={SITE_URL.replace(/^https?:\/\//, "")} canEdit={canEdit}/>
    {rows.length > 0 && <div className="bk-grid-3">
      <div className="bk-insight is-blue"><span>Eng yuqori konversiya</span><strong>{withLeads.length ? withLeads.slice(0, 2).map(row => `${row.name} — ${formatPercent(row.conversion)}`).join(" · ") : "Hali zayavka yo‘q"}</strong></div>
      <div className="bk-insight is-soft"><span>E’tibor kerak</span><strong>{attention ? `${attention.name} — ${formatInt(attention.clicks)} klik, ${formatPercent(attention.conversion)} konversiya${attention.costPerLead ? `, lid ${formatUsd(attention.costPerLead, 1)}` : ""}` : "Hozircha yo‘q (50+ klikli linklar tekshiriladi)"}</strong></div>
      <div className="bk-insight"><span>Ta’riflar</span><span className="bk-muted">Har bir tashrifchi faqat eng oxirgi harakati bo‘yicha bir marta sanaladi: ketdi + qiziqdi + bog‘lanish + zayavka = klik.</span></div>
    </div>}
  </div>;
}
