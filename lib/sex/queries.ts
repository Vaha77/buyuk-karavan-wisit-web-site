import "server-only";
import type { AdminUser, Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { DEFAULT_WORKSHOP_DAILY_LIMIT, isReceiveOverdue, isStaff, monthRange, orderNumber, orderScope, processSteps, queuePositions, RECEIVE_OVERDUE_MS, stripPrices, tashkentDayStart, when, shortDay, type OrderStatus, type PriceSnapshot, type StepView } from "./rules";

type Viewer = Pick<AdminUser, "id" | "role" | "salesPersonId">;
export type OrderRow = {
  id: string; number: string; day: string; type: "AGREGAT" | "ZAPCHAST"; product: string; qty: number;
  sellerName: string; sellerAt: string; purpose: "SHOP" | "CLIENT"; customerName: string | null; status: OrderStatus; steps: StepView[];
  overdue: boolean; acceptedAt: string | null; startedAt: string | null; queue: number | null; noRequest: boolean; sellerConfirmed: boolean; isNew: boolean; dueDate: string | null; note: string | null;
  items: Array<{ id: string; title: string; qty: number; issuedQty?: number | null }>;
  prices?: Partial<PriceSnapshot>;
};

const include = {
  seller: { select: { name: true } }, acceptedBy: { select: { name: true } }, startedBy: { select: { name: true } }, issuedBy: { select: { name: true } }, receivedBy: { select: { name: true } },
  items: { orderBy: { order: "asc" as const }, select: { id: true, title: true, qty: true, issuedQty: true, baseUsd: true } },
} satisfies Prisma.WorkshopOrderInclude;
type Loaded = Prisma.WorkshopOrderGetPayload<{ include: typeof include }>;

function toRow(order: Loaded, role: string, now: Date, queue: Map<string, number>): OrderRow {
  const product = order.type === "AGREGAT" ? `${order.items[0]?.title ?? "—"}${order.qty > 1 ? ` ×${order.qty}` : ""}` : order.items.map(item => `${item.title} ×${item.issuedQty ?? item.qty}`).join(", ");
  const base = {
    id: order.id, number: orderNumber(order.number), day: shortDay(order.createdAt), type: order.type, product, qty: order.qty,
    sellerName: order.seller.name, sellerAt: when(order.createdAt, now), purpose: order.purpose, customerName: order.customerName, status: order.status,
    steps: processSteps(order, now), overdue: isReceiveOverdue(order, now), acceptedAt: order.acceptedAt?.toISOString() ?? null, startedAt: order.startedAt?.toISOString() ?? null, queue: queue.get(order.id) ?? null, noRequest: order.noRequest, sellerConfirmed: !!order.sellerConfirmedAt,
    isNew: now.getTime() - order.createdAt.getTime() < 10 * 60_000, dueDate: order.dueDate?.toISOString().slice(0, 10) ?? null, note: order.note,
    priceSnapshot: order.priceSnapshot, items: order.items.map(item => ({ id: item.id, title: item.title, qty: item.qty, issuedQty: item.issuedQty, baseUsd: item.baseUsd === null ? null : Number(item.baseUsd) })),
  };
  return stripPrices(base, role) as unknown as OrderRow;
}

/** Orders a viewer may see: staff the month (plus anything still open), a seller their own, the workshop its open tasks. */
export async function listOrders(viewer: Viewer, month?: string) {
  const now = new Date(), range = monthRange(month, now);
  const where: Prisma.WorkshopOrderWhereInput = { ...orderScope(viewer) };
  if (isStaff(viewer.role)) where.OR = [{ createdAt: { gte: range.from, lt: range.to } }, { status: { in: ["NEW", "ACCEPTED", "STARTED", "ISSUED"] } }];
  // Queue numbers are global (a seller sees "2-navbat" even though they only list their own orders).
  const [orders, waiting] = await Promise.all([
    getDb().workshopOrder.findMany({ where, include, orderBy: { createdAt: "desc" }, take: viewer.role === "SELLER" ? 200 : 500 }),
    getDb().workshopOrder.findMany({ where: { status: "ACCEPTED" }, select: { id: true, status: true, acceptedAt: true } }),
  ]);
  const queue = queuePositions(waiting);
  return { range, rows: orders.map(order => toRow(order, viewer.role, now, queue)) };
}

/** Orders of one month for the Excel export (SUPER_ADMIN only — it carries prices). */
export async function monthOrders(month?: string) {
  const range = monthRange(month);
  const orders = await getDb().workshopOrder.findMany({ where: { createdAt: { gte: range.from, lt: range.to } }, include, orderBy: { number: "asc" } });
  return { range, orders };
}

/** Workshop panel header and footer: orders started today (Tashkent day, without "Zayavkasiz chiqim"), the daily limit, and today's issued numbers. */
export async function workshopDay(now = new Date()) {
  const from = tashkentDayStart(now), db = getDb();
  const [started, issued, settings] = await Promise.all([
    db.workshopOrder.count({ where: { startedAt: { gte: from }, noRequest: false } }),
    db.workshopOrder.findMany({ where: { issuedAt: { gte: from } }, select: { number: true }, orderBy: { issuedAt: "asc" }, take: 60 }),
    db.siteSettings.findUnique({ where: { id: "global" }, select: { workshopDailyLimit: true } }).catch(() => null),
  ]);
  return { started, limit: settings?.workshopDailyLimit ?? DEFAULT_WORKSHOP_DAILY_LIMIT, issuedToday: issued.map(order => orderNumber(order.number)) };
}

/** Sidebar badge: SUPER_ADMIN — "Chiqib ketdi" waiting for krim over 24 h; WORKSHOP — new orders to accept. */
export async function sexBadgeCount(viewer: Viewer) {
  if (viewer.role === "SUPER_ADMIN") return getDb().workshopOrder.count({ where: { status: "ISSUED", issuedAt: { lt: new Date(Date.now() - RECEIVE_OVERDUE_MS) } } }).catch(() => 0);
  if (viewer.role === "WORKSHOP") return getDb().workshopOrder.count({ where: { status: "NEW" } }).catch(() => 0);
  return 0;
}

/** Customers offered in the "Mijoz" field: a seller's own regular customers, all active ones for staff. */
export async function customerOptions(viewer: Viewer) {
  if (viewer.role === "SELLER" && !viewer.salesPersonId) return [];
  const rows = await getDb().regularCustomer.findMany({ where: { isActive: true, ...(viewer.role === "SELLER" ? { ownerId: viewer.salesPersonId } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 1000 });
  return rows.map(row => ({ id: row.id, name: row.name }));
}

export async function sellerOptions() {
  return getDb().adminUser.findMany({ where: { role: "SELLER", isActive: true, approvalStatus: "APPROVED" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
