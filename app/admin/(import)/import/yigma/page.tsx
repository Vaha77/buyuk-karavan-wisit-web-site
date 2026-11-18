import type { Metadata } from "next";
import { SummaryBoard } from "@/components/admin/import/summary-board";
import "@/components/admin/import/import-admin.css";
import { requireRole } from "@/lib/auth/require-admin";
import { summarize } from "@/lib/import/rules";
import { ordersWithStatus } from "@/lib/import/service";

export const metadata: Metadata = { title: "Import — zavod bo‘yicha yig‘ma | BUYUK KARAVAN" };

/** Boss: APPROVED import orders grouped by agent → catalog. */
export default async function Page() {
  await requireRole("SUPER_ADMIN");
  const orders = await ordersWithStatus("APPROVED");
  return <div className="bk"><SummaryBoard groups={summarize(orders)} orderIds={orders.map(order => order.id)} seenAt={Math.max(0, ...orders.map(order => order.decidedAt?.getTime() ?? 0))}/></div>;
}
