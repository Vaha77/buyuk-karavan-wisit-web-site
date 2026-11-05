// "Mening foizim" month close (tests/foizim.test.mjs): computed from the rows every time, never stored, so a past correction re-flows every later month.
import { MONTHS_LONG } from "../dashboard/format";
import { dayKey } from "../dashboard/period";
import { round } from "../kassa/rules";

export type MoneyRow = { direction: "IN" | "OUT"; kind: string; amount: number; occurredAt: Date; salaryMonth?: string | null };
/** The month a row counts in: a salary in the month it is paid for ("qaysi oy uchun"), anything else in the month it happened. */
export const rowMonth = (row: MoneyRow) => row.kind === "SALARY" && row.salaryMonth ? row.salaryMonth : dayKey(row.occurredAt).slice(0, 7);
export type ShortageRow = { type: "OPENING" | "ADD" | "ADJUST"; amount: number; occurredAt: Date };
export type MonthClose = { key: string; name: string; start: number; in: number; salary: number; salaryCount: number; other: number; result: number; closed: boolean; shortageBefore: number; deducted: number; shortageAfter: number; carry: number };

/** "2026-11" → the instant the month starts in Tashkent. */
export const monthStart = (key: string) => new Date(`${key}-01T00:00:00+05:00`);
export const nextMonth = (key: string) => { const [year, month] = key.split("-").map(Number); return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`; };
export const monthName = (key: string) => `${MONTHS_LONG[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;

/**
 * From the first row's month up to now: start = last month's carry; result = start + kirim − chiqim.
 * A closed month (its next 1st, 00:00 has passed) takes min(result, shortage then) off the shortage when result > 0 and carries the rest;
 * a result ≤ 0 carries as is. The open month only previews it.
 */
export function monthCloses(rows: MoneyRow[], shortages: ShortageRow[], now = new Date()) {
  const current = dayKey(now).slice(0, 7), keys = [...rows.map(rowMonth), ...shortages.map(row => dayKey(row.occurredAt).slice(0, 7))];
  const months: MonthClose[] = [];
  let carry = 0, deductedTotal = 0;
  for (let key = [current, ...keys].reduce((a, b) => a < b ? a : b); key <= current; key = nextMonth(key)) {
    const of = rows.filter(row => rowMonth(row) === key), sum = (list: MoneyRow[]) => round(list.reduce((total, row) => total + row.amount, 0));
    const salaries = of.filter(row => row.kind === "SALARY"), income = sum(of.filter(row => row.direction === "IN")), salary = sum(salaries), other = sum(of.filter(row => row.direction === "OUT" && row.kind !== "SALARY"));
    const result = round(carry + income - salary - other), closed = key < current, closeAt = monthStart(nextMonth(key));
    const shortageBefore = round(Math.max(0, shortages.filter(row => closed ? row.occurredAt < closeAt : true).reduce((total, row) => total + row.amount, 0) - deductedTotal));
    const deducted = result > 0 ? Math.min(result, shortageBefore) : 0;
    if (closed) deductedTotal = round(deductedTotal + deducted);
    months.push({ key, name: monthName(key), start: carry, in: income, salary, salaryCount: salaries.length, other, result, closed, shortageBefore, deducted, shortageAfter: round(shortageBefore - deducted), carry: round(result - deducted) });
    carry = closed ? round(result - deducted) : carry;
  }
  const shortage = round(Math.max(0, shortages.reduce((total, row) => total + row.amount, 0) - deductedTotal));
  return { months, shortage, deductedTotal, open: months[months.length - 1] };
}

/** "Kamomat tarixi": the typed rows plus a read-only "<Oy> qoldig‘i ayrildi" line for each closed month that met a shortage. */
export function shortageHistory<T extends ShortageRow & { id: string; note: string }>(rows: T[], months: MonthClose[]) {
  const auto = months.filter(month => month.closed && month.shortageBefore > 0).map(month => ({ id: `auto-${month.key}`, auto: true as const, note: `${MONTHS_LONG[Number(month.key.slice(5)) - 1]} qoldig‘i ayrildi`, amount: -month.deducted, occurredAt: monthStart(nextMonth(month.key)) }));
  return [...rows.map(row => ({ ...row, auto: false as const })), ...auto].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
