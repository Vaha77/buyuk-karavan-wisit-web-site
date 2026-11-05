import "server-only";
import { getDb } from "@/lib/db";
import type { CommissionRow } from "./rules";

/** Live rows, newest first (a personal list: small enough to sum in memory). */
export async function getCommissions(): Promise<CommissionRow[]> {
  const rows = await getDb().myCommission.findMany({ where: { deletedAt: null }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] });
  return rows.map(row => ({ id: row.id, fromName: row.fromName, amount: Number(row.amountUsd), base: row.baseAmountUsd == null ? null : Number(row.baseAmountUsd), percent: row.percent == null ? null : Number(row.percent), note: row.note, occurredAt: row.occurredAt }));
}
