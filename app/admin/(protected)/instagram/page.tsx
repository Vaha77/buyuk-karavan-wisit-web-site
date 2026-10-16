import type { Metadata } from "next";
import { Suspense } from "react";
import { InstagramNav, pickAccount } from "@/components/admin/instagram/account-nav";
import { DirectBoard } from "@/components/admin/instagram/direct-board";
import { InstagramBoard } from "@/components/admin/instagram/instagram-board";
import { StatsBoard, StatsSkeleton } from "@/components/admin/instagram/stats-board";
import "@/components/admin/instagram/instagram.css";
import { requireRole } from "@/lib/auth/require-admin";
import { DIRECT_FILTERS, getDirectBoard } from "@/lib/instagram/direct-queries";
import { PERIODS, type Period } from "@/lib/instagram/insights-rules";
import { getAccountOptions, getInstagramBoard } from "@/lib/instagram/queries";
import { getStatsBoard } from "@/lib/instagram/stats-queries";

export const metadata: Metadata = { title: "Instagram — Admin | BUYUK KARAVAN" };
// "Hozir yangilash" (statistics) runs as a server action of this page and may take up to a few minutes.
export const maxDuration = 300;

async function Stats({ period, accountId }: { period: Period; accountId: string }) {
  return <StatsBoard board={await getStatsBoard(period, accountId)} accountId={accountId}/>;
}

/** Instagram: "Kommentlar" (auto-replies), "Direct" (customer messages → Telegram) and "Statistika" (Insights) tabs, per account. */
export default async function InstagramPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; period?: string; account?: string }> }) {
  const user = await requireRole("SUPER_ADMIN", "ADMIN");
  const search = await searchParams;
  const tab = search.tab === "direct" || search.tab === "stats" ? search.tab : "comments";
  const status = DIRECT_FILTERS.find(item => item === search.status) ?? null;
  const period: Period = search.period && search.period in PERIODS ? search.period as Period : "30";
  const accounts = await getAccountOptions();
  const accountId = pickAccount(accounts, search.account)?.id ?? "";
  const subtitle = { comments: "Komment → avto-javoblar, jurnal va statistika", direct: "Direct xabarlari → adminning Telegram’i", stats: "Qamrov, auditoriya, voronka va postlar" }[tab];
  return <div className="bk">
    <div className="bk-head"><div><h1>Instagram</h1><p className="bk-muted">{subtitle}</p></div></div>
    <InstagramNav accounts={accounts} accountId={accountId || null} active={tab} isSuper={user.role === "SUPER_ADMIN"}/>
    {tab === "direct" ? <DirectBoard board={await getDirectBoard(status, accountId)} status={status}/>
      : tab === "stats" ? <Suspense key={`${accountId}:${period}`} fallback={<StatsSkeleton/>}><Stats period={period} accountId={accountId}/></Suspense>
      : <InstagramBoard board={await getInstagramBoard(accountId)} canConnect={user.role === "SUPER_ADMIN"}/>}
  </div>;
}
