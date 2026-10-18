import type { Metadata } from "next";
import { Suspense } from "react";
import type { AdminUser } from "@/generated/prisma/client";
import { requireSeller } from "@/lib/auth/require-admin";
import { customerLeaderboard, myDashboardAgent, myDashboardCore, myOpenOrders, myStats } from "@/lib/customers/seller-queries";
import { getSellerRanking } from "@/lib/sales-plan/queries";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { MONTHS_LONG } from "@/lib/dashboard/format";
import { NotLinked } from "@/components/admin/bklead/not-linked";
import { CustomersBlock, DynamicsBlock, LeadsBlock, MarjaBlock, OrdersBlock, PlanBlock, RankCard, TodayBlock } from "@/components/admin/bklead/seller-dashboard";
import { CustomerLeaderboard } from "@/components/admin/bklead/customer-leaderboard";
import { BlockSkeleton } from "@/components/admin/skeletons";

export const metadata: Metadata = { title: "Mening dashboardim | BUYUK KARAVAN" };

type User = Pick<AdminUser, "id" | "role" | "salesPersonId">;
type Now = { year: number; month: number };

// Each block awaits only its own data and streams in on its own (Reja and Bugun first); every loader is scoped to the seller.
async function Plan({ user, now }: { user: User; now: Now }) { return <PlanBlock plan={(await myDashboardCore(user, now)).plan} month={now.month}/>; }
async function Rank({ user }: { user: User }) { const { periodName, me } = await getSellerRanking(user.salesPersonId); return <RankCard me={me} periodName={periodName}/>; }
async function Today({ user, now }: { user: User; now: Now }) {
  const [stats, agent] = await Promise.all([myStats(user, now.year), myDashboardAgent(user, now)]);
  return <TodayBlock due={stats.due} pending={stats.pendingCount} newLeads={agent.newLeads}/>;
}
async function Customers({ user, now }: { user: User; now: Now }) { return <CustomersBlock data={await myDashboardCore(user, now)}/>; }
async function Dynamics({ user, now }: { user: User; now: Now }) { return <DynamicsBlock data={await myDashboardCore(user, now)} now={now}/>; }
async function AgentBlocks({ user, now }: { user: User; now: Now }) {
  const { leads, marja } = await myDashboardAgent(user, now);
  return <>{leads && <LeadsBlock leads={leads}/>}{marja && <MarjaBlock marja={marja}/>}</>;
}
async function Orders({ user }: { user: User }) { return <OrdersBlock orders={await myOpenOrders(user.id)}/>; }
async function Leaders({ user, now }: { user: User; now: Now }) { return <CustomerLeaderboard rows={await customerLeaderboard(user, now)} year={now.year}/>; }

export default async function MyDashboardPage() {
  const { user } = await requireSeller();
  if (!user.salesPersonId) return <NotLinked/>;
  const now = tashkentYearMonth();
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  return <div className="bk">
    <div className="bk-head"><div><h1>Mening dashboardim</h1><p className="bk-muted">Salom, {firstName} · {MONTHS_LONG[now.month - 1]} {now.year}</p></div></div>
    <Suspense fallback={<BlockSkeleton height={130}/>}><Plan user={user} now={now}/></Suspense>
    <Suspense fallback={<BlockSkeleton height={60}/>}><Rank user={user}/></Suspense>
    <Suspense fallback={<BlockSkeleton height={110}/>}><Today user={user} now={now}/></Suspense>
    <Suspense fallback={<BlockSkeleton height={220}/>}><Customers user={user} now={now}/></Suspense>
    <Suspense fallback={<BlockSkeleton height={380}/>}><Dynamics user={user} now={now}/></Suspense>
    <Suspense fallback={null}><AgentBlocks user={user} now={now}/></Suspense>
    <Suspense fallback={<BlockSkeleton height={160}/>}><Orders user={user}/></Suspense>
    <Suspense fallback={<BlockSkeleton height={300}/>}><Leaders user={user} now={now}/></Suspense>
  </div>;
}
