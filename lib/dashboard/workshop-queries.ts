import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { dayKey } from "./period";
import { AGREGAT_CATEGORY_PATTERN } from "@/lib/sex/rules";
import { attentionReasons, fillWeeks, OPEN_STATUSES, UNACCEPTED_ALERT_MS, weekWindowStart } from "./workshop-rules";

// Every block leaves out cancelled and test orders. Sums use the price-list total frozen on the order (priceSnapshot.totalBaseUsd).
const REAL = Prisma.sql`o.status <> 'CANCELLED' AND NOT o."isTest"`;
// Agregat / Zapchast from the goods' product category, the same rule as orderKind() in lib/sex/rules.ts.
const KIND_JOIN = Prisma.sql`LEFT JOIN LATERAL (
  SELECT bool_or(concat_ws(' ', c.slug, c.name) ~* ${AGREGAT_CATEGORY_PATTERN}) AS agregat, bool_or(i."partId" IS NOT NULL OR c.id IS NOT NULL) AS known
  FROM "WorkshopOrderItem" i LEFT JOIN "Product" p ON p.id = i."productId" LEFT JOIN "ProductCategory" c ON c.id = p."categoryId"
  WHERE i."orderId" = o.id) k ON true`;
const IS_AGREGAT = Prisma.sql`(CASE WHEN k.agregat THEN true WHEN k.known THEN false ELSE o.type = 'AGREGAT' END)`;
const TOTAL_USD = Prisma.sql`CASE WHEN jsonb_typeof(o."priceSnapshot"->'totalBaseUsd') = 'number' THEN (o."priceSnapshot"->>'totalBaseUsd')::numeric ELSE 0 END`;
const OUT = Prisma.sql`o.status IN ('ISSUED', 'RECEIVED')`;
// "Zayavkasiz chiqim" is accepted and issued in the same moment, so it would pull the preparation average to zero.
const PREP_SECONDS = Prisma.sql`CASE WHEN NOT o."noRequest" AND o."acceptedAt" IS NOT NULL AND o."issuedAt" IS NOT NULL THEN extract(epoch FROM o."issuedAt" - o."acceptedAt") END`;
const n = (value: bigint | number | string | null) => (value === null ? 0 : Number(value));

type KpiRow = { agregat: bigint; zapchast: bigint; prev: bigint; new_now: bigint; accepted_now: bigint; started_now: bigint; issued: bigint; issued_usd: number | null; prep_sec: number | null; overdue: bigint };
async function loadKpis(from: Date, to: Date, prevFrom: Date, today: string) {
  const [row] = await getDb().$queryRaw<KpiRow[]>(Prisma.sql`
    SELECT
      count(*) FILTER (WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to} AND ${IS_AGREGAT}) AS agregat,
      count(*) FILTER (WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to} AND NOT ${IS_AGREGAT}) AS zapchast,
      count(*) FILTER (WHERE o."createdAt" >= ${prevFrom} AND o."createdAt" < ${from}) AS prev,
      count(*) FILTER (WHERE o.status = 'NEW') AS new_now,
      count(*) FILTER (WHERE o.status = 'ACCEPTED') AS accepted_now,
      count(*) FILTER (WHERE o.status = 'STARTED') AS started_now,
      count(*) FILTER (WHERE ${OUT} AND o."issuedAt" >= ${from} AND o."issuedAt" < ${to}) AS issued,
      (sum(${TOTAL_USD}) FILTER (WHERE ${OUT} AND o."issuedAt" >= ${from} AND o."issuedAt" < ${to}))::float8 AS issued_usd,
      (avg(${PREP_SECONDS}) FILTER (WHERE ${OUT} AND o."issuedAt" >= ${from} AND o."issuedAt" < ${to}))::float8 AS prep_sec,
      count(*) FILTER (WHERE o.status IN ('NEW', 'ACCEPTED', 'STARTED') AND o."dueDate" < ${today}::date) AS overdue
    FROM "WorkshopOrder" o ${KIND_JOIN}
    WHERE ${REAL}
      AND (o."createdAt" >= ${prevFrom} OR o."issuedAt" >= ${from} OR o.status IN ('NEW', 'ACCEPTED', 'STARTED'))`);
  return {
    agregat: n(row.agregat), zapchast: n(row.zapchast), total: n(row.agregat) + n(row.zapchast), prev: n(row.prev),
    now: { new: n(row.new_now), accepted: n(row.accepted_now), started: n(row.started_now) },
    issued: n(row.issued), issuedUsd: row.issued_usd ?? 0, prepSeconds: row.prep_sec, overdue: n(row.overdue),
  };
}

