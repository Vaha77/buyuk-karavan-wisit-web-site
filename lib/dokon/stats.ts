// Do‘kon Dashboard and hodim statistics, pure (tests/dokon.test.mjs). Input is what the kassa and hodim queries already return; USD and UZS never mix.
import { dayKey } from "../dashboard/period";
import { debtOf, paidToday, type DebtRow } from "../employees/rules";
import { addDays, ledger, round, type Currency, type EntryType, type LedgerDay, type LedgerRow } from "../kassa/rules";

export type ChartRow = { label: string; full: string; a: number; b: number; line: number };
const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const monthKey = (date: Date) => dayKey(date).slice(0, 7);
const monthRow = (key: string) => { const label = MONTHS[Number(key.slice(5)) - 1]; return { label, full: `${label} ${key.slice(0, 4)}` }; };
const nextMonth = (key: string) => { const [year, month] = key.split("-").map(Number); return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`; };

/** ?p= → the kassa period's range key: the dashboard's numbers come from the same periods as the Kassa page. */
export const PERIOD_KEYS: Record<string, string> = { bugun: "today", hafta: "7d", oy: "month", davr: "custom" };

/** Kirim (a), chiqim (b) and sof farq (line) per day; a range over two months goes by month. */
export function kassaChart(days: LedgerDay[], currency: Currency): ChartRow[] {
  if (days.length <= 62) return days.map(day => { const label = day.day.slice(5).split("-").reverse().join("."), { in: a, out: b } = day[currency]; return { label, full: label, a, b, line: round(a - b) }; });
  const months = new Map<string, ChartRow>();
  for (const day of days) {
    const key = day.day.slice(0, 7), row = months.get(key) ?? { ...monthRow(key), a: 0, b: 0, line: 0 };
    row.a = round(row.a + day[currency].in); row.b = round(row.b + day[currency].out); row.line = round(row.a - row.b);
    months.set(key, row);
  }
  return [...months.values()];
}

/** Kirim / chiqim days without the "Statistikaga kirmasin" categories. Only for flows: a balance always comes from the full ledger. */
export const statsDays = (rows: Array<LedgerRow & { categoryId: string }>, excluded: Set<string>, fromDay: string, toDay: string) => ledger({ USD: 0, UZS: 0 }, rows.filter(row => !excluded.has(row.categoryId)), fromDay, toDay);

/** Top 4 + the rest, biggest first, with shares; a part that rounds to 0% is not shown. */
function topParts(sorted: Array<{ name: string; value: number }>, restName: string) {
  const total = sorted.reduce((sum, part) => sum + part.value, 0), rest = sorted.slice(4).reduce((sum, part) => sum + part.value, 0);
  return [...sorted.slice(0, 4), ...(rest ? [{ name: restName, value: rest }] : [])].map(part => ({ name: part.name, value: round(part.value), pct: total ? Math.round(part.value / total * 100) : 0 })).filter(part => part.pct > 0);
}

/** Chiqim by category: top 4 + "Boshqa", one currency. */
export function spendByCategory(rows: Array<{ type: EntryType; currency: Currency; amount: number; categoryId: string }>, currency: Currency, names: Record<string, string>) {
  const sums = new Map<string, number>();
  for (const row of rows) if (row.type === "OUT" && row.currency === currency) sums.set(row.categoryId, (sums.get(row.categoryId) ?? 0) + row.amount);
  return topParts([...sums].sort((a, b) => b[1] - a[1]).map(([id, value]) => ({ name: names[id] ?? "—", value })), "Boshqa");
}

/** ± against the previous period; null when there is nothing to compare with. */
export const pctChange = (current: number, previous: number) => previous ? Math.round((current - previous) / previous * 100) : null;

/** The hodim page's chips (?p=oy|yil|hammasi|davr) as a time range; no bound = everything. */
export function employeeRange(params: { p?: string; from?: string; to?: string }, now = new Date()): { from?: Date; to?: Date } {
  const today = dayKey(now), start = (day: string) => new Date(`${day}T00:00:00+05:00`), valid = (day?: string) => /^\d{4}-\d{2}-\d{2}$/.test(day ?? "");
  if (params.p === "oy") return { from: start(`${today.slice(0, 7)}-01`) };
  if (params.p === "yil") return { from: start(`${today.slice(0, 4)}-01-01`) };
  if (params.p === "davr") return { from: valid(params.from) ? start(params.from!) : undefined, to: valid(params.to) ? start(addDays(params.to!, 1)) : undefined };
  return {};
}

export type DebtPoint = { label: string; full: string; a: number; b: number; line: number; today: boolean };
export type DebtUnit = "day" | "week" | "month";
const dayMs = 86_400_000, dayText = (day: string) => day.split("-").reverse().join(".");
const daysBetween = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / dayMs) + 1;

/** Olgan (a = DEBT), bergan (b = PAYMENT) and the debt line per bucket. OPENING is never a bar: it is the line's base, so the last point is the current debt. */
function debtPoints(rows: Array<{ day: string; type: DebtRow["type"]; amount: number }>, buckets: Array<{ from: string; to: string; label: string; full: string }>, opening: number, today: string): DebtPoint[] {
  const flows = rows.filter(row => row.type !== "OPENING");
  const sum = (type: DebtRow["type"], from: string, to: string) => round(flows.filter(row => row.type === type && row.day >= from && row.day <= to).reduce((total, row) => total + row.amount, 0));
  return buckets.map(({ from, to, label, full }) => ({ label, full, a: sum("DEBT", from, to), b: sum("PAYMENT", from, to), line: round(opening + debtOf(flows.filter(row => row.day <= to))), today: today >= from && today <= to }));
}

/** The chart's three views. Empty buckets stay on the axis; a short range is padded so no bar stands alone. Hammasi in days = the last 30. */
export function debtChart<T extends DebtRow>(rows: T[], range: { from?: Date; to?: Date } = {}, now = new Date()) {
  const dated = rows.map(row => ({ day: dayKey(row.occurredAt), type: row.type, amount: row.amount })).sort((a, b) => a.day < b.day ? -1 : 1);
  const opening = round(dated.filter(row => row.type === "OPENING").reduce((sum, row) => sum + row.amount, 0)), today = dayKey(now);
  const last = range.to ? dayKey(new Date(range.to.getTime() - 1)) : [today, dated.at(-1)?.day ?? today].sort()[1];
  const first = range.from ? dayKey(range.from) : dated[0]?.day ?? today, span = Math.max(1, daysBetween(first, last));
  const dayCount = Math.min(92, Math.max(7, range.from ? span : 30));
  const day = Array.from({ length: dayCount }, (_, index) => { const key = addDays(last, index - dayCount + 1); return { from: key, to: key, label: String(Number(key.slice(8))), full: dayText(key) }; });
  const weekCount = Math.min(60, Math.max(8, Math.ceil(span / 7)));
  const week = Array.from({ length: weekCount }, (_, index) => { const to = addDays(last, (index - weekCount + 1) * 7), from = addDays(to, -6); return { from, to, label: `${index + 1}-hafta`, full: `${dayText(from)} — ${dayText(to)}` }; });
  const lastMonth = last.slice(0, 7), keys = [first.slice(0, 7)];
  while (keys.at(-1)! < lastMonth) keys.push(nextMonth(keys.at(-1)!));
  while (keys.length < 6) { const [year, month] = keys[0].split("-").map(Number); keys.unshift(month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`); }
  const month = keys.map(key => ({ from: `${key}-01`, to: `${key}-31`, ...monthRow(key) }));
  const inRange = dated.filter(row => row.day >= first && row.day <= last);
  const auto: DebtUnit = span <= 62 || new Set(inRange.map(row => row.day.slice(0, 7))).size <= 1 ? "day" : span <= 186 ? "week" : "month";
  return { opening, auto, series: { day: debtPoints(dated, day, opening, today), week: debtPoints(dated, week, opening, today), month: debtPoints(dated, month, opening, today) } };
}

