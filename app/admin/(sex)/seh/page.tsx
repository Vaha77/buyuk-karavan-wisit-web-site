import type { Metadata } from "next";
import { OrdersBoard } from "@/components/admin/sex/orders-board";
import { WorkshopBoard } from "@/components/admin/sex/workshop-board";
import { requireSexUser } from "@/lib/auth/require-admin";
import { getSexParts } from "@/lib/prays/queries";
import { customerOptions, listOrders, sellerOptions, workshopDay } from "@/lib/sex/queries";
import { monthRange } from "@/lib/sex/rules";

export const metadata: Metadata = { title: "Seh zakazlari — Admin | BUYUK KARAVAN" };

/** One page, three views: SUPER_ADMIN/staff — all orders of a month; SELLER — their own; WORKSHOP — receipt cards of open tasks. */
export default async function SexOrdersPage({ searchParams }: { searchParams: Promise<{ month?: string; status?: string }> }) {
  const user = await requireSexUser();
  const { month, status } = await searchParams;
  const cancelledView = status === "cancelled";
  const workshop = user.role === "WORKSHOP";
  const [{ range, rows }, parts, sellers, customers, day] = await Promise.all([
    listOrders(user, month, cancelledView),
    workshop ? getSexParts() : Promise.resolve([]),
    workshop ? sellerOptions() : Promise.resolve([]),
    workshop ? customerOptions(user) : Promise.resolve([]),
    workshop ? workshopDay() : Promise.resolve(null),
  ]);
  const partOptions = parts.map(part => ({ id: part.id, label: [part.name, part.size].filter(Boolean).join(" ") }));
  if (workshop && day) return <WorkshopBoard telegramLinked={!!user.telegramChatId} userName={user.name} rows={rows} started={day.started} limit={day.limit} issuedToday={day.issuedToday} parts={partOptions} sellers={sellers} customers={customers}/>;
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, index) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 15)); return monthRange(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`); }).map(({ key, label }) => ({ key, label }));
  if (!months.some(item => item.key === range.key)) months.push({ key: range.key, label: range.label });
  return <OrdersBoard cancelledView={cancelledView} role={user.role} userName={user.name} rows={rows} month={{ key: range.key, label: range.label }} months={months}
    parts={partOptions} sellers={sellers} customers={customers}/>;
}