/** Last 12 weeks (Monday-based, Tashkent): orders that came in and orders that left the workshop. */
async function loadWeekly(now: Date) {
  const start = weekWindowStart(now);
  const rows = await getDb().$queryRaw<Array<{ week: string; kind: string; count: bigint }>>(Prisma.sql`
    SELECT to_char(date_trunc('week', t.at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent'), 'YYYY-MM-DD') AS week, t.kind, count(*)::bigint AS count
    FROM (
      SELECT o."createdAt" AS at, 'in' AS kind FROM "WorkshopOrder" o WHERE ${REAL} AND o."createdAt" >= ${start}
      UNION ALL
      SELECT o."issuedAt", 'out' FROM "WorkshopOrder" o WHERE ${OUT} AND NOT o."isTest" AND o."issuedAt" >= ${start}
    ) t
    GROUP BY 1, 2`);
  return fillWeeks(start, rows.map(row => ({ week: row.week, kind: row.kind, count: Number(row.count) })));
}

/** Orders given in the period, per seller: count, price-list sum and average preparation time of those already issued. */
async function loadSellers(from: Date, to: Date) {
  const rows = await getDb().$queryRaw<Array<{ id: string; name: string; orders: bigint; usd: number | null; prep_sec: number | null }>>(Prisma.sql`
    SELECT o."sellerId" AS id, u.name, count(*)::bigint AS orders, sum(${TOTAL_USD})::float8 AS usd, avg(${PREP_SECONDS}) FILTER (WHERE ${OUT})::float8 AS prep_sec
    FROM "WorkshopOrder" o JOIN "AdminUser" u ON u.id = o."sellerId"
    WHERE ${REAL} AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
    GROUP BY o."sellerId", u.name
    ORDER BY usd DESC NULLS LAST, orders DESC`);
  return rows.map(row => ({ id: row.id, name: row.name, orders: Number(row.orders), usd: row.usd ?? 0, prepSeconds: row.prep_sec }));
}

/** Top 10 goods of the period's orders by quantity (issued quantity when the workshop corrected it). */
async function loadTopProducts(from: Date, to: Date) {
  const rows = await getDb().$queryRaw<Array<{ key: string; kind: string; title: string; qty: bigint; orders: bigint }>>(Prisma.sql`
    SELECT coalesce(i."productId", i."partId", i.title) AS key, i.kind::text AS kind,
      max(coalesce(p.name, concat_ws(' ', s.name, s.size), i.title)) AS title,
      sum(coalesce(i."issuedQty", i.qty))::bigint AS qty, count(DISTINCT i."orderId")::bigint AS orders
    FROM "WorkshopOrderItem" i
      JOIN "WorkshopOrder" o ON o.id = i."orderId"
      LEFT JOIN "Product" p ON p.id = i."productId"
      LEFT JOIN "SexPart" s ON s.id = i."partId"
    WHERE ${REAL} AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
    GROUP BY 1, 2
    ORDER BY qty DESC, orders DESC, title
    LIMIT 10`);
  return rows.map(row => ({ key: `${row.kind}:${row.key}`, kind: row.kind as "PRODUCT" | "PART", title: row.title, qty: Number(row.qty), orders: Number(row.orders) }));
}

/** Open orders past their due date, and "Yangi" ones nobody accepted for 24 hours (current state, not the period). */
async function loadAttention(now: Date, today: string) {
  const where: Prisma.WorkshopOrderWhereInput = {
    status: { in: [...OPEN_STATUSES] }, isTest: false,
    OR: [{ dueDate: { lt: new Date(`${today}T00:00:00Z`) } }, { status: "NEW", createdAt: { lt: new Date(now.getTime() - UNACCEPTED_ALERT_MS) } }],
  };
  const [orders, total] = await Promise.all([
    getDb().workshopOrder.findMany({
      where, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], take: 12,
      select: { id: true, number: true, type: true, qty: true, status: true, createdAt: true, dueDate: true, customerName: true, seller: { select: { name: true } }, items: { orderBy: { order: "asc" }, take: 3, select: { title: true, qty: true } } },
    }),
    getDb().workshopOrder.count({ where }),
  ]);
  return {
    total,
    rows: orders.map(order => {
      const dueDate = order.dueDate?.toISOString().slice(0, 10) ?? null;
      const product = order.type === "AGREGAT" ? `${order.items[0]?.title ?? "—"}${order.qty > 1 ? ` ×${order.qty}` : ""}` : order.items.map(item => `${item.title} ×${item.qty}`).join(", ");
      return { id: order.id, number: order.number, status: order.status, createdAt: order.createdAt, dueDate, product, seller: order.seller.name, customerName: order.customerName, reasons: attentionReasons({ status: order.status, createdAt: order.createdAt, dueDate }, now) };
    }),
  };
}

export async function getWorkshopDashboard(period: { from: Date; to: Date; prevFrom: Date }, now = new Date()) {
  const today = dayKey(now);
  const [kpis, weekly, sellers, products, attention] = await Promise.all([
    loadKpis(period.from, period.to, period.prevFrom, today), loadWeekly(now), loadSellers(period.from, period.to), loadTopProducts(period.from, period.to), loadAttention(now, today),
  ]);
  return { kpis, weekly, sellers, products, attention };
}
export type WorkshopDashboard = Awaited<ReturnType<typeof getWorkshopDashboard>>;
