import "server-only";
import { getDb } from "@/lib/db";
import { debtOf, type DebtType } from "./rules";

/** Every hodim with the current debt, by name; the UI hides `archived`. */
export async function getEmployees() {
  const [rows, groups] = await Promise.all([
    getDb().employee.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, position: true, phone: true, archived: true } }),
    getDb().employeeDebtEntry.groupBy({ by: ["employeeId", "type"], where: { deletedAt: null }, _sum: { amountUsd: true } }),
  ]);
  return rows.map(row => ({ ...row, debt: debtOf(groups.filter(group => group.employeeId === row.id).map(group => ({ type: group.type as DebtType, amount: Number(group._sum.amountUsd ?? 0) }))) }));
}

/** Live debt rows (of one hodim, or everybody for Excel), oldest first. */
export async function getDebtEntries(employeeId?: string) {
  const rows = await getDb().employeeDebtEntry.findMany({ where: { deletedAt: null, employeeId }, orderBy: { occurredAt: "asc" } });
  return rows.map(({ amountUsd, ...row }) => ({ ...row, amount: Number(amountUsd), type: row.type as DebtType }));
}