const nice = (value: number) => { const power = 10 ** Math.floor(Math.log10(value)), part = value / power; return (part <= 1 ? 1 : part <= 2 ? 2 : part <= 5 ? 5 : 10) * power; };
/** Left axis: round values from 0 covering the bars. */
export function barAxis(max: number) {
  const step = nice((max || 100) / 4), count = Math.ceil((max || 100) / step);
  return Array.from({ length: count + 1 }, (_, index) => index * step);
}
/** Right axis: fits the debt's own range, so the line never lies flat against an axis that starts at 0. */
export function debtAxis(values: number[]) {
  const low = Math.min(...values), high = Math.max(...values), step = nice((high - low || Math.max(Math.abs(high) * .1, 100)) / 4);
  const from = high === low ? Math.floor(low / step) * step - 2 * step : Math.floor(low / step) * step, to = high === low ? from + 4 * step : Math.ceil(high / step) * step;
  return Array.from({ length: Math.round((to - from) / step) + 1 }, (_, index) => from + index * step);
}
/** "$64k" for the right axis. */
export const shortUsd = (value: number) => `${value < 0 ? "−" : ""}$${Math.abs(value) >= 1000 ? `${round(Math.abs(value) / 1000)}k` : Math.abs(value)}`;

/** Everything the statistics block shows. Rows are all live rows of one hodim; the debt line always counts from the first row, so its last point is the debt. */
export function employeeStats<T extends DebtRow & { kassaEntryId?: string | null; note: string }>(rows: T[], range: { from?: Date; to?: Date } = {}, now = new Date()) {
  const sorted = [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const inRange = sorted.filter(row => (!range.from || row.occurredAt >= range.from) && (!range.to || row.occurredAt < range.to));
  // "Olgan" is DEBT only: OPENING is the starting debt, shown on its own.
  const taken = inRange.filter(row => row.type === "DEBT"), given = inRange.filter(row => row.type === "PAYMENT"), opened = inRange.filter(row => row.type === "OPENING");
  const sum = (list: T[]) => round(list.reduce((total, row) => total + row.amount, 0));
  const takenSum = sum(taken), givenSum = sum(given), openedSum = sum(opened), owed = round(openedSum + takenSum), month = monthKey(now);
  return {
    since: sorted[0]?.occurredAt ?? null,
    opening: openedSum, taken: takenSum, takenCount: taken.length, given: givenSum, givenCount: given.length,
    debt: debtOf(sorted), monthChange: debtOf(sorted.filter(row => monthKey(row.occurredAt) === month)),
    lastPayment: sorted.findLast(row => row.type === "PAYMENT") ?? null,
    // Repaid share of everything owed, the starting debt included.
    pct: owed ? Math.min(100, Math.round(givenSum / owed * 100)) : 0,
    left: Math.max(0, round(owed - givenSum)),
    average: given.length ? round(givenSum / given.length) : 0,
    recent: inRange.slice(-5).reverse(),
  };
}

/** The Hodimlar page: active hodimlar only; the debt line, cards and shares all run through employeeStats / debtOf. */
export function staffStats<E extends { id: string; name: string; position: string | null; archived: boolean; debt: number }, T extends DebtRow & { employeeId: string; kassaEntryId?: string | null; note: string }>(employees: E[], rows: T[], range: { from?: Date; to?: Date } = {}, now = new Date()) {
  const active = employees.filter(item => !item.archived), ids = new Set(active.map(item => item.id)), live = rows.filter(row => ids.has(row.employeeId));
  const payers = new Set(live.filter(row => row.type === "PAYMENT" && dayKey(row.occurredAt) === dayKey(now)).map(row => row.employeeId));
  const months: string[] = [];
  for (let key = monthKey(new Date(now.getTime() - 335 * 86_400_000)); months.length < 12; key = nextMonth(key)) months.push(key);
  const cards = active.map(item => {
    const own = live.filter(row => row.employeeId === item.id), trend = months.map(key => debtOf(own.filter(row => monthKey(row.occurredAt) <= key)));
    return { id: item.id, name: item.name, position: item.position, debt: item.debt, trend, rising: trend[11] > trend[0], pct: employeeStats(own, {}, now).pct };
  });
  const owing = active.filter(item => item.debt > 0).sort((a, b) => b.debt - a.debt).map(item => ({ name: item.name, value: item.debt }));
  return { sums: employeeStats(live, range, now), chart: debtChart(live, range, now), today: { ...paidToday(live, now), people: payers.size }, parts: topParts(owing, "Boshqalar"), cards };
}
