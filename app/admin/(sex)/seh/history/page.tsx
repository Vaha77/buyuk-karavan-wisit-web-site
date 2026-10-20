import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StoreHistory } from "@/components/admin/sex/store-board";
import { requireSexUser } from "@/lib/auth/require-admin";
import { listOrders } from "@/lib/sex/queries";

export const metadata: Metadata = { title: "Tarix — Ombor | BUYUK KARAVAN" };

export default async function StoreHistoryPage() {
  const user = await requireSexUser();
  if (user.role !== "STOREKEEPER") redirect("/admin/seh");
  return <StoreHistory rows={(await listOrders(user)).rows}/>;
}
