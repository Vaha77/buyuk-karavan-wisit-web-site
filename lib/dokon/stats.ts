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

/** Everything the statistics block shows. Rows are all live rows of one hodim; the debt line always counts from the first row, so its last point is the debt. */
export function employeeStats<T extends DebtRow & { kassaEntryId?: string | null; note: string }>(rows: T[], range: { from?: Date; to?: Date } = {}, now = new Date()) {
  const sorted = [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const inRange = sorted.filter(row => (!range.from || row.occurredAt >= range.from) && (!range.to || row.occurredAt < range.to));
  const taken = inRange.filter(row => row.type !== "PAYMENT"), given = inRange.filter(row => row.type === "PAYMENT");
  const sum = (list: T[]) => round(list.reduce((total, row) => total + row.amount, 0));
  const takenSum = sum(taken), givenSum = sum(given), month = monthKey(now);
  const months: ChartRow[] = [];
  if (sorted.length) {
    const lastRow = inRange.at(-1), end = range.to ? monthKey(new Date(range.to.getTime() - 1)) : [month, lastRow ? monthKey(lastRow.occurredAt) : month].sort()[1];
    for (let key = monthKey(range.from ?? sorted[0].occurredAt); key <= end; key = nextMonth(key)) {
      const of = (list: T[]) => sum(list.filter(row => monthKey(row.occurredAt) === key));
      months.push({ ...monthRow(key), a: of(taken), b: of(given), line: debtOf(sorted.filter(row => monthKey(row.occurredAt) <= key)) });
    }
  }
  return {
    since: sorted[0]?.occurredAt ?? null,
    taken: takenSum, takenCount: taken.length, given: givenSum, givenCount: given.length,
    debt: debtOf(sorted), monthChange: debtOf(sorted.filter(row => monthKey(row.occurredAt) === month)),
    lastPayment: sorted.findLast(row => row.type === "PAYMENT") ?? null,
    pct: takenSum ? Math.min(100, Math.round(givenSum / takenSum * 100)) : 0,
    left: Math.max(0, round(takenSum - givenSum)),
    average: given.length ? round(givenSum / given.length) : 0,
    months, recent: inRange.slice(-5).reverse(),
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
  return { sums: employeeStats(live, range, now), today: { ...paidToday(live, now), people: payers.size }, parts: topParts(owing, "Boshqalar"), cards };
}
