// Hodim debts, USD only (tests/hodimlar.test.mjs). A debt is summed from its entries, never stored; a minus means overpaid.
import type { Prisma } from "../../generated/prisma/client";
import { dayKey } from "../dashboard/period";
import { diffEntry, parseAmount, parseLocalTime, round, type Currency, type EntryType } from "../kassa/rules";

export type DebtType = "DEBT" | "PAYMENT" | "OPENING";
export type DebtRow = { type: DebtType; amount: number; occurredAt: Date };
export const DEBT_NOTES: Record<DebtType, string> = { DEBT: "Qarz yozildi", PAYMENT: "To‘ladi", OPENING: "Boshlang‘ich qarz" };
/** The "👤 Hodimdan" kirim category (seeded by the migration): it opens the hodim picker. */
export const EMPLOYEE_CATEGORY_ID = "kassa_in_employee";

export const signed = (type: DebtType, amount: number) => type === "PAYMENT" ? -amount : amount;
export const debtOf = (rows: Array<Pick<DebtRow, "type" | "amount">>) => round(rows.reduce((sum, row) => sum + signed(row.type, row.amount), 0));
/** Red above 0, gray at 0, green below 0. */
export const debtTone = (debt: number) => debt > 0 ? "is-debt" : debt < 0 ? "is-over" : "is-zero";

/** Do‘kon Dashboard and the Hodimlar page: the same total of active hodimlar, how many owe, everyone by debt (biggest first). */
export function shopDebts<T extends { archived: boolean; debt: number }>(employees: T[]) {
  const active = employees.filter(item => !item.archived);
  return { total: round(active.reduce((sum, item) => sum + item.debt, 0)), holders: active.filter(item => item.debt > 0).length, list: [...active].sort((a, b) => b.debt - a.debt) };
}

/** Newest first, each row with the running debt in date order. */
export function withBalance<T extends DebtRow>(rows: T[]) {
  let balance = 0;
  return [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).map(row => ({ ...row, balance: balance = round(balance + signed(row.type, row.amount)) })).reverse();
}

/** "Bugun to‘ladi": PAYMENT rows of the Tashkent day. */
export function paidToday(rows: DebtRow[], now = new Date()) {
  const paid = rows.filter(row => row.type === "PAYMENT" && dayKey(row.occurredAt) === dayKey(now));
  return { sum: round(paid.reduce((sum, row) => sum + row.amount, 0)), count: paid.length };
}

/** Which debt row a kassa entry makes: kirim = PAYMENT, chiqim with the toggle = DEBT, otherwise none (so‘m never). */
export function debtTypeOf(entry: { type: EntryType; currency: Currency; employeeId: string | null }, addToDebt: boolean): DebtType | null {
  if (!entry.employeeId || entry.currency !== "USD") return null;
  return entry.type === "IN" ? "PAYMENT" : addToDebt ? "DEBT" : null;
}

/** The form's hodim list: active ones (plus the one already chosen) whose name holds the typed text. */
export function pickableEmployees<T extends { id: string; name: string; archived: boolean }>(employees: T[], search: string, current: string) {
  const query = search.trim().toLocaleLowerCase();
  return employees.filter(item => (!item.archived || item.id === current) && item.name.toLocaleLowerCase().includes(query));
}

/** The form's live line: current debt without what this entry already did (`prior`), plus what it will do. */
export function debtAfter(current: number, prior: number, entry: { type: EntryType; amount: number; addToDebt: boolean }) {
  return round(current - prior + (entry.type === "IN" ? -entry.amount : entry.addToDebt ? entry.amount : 0));
}

const validAmount = (amount: number) => Number.isFinite(amount) && amount > 0 && amount < 1e15 && round(amount) === amount;

export function parseEmployee(form: Record<string, unknown>) {
  const text = (key: string, max: number) => String(form[key] ?? "").trim().slice(0, max);
  const name = text("name", 100), openingText = text("opening", 30), opening = openingText ? parseAmount(openingText) : 0;
  if (!name) return { ok: false as const, error: "Ismni yozing." };
  if (openingText && !validAmount(opening)) return { ok: false as const, error: "Qarz summasini to‘g‘ri kiriting." };
  return { ok: true as const, data: { name, position: text("position", 100) || null, phone: text("phone", 32) || null, archived: form.archived === "on" }, opening };
}

