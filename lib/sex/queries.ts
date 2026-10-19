import "server-only";
import { orderTitle } from "./bot-text";
import { frameChange } from "./zborka";
import type { AdminUser, Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { closeMonths } from "./month";
import { canCancel, canMarkTest, isClosedMonth, monthKeyOf, DEFAULT_WORKSHOP_DAILY_LIMIT, isReceiveOverdue, isStaff, monthRange, orderKind, orderNumber, orderScope, processSteps, queuePositions, RECEIVE_OVERDUE_MS, sellerQueue, stripPrices, tashkentDayStart, when, shortDay, type OrderStatus, type PriceSnapshot, type StepView } from "./rules";

type Viewer = Pick<AdminUser, "id" | "role" | "salesPersonId">;
export type OrderRow = {
  // `type` = which form created it (drives the issue dialog); `kind` = the Agregat / Zapchast label from the goods' category.
  /** number: "MM-NN"; closed: its month is closed (only SUPER_ADMIN changes it); carriedFrom: old "MM-NN" when moved from the previous month. */
  id: string; number: string; monthKey: string; closed: boolean; carriedFrom: string | null; day: string; type: "AGREGAT" | "ZAPCHAST"; kind: "AGREGAT" | "ZAPCHAST"; isTest: boolean; canMarkTest: boolean; product: string; qty: number;
  sellerName: string; sellerAt: string; purpose: "SHOP" | "CLIENT"; customerName: string | null; status: OrderStatus; steps: StepView[];
  overdue: boolean; acceptedAt: string | null; startedAt: string | null; queue: number | null; telegramFailed: boolean; canCancel: boolean; cancelled: { at: string; by: string | null; reason: string | null } | null; noRequest: boolean; sellerConfirmed: boolean; isNew: boolean; dueDate: string | null; note: string | null;
  items: Array<{ id: string; title: string; qty: number; issuedQty?: number | null }>;
  prices?: Partial<PriceSnapshot>;
  /** "FN → FNV": condenser series changed, frame price not included (SUPER_ADMIN / ADMIN only). */
  frame: string | null;
};

const include = {
  seller: { select: { name: true } }, acceptedBy: { select: { name: true } }, startedBy: { select: { name: true } }, cancelledBy: { select: { name: true } }, issuedBy: { select: { name: true } }, receivedBy: { select: { name: true } },
  items: { orderBy: { order: "asc" as const }, select: { id: true, title: true, qty: true, issuedQty: true, baseUsd: true, partId: true, options: true, product: { select: { category: { select: { slug: true, name: true } } } } } },
} satisfies Prisma.WorkshopOrderInclude;
type Loaded = Prisma.WorkshopOrderGetPayload<{ include: typeof include }>;

/** Agregat / Zapchast from the ordered goods' product category (see orderKind). */
export const kindOf = (order: Pick<Loaded, "type" | "items">) => orderKind({ type: order.type, items: order.items.map(item => ({ partId: item.partId, category: item.product?.category })) });

function toRow(order: Loaded, viewer: Viewer, now: Date, queue: Map<string, number>): OrderRow {
  const role = viewer.role;
  const product = order.type === "AGREGAT" ? `${order.items[0]?.title ?? "—"}${order.qty > 1 ? ` ×${order.qty}` : ""}` : order.items.map(item => `${item.title} ×${item.issuedQty ?? item.qty}`).join(", ");
  const base = {
    id: order.id, number: orderNumber(order), monthKey: order.monthKey, closed: isClosedMonth(order.monthKey, now), carriedFrom: order.carriedFrom, day: shortDay(order.createdAt), type: order.type, kind: kindOf(order), isTest: order.isTest, canMarkTest: canMarkTest(role), product, qty: order.qty,
    sellerName: order.seller.name, sellerAt: when(order.createdAt, now), purpose: order.purpose, customerName: order.customerName, status: order.status,
    steps: processSteps(order, now), overdue: isReceiveOverdue(order, now), acceptedAt: order.acceptedAt?.toISOString() ?? null, startedAt: order.startedAt?.toISOString() ?? null, queue: queue.get(order.id) ?? null, telegramFailed: !!order.telegramFailedAt, canCancel: canCancel(role, order.status, order.sellerId === viewer.id), cancelled: order.cancelledAt ? { at: when(order.cancelledAt, now), by: order.cancelledBy?.name ?? null, reason: order.cancelReason } : null, noRequest: order.noRequest, sellerConfirmed: !!order.sellerConfirmedAt,
    frame: (role === "SUPER_ADMIN" || role === "ADMIN") && order.type === "AGREGAT" ? frameChange(order.items[0]?.options) : null,
    isNew: now.getTime() - order.createdAt.getTime() < 10 * 60_000, dueDate: order.dueDate?.toISOString().slice(0, 10) ?? null, note: order.note,
    priceSnapshot: order.priceSnapshot, items: order.items.map(item => ({ id: item.id, title: item.title, qty: item.qty, issuedQty: item.issuedQty, baseUsd: item.baseUsd === null ? null : Number(item.baseUsd) })),
  };
  return stripPrices(base, role) as unknown as OrderRow;
}

/** Orders a viewer may see: staff the month (plus anything still open), a seller their own, the workshop its open tasks. */
/**
 * `cancelled` = the "Bekor qilingan" filter, `test` = the "Test" filter (staff); otherwise cancelled orders are left out (they are never deleted).
 * Staff see test orders only under "Test"; a seller and the workshop keep seeing them in place, marked "Test", so a test run goes end to end.
 */
export type OrdersView = "active" | "cancelled" | "test";
export async function listOrders(viewer: Viewer, month?: string, view: OrdersView = "active") {
  await closeMonths();
  const now = new Date(), range = monthRange(month, now), current = range.key === monthKeyOf(now);
  const where: Prisma.WorkshopOrderWhereInput = { ...orderScope(viewer) };
  const staff = isStaff(viewer.role), test = staff && view === "test", cancelled = view === "cancelled";
  if (viewer.role !== "WORKSHOP" && !test) where.AND = [{ status: cancelled ? "CANCELLED" : { not: "CANCELLED" } }];
  if (staff) {
    where.isTest = test;
    // The month's own orders (carried-in ones too) and those created in it that moved on ("→ noyabrga o‘tdi"); open ones only in the current month.
    where.OR = cancelled ? [{ monthKey: range.key }] : [{ monthKey: range.key }, { createdAt: { gte: range.from, lt: range.to } }, ...(current ? [{ status: { in: ["NEW", "ACCEPTED", "STARTED", "ISSUED"] as OrderStatus[] } }] : [])];
  }
  // Queue numbers are global (a seller sees "2-navbat" even though they only list their own orders).
  const [orders, waiting] = await Promise.all([
    getDb().workshopOrder.findMany({ where, include, orderBy: [{ monthKey: "desc" }, { monthNo: "desc" }], take: viewer.role === "SELLER" ? 200 : 500 }),
    getDb().workshopOrder.findMany({ where: { status: "ACCEPTED", isTest: false }, select: { id: true, status: true, acceptedAt: true } }),
  ]);
  const queue = queuePositions(waiting);
  // Closed month header: left the workshop / moved to the next month / cancelled — each order counted once, in its own month.
  const summary = staff && !current ? await closedSummary(range) : null;
  return { range, summary, rows: orders.map(order => toRow(order, viewer, now, queue)) };
}

async function closedSummary(range: { key: string; from: Date; to: Date }) {
  const db = getDb(), real = { isTest: false };
  const [issued, carried, cancelled] = await Promise.all([
    db.workshopOrder.count({ where: { ...real, monthKey: range.key, status: { in: ["ISSUED", "RECEIVED"] } } }),
    db.workshopOrder.count({ where: { ...real, monthKey: { gt: range.key }, createdAt: { gte: range.from, lt: range.to } } }),
    db.workshopOrder.count({ where: { ...real, monthKey: range.key, status: "CANCELLED" } }),
  ]);
  return { issued, carried, cancelled };
}

/** Orders of one month (by monthKey: a carried order counts once, in the month it ended up in) for the Excel export (SUPER_ADMIN only — it carries prices). Test orders are left out. */
export async function monthOrders(month?: string) {
  const range = monthRange(month);
  const orders = await getDb().workshopOrder.findMany({ where: { monthKey: range.key, isTest: false }, include, orderBy: { monthNo: "asc" } });
  return { range, orders };
}

/** Workshop panel header and footer: orders started today (Tashkent day, without "Zayavkasiz chiqim"), the daily limit, and today's issued numbers. */
export async function workshopDay(now = new Date()) {
  const from = tashkentDayStart(now), db = getDb();
  const [started, issued, settings] = await Promise.all([
    db.workshopOrder.count({ where: { startedAt: { gte: from }, noRequest: false } }),
    db.workshopOrder.findMany({ where: { issuedAt: { gte: from } }, select: { monthKey: true, monthNo: true }, orderBy: { issuedAt: "asc" }, take: 60 }),
    db.siteSettings.findUnique({ where: { id: "global" }, select: { workshopDailyLimit: true } }).catch(() => null),
  ]);
  return { started, limit: settings?.workshopDailyLimit ?? DEFAULT_WORKSHOP_DAILY_LIMIT, issuedToday: issued.map(orderNumber) };
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

/** "Seh navbati" for a seller page: every open order of the workshop, reduced by sellerQueue (no customer, no price). */
export async function getSellerQueue(sellerId: string) {
  const db = getDb();
  const [orders, workshop] = await Promise.all([
    db.workshopOrder.findMany({ where: { status: { in: ["ACCEPTED", "STARTED"] }, isTest: false }, select: { id: true, status: true, acceptedAt: true, startedAt: true, sellerId: true, type: true, qty: true, seller: { select: { name: true } }, items: { orderBy: { order: "asc" }, select: { title: true, qty: true, issuedQty: true } } } }),
    db.adminUser.findFirst({ where: { role: "WORKSHOP", isActive: true, archivedAt: null }, orderBy: { createdAt: "asc" }, select: { name: true } }),
  ]);
  return { workshopName: workshop?.name ?? "Seh", ...sellerQueue(orders.map(order => ({ ...order, sellerName: order.seller.name, title: orderTitle(order) })), sellerId) };
}
