import type { Metadata } from "next";
import Link from "next/link";
import { DirectBoard } from "@/components/admin/instagram/direct-board";
import { InstagramBoard } from "@/components/admin/instagram/instagram-board";
import "@/components/admin/instagram/instagram.css";
import { requireRole } from "@/lib/auth/require-admin";
import { DIRECT_FILTERS, getDirectBoard } from "@/lib/instagram/direct-queries";
import { getInstagramBoard } from "@/lib/instagram/queries";

export const metadata: Metadata = { title: "Instagram — Admin | BUYUK KARAVAN" };

/** Instagram: "Kommentlar" (auto-replies) and "Direct" (customer messages → Telegram) tabs. */
export default async function InstagramPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const user = await requireRole("SUPER_ADMIN", "ADMIN");
  const search = await searchParams;
  const direct = search.tab === "direct";
  const status = DIRECT_FILTERS.find(item => item === search.status) ?? null;
  const tabs = <nav className="bk-chips" aria-label="Instagram bo‘limlari" style={{ marginBottom: 16 }}>
    <Link className={`bk-chip${direct ? "" : " is-active"}`} href="/admin/instagram">Kommentlar</Link>
    <Link className={`bk-chip${direct ? " is-active" : ""}`} href="/admin/instagram?tab=direct">Direct</Link>
  </nav>;
  return <div className="bk">
    <div className="bk-head"><div><h1>Instagram</h1><p className="bk-muted">{direct ? "Direct xabarlari → adminning Telegram’i" : "Komment → avto-javoblar, jurnal va statistika"}</p></div></div>
    {tabs}
    {direct ? <DirectBoard board={await getDirectBoard(status)} status={status}/> : <InstagramBoard board={await getInstagramBoard()} canConnect={user.role === "SUPER_ADMIN"}/>}
  </div>;
}
