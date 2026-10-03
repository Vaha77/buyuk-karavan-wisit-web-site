import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/require-admin";
import { myCustomers, myRegionMap, myStats, toRow } from "@/lib/customers/seller-queries";
import { getSellerRanking } from "@/lib/sales-plan/queries";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { formatInt, formatUsd } from "@/lib/dashboard/format";
import { NotLinked } from "@/components/admin/bklead/not-linked";
import { NewCustomerButton, SellerCustomerList } from "@/components/admin/bklead/seller";
import { RankHero, SellerRankingList } from "@/components/admin/bklead/seller-dashboard";
import { SellerRegionMap } from "@/components/admin/bklead/seller-region-map";

export const metadata: Metadata = { title: "Mening mijozlarim | BUYUK KARAVAN" };

export default async function MyCustomersPage() {
  const { user } = await requireSeller();
  if (!user.salesPersonId) return <NotLinked/>;
  const year = tashkentYearMonth().year;
  // Ranking: other sellers only appear as name/rank/%/zone; the map uses the seller's own customers only.
  const [customers, stats, regions, { periodName, ranking }] = await Promise.all([myCustomers(user), myStats(user, year), myRegionMap(user, year), getSellerRanking(user.salesPersonId)]);
  const rows = customers.map(customer => toRow(customer));
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  return <div className="bk">
    <div className="bk-head"><div><h1>Salom, {firstName}</h1><p className="bk-muted">Faqat sizga biriktirilgan mijozlar{periodName ? ` · ${periodName}` : ""}</p></div><NewCustomerButton/></div>
    <RankHero me={ranking.me}/>
    <div className="bk-grid-4">
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Faol mijozlar</div><strong>{formatInt(stats.customers)}</strong><span className="bk-kpi-foot">{regions.opened} viloyatda</span></div>
      <Link href="/admin/my/today" className="bk-card bk-kpi sl-kpi-link"><div className="bk-kpi-top">Bugun qo‘ng‘iroq</div><strong className={stats.due ? "sl-alert" : undefined}>{formatInt(stats.due)}</strong><span className="bk-kpi-foot">muddati kelgan mijozlar</span></Link>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">{year}-yil tasdiqlangan savdo</div><strong>{formatUsd(stats.approvedUsd)}</strong><span className="bk-kpi-foot">faqat sizning mijozlaringiz</span></div>
      <Link href="/admin/my/purchase" className="bk-card bk-kpi sl-kpi-link"><div className="bk-kpi-top">Tasdiqlash kutilmoqda</div><strong>{formatInt(stats.pendingCount)}</strong><span className="bk-kpi-foot">{formatUsd(stats.pendingUsd)} · statistikaga hali qo‘shilmagan</span></Link>
    </div>
    <SellerRegionMap data={regions} year={year}/>
    <SellerRankingList rows={ranking.rows} periodName={periodName}/>
    <section className="bk-card" aria-labelledby="sl-list-title" style={{ display: "grid", gap: 12 }}>
      <div className="bk-card-head" style={{ marginBottom: 0 }}><div><h2 id="sl-list-title">Mijozlar</h2><span className="bk-muted">{rows.length} ta · raqam = oxirgi xariddan beri kunlar (qizil — oraliq o‘tgan, sariq — kelishilgan qo‘ng‘iroq)</span></div></div>
      <SellerCustomerList customers={rows}/>
    </section>
  </div>;
}
