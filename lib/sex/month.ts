import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { carryPlan, monthKeyOf, OPEN_STATUSES } from "./rules";

type Tx = Prisma.TransactionClient;
// One lock for numbering and the month close, so two requests never take the same "MM-NN".
const lock = (tx: Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(735102)`;
const lastNo = async (tx: Tx, monthKey: string) => (await tx.workshopOrder.aggregate({ where: { monthKey }, _max: { monthNo: true } }))._max.monthNo ?? 0;

async function carryOver(tx: Tx, monthKey: string) {
  const open = await tx.workshopOrder.findMany({ where: { monthKey: { lt: monthKey }, status: { in: [...OPEN_STATUSES] } }, select: { id: true, monthKey: true, monthNo: true } });
  if (!open.length) return 0;
  for (const move of carryPlan(open, monthKey, await lastNo(tx, monthKey))) await tx.workshopOrder.update({ where: { id: move.id }, data: { monthKey, monthNo: move.monthNo, carriedFrom: move.carriedFrom } });
  return open.length;
}

/** Month close (Tashkent 1st, 00:00): lazily on the first request of the new month and by the cron. A second run finds nothing to move. */
export async function closeMonths(now = new Date()) {
  const monthKey = monthKeyOf(now), db = getDb();
  if (!await db.workshopOrder.findFirst({ where: { monthKey: { lt: monthKey }, status: { in: [...OPEN_STATUSES] } }, select: { id: true } })) return 0;
  return db.$transaction(async tx => { await lock(tx); return carryOver(tx, monthKey); });
}

/** Creates an order with the next "MM-NN" of the current month (after the month close, so carried orders come first). */
export function createNumbered<T>(create: (tx: Tx, slot: { monthKey: string; monthNo: number }) => Promise<T>, now = new Date()) {
  const monthKey = monthKeyOf(now);
  return getDb().$transaction(async tx => {
    await lock(tx);
    await carryOver(tx, monthKey);
    return create(tx, { monthKey, monthNo: await lastNo(tx, monthKey) + 1 });
  });
}
