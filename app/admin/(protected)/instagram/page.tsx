import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { DirectBoard } from "@/components/admin/instagram/direct-board";
import { InstagramBoard } from "@/components/admin/instagram/instagram-board";
import { StatsBoard, StatsSkeleton } from "@/components/admin/instagram/stats-board";
import "@/components/admin/instagram/instagram.css";
import { requireRole } from "@/lib/auth/require-admin";
import { DIRECT_FILTERS, getDirectBoard } from "@/lib/instagram/direct-queries";
import { PERIODS, type Period } from "@/lib/instagram/insights-rules";
import { getInstagramBoard } from "@/lib/instagram/queries";
import { getStatsBoard } from "@/lib/instagram/stats-queries";

export const metadata: Metadata = { title: "Instagram — Admin | BUYUK KARAVAN" };
// "Hozir yangilash" (statistics) runs as a server action of this page and may take up to a few minutes.
export const maxDuration = 300;

async function Stats({ period }: { period: Period }) {
  return <StatsBoard board={await getStatsBoard(period)}/>;
}

/** Instagram: "Kommentlar" (auto-replies), "Direct" (customer messages → Telegram) and "Statistika" (Insights) tabs. */
export default async function InstagramPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; period?: string }> }) {
  const user = await requireRole("SUPER_ADMIN", "ADMIN");
  const search = await searchParams;
  const tab = search.tab === "direct" || search.tab === "stats" ? search.tab : "comments";
  const status = DIRECT_FILTERS.find(item => item === search.status) ?? null;
  const period: Period = search.period && search.period in PERIODS ? search.period as Period : "30";
  const tabs = <nav className="bk-chips" aria-label="Instagram bo‘limlari" style={{ marginBottom: 16 }}>
    <Link className={`bk-chip${tab === "comments" ? " is-active" : ""}`} href="/admin/instagram">Kommentlar</Link>
    <Link className={`bk-chip${tab === "direct" ? " is-active" : ""}`} href="/admin/instagram?tab=direct">Direct</Link>
    <Link className={`bk-chip${tab === "stats" ? " is-active" : ""}`} href="/admin/instagram?tab=stats">Statistika</Link>
  </nav>;
  const subtitle = { comments: "Komment → avto-javoblar, jurnal va statistika", direct: "Direct xabarlari → adminning Telegram’i", stats: "Qamrov, auditoriya, voronka va postlar" }[tab];
  return <div className="bk">
    <div className="bk-head"><div><h1>Instagram</h1><p className="bk-muted">{subtitle}</p></div></div>
    {tabs}
    {tab === "direct" ? <DirectBoard board={await getDirectBoard(status)} status={status}/>
      : tab === "stats" ? <Suspense key={period} fallback={<StatsSkeleton/>}><Stats period={period}/></Suspense>
      : <InstagramBoard board={await getInstagramBoard()} canConnect={user.role === "SUPER_ADMIN"}/>}
  </div>;
}
