import type { Metadata } from "next";
import { InstagramBoard } from "@/components/admin/instagram/instagram-board";
import "@/components/admin/instagram/instagram.css";
import { requireRole } from "@/lib/auth/require-admin";
import { getInstagramBoard } from "@/lib/instagram/queries";

export const metadata: Metadata = { title: "Instagram — Admin | BUYUK KARAVAN" };

export default async function InstagramPage() {
  const user = await requireRole("SUPER_ADMIN", "ADMIN");
  const board = await getInstagramBoard();
  return <div className="bk">
    <div className="bk-head"><div><h1>Instagram</h1><p className="bk-muted">Komment → Direct’ga avtomatik narx, jurnal va statistika</p></div></div>
    <InstagramBoard board={board} canConnect={user.role === "SUPER_ADMIN"}/>
  </div>;
}