/** "+ Qarz yozish" / "✓ To‘ladi" form fields; an empty note takes the type's name. */
export function parseDebtEntry(form: Record<string, unknown>) {
  const type = (["DEBT", "PAYMENT", "OPENING"] as const).find(item => item === form.type), amountUsd = parseAmount(form.amount), occurredAt = parseLocalTime(form.occurredAt);
  if (!type) return { ok: false as const, error: "So‘rov noto‘g‘ri." };
  if (!validAmount(amountUsd)) return { ok: false as const, error: "Summani to‘g‘ri kiriting." };
  if (Number.isNaN(occurredAt.getTime())) return { ok: false as const, error: "Sanani to‘g‘ri kiriting." };
  const note = String(form.note ?? "").trim();
  if (note.length > 300) return { ok: false as const, error: "Izoh 300 belgidan oshmasin." };
  return { ok: true as const, data: { type, amountUsd, note: note || DEBT_NOTES[type], occurredAt } };
}

type Tx = Pick<Prisma.TransactionClient, "employeeDebtEntry" | "employeeDebtLog">;
type KassaSide = { id: string; type: EntryType; amount: number; currency: Currency; note: string; occurredAt: Date; employeeId: string | null };

/** Makes the entry's debt row match it (inside the kassa transaction): created, updated, revived or soft deleted; kassaEntryId keeps it one row. */
export async function syncKassaDebt(tx: Tx, entry: KassaSide, addToDebt: boolean, userId: string) {
  const linked = await tx.employeeDebtEntry.findUnique({ where: { kassaEntryId: entry.id } }), type = debtTypeOf(entry, addToDebt);
  if (!type) {
    if (linked && !linked.deletedAt) await softDelete(tx, linked.id, new Date(), userId, null);
    return;
  }
  const values = { employeeId: entry.employeeId!, type, amountUsd: entry.amount, note: entry.note, occurredAt: entry.occurredAt };
  if (!linked) {
    const created = await tx.employeeDebtEntry.create({ data: { ...values, kassaEntryId: entry.id, createdById: userId } });
    await tx.employeeDebtLog.create({ data: { entryId: created.id, userId, changes: diffEntry({}, values) } });
    return;
  }
  const changes = { ...diffEntry({ ...linked, amountUsd: Number(linked.amountUsd) }, values), ...(linked.deletedAt && { deletedAt: [linked.deletedAt.toISOString(), null] as [string, null] }) };
  if (!Object.keys(changes).length) return;
  await tx.employeeDebtEntry.update({ where: { id: linked.id }, data: { ...values, deletedAt: null, deletedById: null, deleteReason: null } });
  await tx.employeeDebtLog.create({ data: { entryId: linked.id, userId, changes } });
}

async function softDelete(tx: Tx, id: string, at: Date, userId: string, deleteReason: string | null) {
  await tx.employeeDebtEntry.update({ where: { id }, data: { deletedAt: at, deletedById: userId, deleteReason } });
  await tx.employeeDebtLog.create({ data: { entryId: id, userId, changes: { deletedAt: [null, at.toISOString()], deleteReason: [null, deleteReason] } } });
}

/** Kassa "O‘chirish": a live debt row goes with it, stamped with the same time. */
export async function deleteKassaDebt(tx: Tx, kassaEntryId: string, at: Date, userId: string, deleteReason: string | null) {
  const linked = await tx.employeeDebtEntry.findUnique({ where: { kassaEntryId } });
  if (linked && !linked.deletedAt) await softDelete(tx, linked.id, at, userId, deleteReason);
}

/** Kassa "Tiklash": only the row that left with the entry (same time) returns; one already off by the toggle stays off. */
export async function restoreKassaDebt(tx: Tx, kassaEntryId: string, entryDeletedAt: Date, userId: string) {
  const linked = await tx.employeeDebtEntry.findUnique({ where: { kassaEntryId } });
  if (!linked || linked.deletedAt?.getTime() !== entryDeletedAt.getTime()) return;
  await tx.employeeDebtEntry.update({ where: { id: linked.id }, data: { deletedAt: null, deletedById: null, deleteReason: null } });
  await tx.employeeDebtLog.create({ data: { entryId: linked.id, userId, changes: { deletedAt: [entryDeletedAt.toISOString(), null], deleteReason: [linked.deleteReason, null] } } });
}
