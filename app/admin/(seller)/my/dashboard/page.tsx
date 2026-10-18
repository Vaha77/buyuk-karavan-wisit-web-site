import type { Metadata } from "next";
import { requireSeller } from "@/lib/auth/require-admin";
import { customerLeaderboard, myDashboard, myStats } from "@/lib/customers/seller-queries";
import { getSellerRanking } from "@/lib/sales-plan/queries";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { NotLinked } from "@/components/admin/bklead/not-linked";
import { CustomersBlock, DynamicsBlock, LeadsBlock, MarjaBlock, OrdersBlock, PlanBlock, RankCard, TodayBlock } from "@/components/admin/bklead/seller-dashboard";
import { CustomerLeaderboard } from "@/components/admin/bklead/customer-leaderboard";

export const metadata: Metadata = { title: "Mening dashboardim | BUYUK KARAVAN" };

export default async function MyDashboardPage() {
  const { user } = await requireSeller();
  if (!user.salesPersonId) return <NotLinked/>;
  const now = tashkentYearMonth(), year = now.year;
  // Every loader is scoped to this seller; the plan ranking returns only the seller's own place.
  const [stats, { periodName, me }, leaders, data] = await Promise.all([myStats(user, year), getSellerRanking(user.salesPersonId), customerLeaderboard(user, now), myDashboard(user, now)]);
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  return <div className="bk">
    <div className="bk-head"><div><h1>Mening dashboardim</h1><p className="bk-muted">Salom, {firstName} · faqat sizning ma’lumotlaringiz{periodName ? ` · ${periodName}` : ""}</p></div></div>
    <PlanBlock plan={data.plan} month={now.month}/>
    <RankCard me={me} periodName={periodName}/>
    <TodayBlock due={stats.due} pending={stats.pendingCount} newLeads={data.newLeads}/>
    <CustomersBlock data={data}/>
    <DynamicsBlock data={data} now={now}/>
    {data.leads && <LeadsBlock leads={data.leads}/>}
    {data.marja && <MarjaBlock marja={data.marja}/>}
    <OrdersBlock orders={data.orders}/>
    <CustomerLeaderboard rows={leaders} year={year}/>
  </div>;
}
