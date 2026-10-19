import type { Metadata } from "next";
import { OrdersBoard } from "@/components/admin/sex/orders-board";
import { WorkshopBoard } from "@/components/admin/sex/workshop-board";
import { requireSexUser } from "@/lib/auth/require-admin";
import { getIssueGroups } from "@/lib/prays/queries";
import { customerOptions, getSellerQueue, listOrders, sellerOptions, workshopDay } from "@/lib/sex/queries";
import { SehQueue } from "@/components/admin/sex/seh-queue";
import { monthRange } from "@/lib/sex/rules";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Seh zakazlari — Admin | BUYUK KARAVAN" };

/** One page, three views: SUPER_ADMIN/staff — all orders of a month; SELLER — their own; WORKSHOP — receipt cards of open tasks. */
export default async function SexOrdersPage({ searchParams }: { searchParams: Promise<{ month?: string; status?: string; fix?: string }> }) {
  const user = await requireSexUser();
  const { month, status, fix } = await searchParams;
  const view = status === "cancelled" ? "cancelled" : status === "test" ? "test" : "active";
  const workshop = user.role === "WORKSHOP";
  const [{ range, rows, summary }, parts, sellers, customers, day, queue, correction] = await Promise.all([
    listOrders(user, month, view),
    workshop ? getIssueGroups() : Promise.resolve([]),
    workshop ? sellerOptions() : Promise.resolve([]),
    workshop ? customerOptions(user) : Promise.resolve([]),
    workshop ? workshopDay() : Promise.resolve(null),
    user.role === "SELLER" ? getSellerQueue(user.id) : Promise.resolve(null),
    // "Ko‘rib tahrirlash" from Tasdiqlash kerak opens that order's edit form.
    fix && user.role === "SUPER_ADMIN" ? getDb().workshopCorrectionRequest.findFirst({ where: { id: fix, status: "PENDING" }, select: { orderId: true } }) : Promise.resolve(null),
  ]);
  // "Zayavkasiz chiqim": goods of the "Sehdan alohida chiqadi" categories (Prays → Kategoriyalar).
  const partOptions = parts.flatMap(group => group.items.map(item => ({ id: item.id, label: item.label, group: group.name })));
  if (workshop && day) return <WorkshopBoard telegramLinked={!!user.telegramChatId} userName={user.name} rows={rows} started={day.started} limit={day.limit} issuedToday={day.issuedToday} parts={partOptions} sellers={sellers} customers={customers}/>;
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, index) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 15)); return monthRange(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`); }).map(({ key, label }) => ({ key, label }));
  if (!months.some(item => item.key === range.key)) months.push({ key: range.key, label: range.label });
  return <OrdersBoard view={view} role={user.role} userName={user.name} rows={rows} month={{ key: range.key, label: range.label }} months={months}
    parts={partOptions} sellers={sellers} customers={customers} top={queue && <SehQueue {...queue}/>} summary={summary} fix={correction && fix ? { orderId: correction.orderId, requestId: fix } : null}/>;
}
