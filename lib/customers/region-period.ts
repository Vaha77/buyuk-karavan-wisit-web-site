// Region panel "Davr": Bu oy (every day) | Hammasi (every month since the first sale) | Oraliq (≤ 62 days daily, ≤ 3 years monthly, else yearly).
// Pure: the server action loads the rows (one query) and builds the points here, so the tests run it directly.
import { MONTHS_LONG, MONTHS_SHORT } from "../dashboard/format";
import { REGIONS } from "../dashboard/regions";
import { requiredMonths } from "../dashboard/rules";

export type PeriodMode = "month" | "all" | "range";
export type Grain = "day" | "month" | "year";
export type ResolvedPeriod = { mode: PeriodMode; from: string; to: string; grain: Grain; label: string };
export type PeriodPoint = { key: string; label: string; full: string; value: number | null; missing: boolean };
/** One row per (customer, monthly entry) from a LEFT JOIN; year/month null = no entry. `since` = "YYYY-MM" the customer was added. */
export type MonthEntry = { id: string; name: string; since: string; year: number | null; month: number | null; amountUsd: number | null };

const DAY = 86_400_000, ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (value: number) => String(value).padStart(2, "0");
/** Calendar day in Tashkent: "2026-10-31" until 23:59 there, "2026-11-01" from 00:00. */
export const tashkentDay = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(now);
const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
const dots = (day: string) => day.split("-").reverse().join(".");
const monthName = (month: number) => MONTHS_LONG[month - 1];

/** ≤ 62 days → daily, ≤ 3 years → monthly, longer → yearly. */
export function grainFor(from: string, to: string): Grain {
  if ((Date.parse(to) - Date.parse(from)) / DAY <= 62) return "day";
  return to <= `${Number(from.slice(0, 4)) + 3}${from.slice(4)}` ? "month" : "year";
}

/** Codes whose sales count for a customer region: itself, regions inside its polygon, and Toshkent shahri for "Toshkent". */
export const regionCodesFor = (code: string) => [code, ...REGIONS.filter(region => region.parent === code).map(region => region.code), ...(code === "UZ-TO" ? ["UZ-TK"] : [])];

/** URL ?period=month|all|range&from&to → dates. `first` = first month with a sale ("YYYY-MM"), the start of "Hammasi". */
export function resolvePeriod(input: { period?: string | null; from?: string | null; to?: string | null }, now = new Date(), first: string | null = null): { ok: true; period: ResolvedPeriod } | { ok: false; error: string } {
  const month = tashkentDay(now).slice(0, 7);
  if (input.period === "range") {
    const from = input.from ?? "", to = input.to ?? "";
    if (!ISO.test(from) || !ISO.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return { ok: false, error: "“dan” va “gacha” sanalarini tanlang." };
    if (from > to) return { ok: false, error: "“dan” sanasi “gacha” sanasidan keyin bo‘lmasin." };
    return { ok: true, period: { mode: "range", from, to, grain: grainFor(from, to), label: `${dots(from)} – ${dots(to)}` } };
  }
  if (input.period === "all") return { ok: true, period: { mode: "all", from: `${first && first < month ? first : month}-01`, to: lastDay(month), grain: "month", label: "barcha davr" } };
  return { ok: true, period: { mode: "month", from: `${month}-01`, to: lastDay(month), grain: "day", label: `${monthName(Number(month.slice(5)))} ${month.slice(0, 4)}` } };
}

/** Monthly entries summed into the period's buckets ("YYYY-MM" or "YYYY"). */
export function sumBuckets(rows: MonthEntry[], grain: Grain) {
  const sums = new Map<string, number>();
  for (const row of rows) {
    if (row.year === null || row.month === null || row.amountUsd === null) continue;
    const key = grain === "year" ? String(row.year) : `${row.year}-${pad(row.month)}`;
    sums.set(key, Math.round(((sums.get(key) ?? 0) + Number(row.amountUsd)) * 100) / 100);
  }
  return sums;
}

/** "Kiritilmagan oylar" inside the period only: completed months (requiredMonths) since the customer was added, with no entry. Never in "Bu oy". */
export function missingInPeriod(rows: MonthEntry[], period: ResolvedPeriod, now = new Date()) {
  if (period.mode === "month") return [];
  const today = tashkentDay(now), current = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const customers = new Map<string, { name: string; since: string; entered: Set<string> }>();
  for (const row of rows) {
    const customer = customers.get(row.id) ?? { name: row.name, since: row.since, entered: new Set<string>() };
    if (row.year !== null && row.month !== null) customer.entered.add(`${row.year}-${pad(row.month)}`);
    customers.set(row.id, customer);
  }
  const out: Array<{ key: string; label: string; names: string[] }> = [];
  for (let year = Number(period.from.slice(0, 4)); year <= Number(period.to.slice(0, 4)); year++) {
    for (const month of requiredMonths(year, current)) {
      const key = `${year}-${pad(month)}`;
      if (key < period.from.slice(0, 7) || key > period.to.slice(0, 7)) continue;
      const names = [...customers.values()].filter(customer => key >= customer.since && !customer.entered.has(key)).map(customer => customer.name).sort((a, b) => a.localeCompare(b));
      if (names.length) out.push({ key, label: `${monthName(month)} ${year}`, names });
    }
  }
  return out;
}

/** Every bucket of the period with its sum; days after today stay empty in "Bu oy"; `missing` marks months (or years) with a gap. */
export function periodPoints(period: ResolvedPeriod, values: Map<string, number>, missingKeys: string[] = [], now = new Date()): PeriodPoint[] {
  const today = tashkentDay(now), keys: string[] = [];
  if (period.grain === "day") for (let time = Date.parse(period.from); time <= Date.parse(period.to); time += DAY) keys.push(new Date(time).toISOString().slice(0, 10));
  else if (period.grain === "month") for (let year = Number(period.from.slice(0, 4)), month = Number(period.from.slice(5, 7)); `${year}-${pad(month)}` <= period.to.slice(0, 7); month === 12 ? (year++, month = 1) : month++) keys.push(`${year}-${pad(month)}`);
  else for (let year = Number(period.from.slice(0, 4)); year <= Number(period.to.slice(0, 4)); year++) keys.push(String(year));
  const years = period.from.slice(0, 4) !== period.to.slice(0, 4);
  return keys.map(key => {
    const year = key.slice(0, 4), month = Number(key.slice(5, 7)), short = MONTHS_SHORT[month - 1];
    const label = period.grain === "day" ? String(Number(key.slice(8))) : period.grain === "month" ? `${short[0].toUpperCase()}${short.slice(1)}${years ? ` ${year.slice(2)}` : ""}` : year;
    const full = period.grain === "day" ? `${Number(key.slice(8))}-${monthName(month).toLowerCase()} ${year}` : period.grain === "month" ? `${monthName(month)} ${year}` : year;
    const value = period.mode === "month" && key > today ? null : values.get(key) ?? 0;
    return { key, label, full, value, missing: missingKeys.some(missing => missing.startsWith(key)) };
  });
}
