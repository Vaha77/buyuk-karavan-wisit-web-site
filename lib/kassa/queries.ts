import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { dayKey } from "@/lib/dashboard/period";
import { signed, type DebtType } from "@/lib/employees/rules";
import { carryFrom, ledger, type Currency, type EntryType, type NoteHint } from "./rules";

const live = { deletedAt: null };

/** Most used first ("ko‘p ishlatilganlar birinchi"), then the Super Admin's order. */
export async function getKassaCategories() {
  const rows = await getDb().kassaCategory.findMany({ include: { _count: { select: { entries: true } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return rows.sort((a, b) => b._count.entries - a._count.entries).map(({ _count, ...row }) => ({ ...row, uses: _count.entries }));
}

export async function getKassaSettings() {
  const row = await getDb().kassaSettings.findUnique({ where: { id: "global" } });
  return { opening: { USD: Number(row?.openingUsd ?? 0), UZS: Number(row?.openingUzs ?? 0) }, openingDate: row ? dayKey(row.openingDate) : null };
}

/** Day-by-day balances of [from, to): always summed from the entries, so a corrected past entry moves every later day. */
export async function getKassaLedger(from: Date, to: Date) {
  const [{ opening }, before, rows] = await Promise.all([
    getKassaSettings(),
    getDb().kassaEntry.groupBy({ by: ["type", "currency"], where: { ...live, occurredAt: { lt: from } }, _sum: { amount: true } }),
    getDb().kassaEntry.findMany({ where: { ...live, occurredAt: { gte: from, lt: to } }, select: { type: true, currency: true, amount: true, occurredAt: true, categoryId: true } }),
  ]);
  const carry = carryFrom(opening, before.map(group => ({ type: group.type, currency: group.currency, sum: Number(group._sum.amount ?? 0) })));
  const flat = rows.map(row => ({ ...row, amount: Number(row.amount) }));
  return { days: ledger(carry, flat, dayKey(from), dayKey(new Date(to.getTime() - 1))), rows: flat };
}

export type EntryFilter = { type?: EntryType; employeeId?: string; categoryId?: string; paymentType?: string; q?: string; limit?: number };
export async function getKassaEntries(from: Date, to: Date, filter: EntryFilter = {}) {
  const where: Prisma.KassaEntryWhereInput = { ...live, occurredAt: { gte: from, lt: to } };
  if (filter.type) where.type = filter.type;
  if (filter.employeeId) where.employeeId = filter.employeeId;
  if (filter.categoryId) where.categoryId = filter.categoryId;
  if (filter.paymentType === "CASH" || filter.paymentType === "CARD" || filter.paymentType === "BANK") where.paymentType = filter.paymentType;
  if (filter.q) where.note = { contains: filter.q, mode: "insensitive" };
  const rows = await getDb().kassaEntry.findMany({
    where, orderBy: { occurredAt: "desc" }, take: filter.limit ?? 500,
    include: { employee: { select: { name: true } }, debtEntry: { select: { type: true, amountUsd: true, deletedAt: true } }, category: { select: { name: true, icon: true } }, createdBy: { select: { name: true } }, logs: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } } },
  });
  // debtEffect: what this entry adds to the hodim debt now (null = no live debt row).
  return rows.map(({ debtEntry, ...row }) => ({ ...row, amount: Number(row.amount), currency: row.currency as Currency, debtEffect: debtEntry && !debtEntry.deletedAt ? signed(debtEntry.type as DebtType, Number(debtEntry.amountUsd)) : null }));
}

/** Note suggestions: the latest 300 entries (the form filters them while typing). */
export async function getNoteHistory(): Promise<NoteHint[]> {
  const rows = await getDb().kassaEntry.findMany({ where: live, orderBy: { occurredAt: "desc" }, take: 300, select: { note: true, amount: true, currency: true, categoryId: true, type: true } });
  return rows.map(row => ({ ...row, amount: Number(row.amount) }));
}

/** "O‘chirilganlar" in Sozlamalar, newest deletion first. */
export async function getDeletedEntries() {
  const rows = await getDb().kassaEntry.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: "desc" }, take: 100, include: { deletedBy: { select: { name: true } } } });
  return rows.map(row => ({ ...row, amount: Number(row.amount), currency: row.currency as Currency }));
}

/** "Botdan kelganlar": PENDING bot drafts, oldest first. */
export async function getPendingDrafts() {
  const rows = await getDb().kassaDraft.findMany({ where: { status: "PENDING" }, orderBy: { occurredAt: "asc" }, include: { employee: { select: { name: true } }, category: { select: { name: true, icon: true } } } });
  return rows.map(row => ({ ...row, amount: row.amount === null ? null : Number(row.amount) }));
}
