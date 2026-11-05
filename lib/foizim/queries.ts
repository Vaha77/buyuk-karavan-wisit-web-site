import "server-only";
import { getDb } from "@/lib/db";
import type { ShortageRow } from "./month";
import type { CommissionRow, Kind } from "./rules";

/** Live rows, newest first (a personal list: small enough to sum in memory). */
export async function getCommissions(): Promise<CommissionRow[]> {
  const rows = await getDb().myCommission.findMany({ where: { deletedAt: null }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] });
  return rows.map(row => ({ id: row.id, direction: row.direction, kind: row.kind as Kind, sellerId: row.sellerId, storekeeperId: row.storekeeperId, salaryMonth: row.salaryMonth, category: row.category, fromName: row.fromName, amount: Number(row.amountUsd), base: row.baseAmountUsd == null ? null : Number(row.baseAmountUsd), percent: row.percent == null ? null : Number(row.percent), note: row.note, occurredAt: row.occurredAt }));
}

/** Live kamomat rows, oldest first. */
export async function getShortages(): Promise<Array<ShortageRow & { id: string; note: string }>> {
  const rows = await getDb().shopShortage.findMany({ where: { deletedAt: null }, orderBy: { occurredAt: "asc" } });
  return rows.map(row => ({ id: row.id, type: row.type, amount: Number(row.amountUsd), note: row.note, occurredAt: row.occurredAt }));
}

/** Pickers: active, approved users of one role, by name. */
export const getPeople = (role: "SELLER" | "STOREKEEPER") => getDb().adminUser.findMany({ where: { role, isActive: true, archivedAt: null, approvalStatus: "APPROVED" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
