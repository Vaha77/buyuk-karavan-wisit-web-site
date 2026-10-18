import type { Metadata } from "next";
import { requireSeller } from "@/lib/auth/require-admin";
import { customerLeaderboard, myCustomers, myDashboard, myRegionMap, myStats, toRow } from "@/lib/customers/seller-queries";
import { getSellerRanking } from "@/lib/sales-plan/queries";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { NotLinked } from "@/components/admin/bklead/not-linked";
import { NewCustomerButton, SellerCustomerList } from "@/components/admin/bklead/seller";
import { CustomersBlock, DynamicsBlock, LeadsBlock, MarjaBlock, OrdersBlock, PlanBlock, RankCard, TodayBlock } from "@/components/admin/bklead/seller-dashboard";
import { SellerRegionMap } from "@/components/admin/bklead/seller-region-map";
import { CustomerLeaderboard } from "@/components/admin/bklead/customer-leaderboard";

export const metadata: Metadata = { title: "Mening dashboardim | BUYUK KARAVAN" };

export default async function MyCustomersPage() {
  const { user } = await requireSeller();
  if (!user.salesPersonId) return <NotLinked/>;
  const now = tashkentYearMonth(), year = now.year;
  // Every loader is scoped to this seller; the plan ranking returns only the seller's own place.
  const [customers, stats, regions, { periodName, me }, leaders, data] = await Promise.all([myCustomers(user), myStats(user, year), myRegionMap(user, year), getSellerRanking(user.salesPersonId), customerLeaderboard(user, now), myDashboard(user, now)]);
  const rows = customers.map(customer => toRow(customer));
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  return <div className="bk">
    <div className="bk-head"><div><h1>Mening dashboardim</h1><p className="bk-muted">Salom, {firstName} · faqat sizning ma’lumotlaringiz{periodName ? ` · ${periodName}` : ""}</p></div><NewCustomerButton/></div>
    <PlanBlock plan={data.plan} month={now.month}/>
    <RankCard me={me} periodName={periodName}/>
    <TodayBlock due={stats.due} pending={stats.pendingCount} newLeads={data.newLeads}/>
    <CustomersBlock data={data}/>
    <CustomerLeaderboard rows={leaders} year={year}/>
    <DynamicsBlock data={data} now={now}/>
    {data.leads && <LeadsBlock leads={data.leads}/>}
    {data.marja && <MarjaBlock marja={data.marja}/>}
    <SellerRegionMap data={regions} year={year}/>
    <OrdersBlock orders={data.orders}/>
    <section className="bk-card" aria-labelledby="sl-list-title" style={{ display: "grid", gap: 12 }}>
      <div className="bk-card-head" style={{ marginBottom: 0 }}><div><h2 id="sl-list-title">Mijozlar</h2><span className="bk-muted">{rows.length} ta · raqam = oxirgi xariddan beri kunlar (qizil — oraliq o‘tgan, sariq — kelishilgan qo‘ng‘iroq)</span></div></div>
      <SellerCustomerList customers={rows}/>
    </section>
  </div>;
}
