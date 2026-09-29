// Dashboard date range. Every block uses [from, to) and compares with the equal-length period right before it.
export const RANGE_OPTIONS = [
  { key: "7d", label: "So‘nggi 7 kun" },
  { key: "30d", label: "So‘nggi 30 kun" },
  { key: "90d", label: "So‘nggi 90 kun" },
  { key: "year", label: "Bu yil" },
  { key: "custom", label: "Tanlangan davr" },
] as const;
export type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];
export type Period = { key: RangeKey; label: string; from: Date; to: Date; prevFrom: Date; prevTo: Date; days: number };

const DAY = 86_400_000;
const TZ_OFFSET = 5 * 3_600_000; // Asia/Tashkent

/** Start of the Tashkent calendar day containing `date`, as a UTC instant. */
export function startOfDay(date: Date) { return new Date(Math.floor((date.getTime() + TZ_OFFSET) / DAY) * DAY - TZ_OFFSET); }
function parseDay(value: string | undefined) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const date = new Date(`${value}T00:00:00+05:00`); return Number.isNaN(date.getTime()) ? null : date; }
export function dayKey(date: Date) { return new Date(date.getTime() + TZ_OFFSET).toISOString().slice(0, 10); }

export function resolvePeriod(params: { range?: string; from?: string; to?: string }, now = new Date()): Period {
  const tomorrow = new Date(startOfDay(now).getTime() + DAY);
  let key: RangeKey = RANGE_OPTIONS.some(option => option.key === params.range) ? params.range as RangeKey : "30d";
  let from: Date, to = tomorrow;
  if (key === "custom") {
    const start = parseDay(params.from), end = parseDay(params.to);
    if (start && end && start <= end && end.getTime() - start.getTime() <= 3 * 366 * DAY) { from = start; to = new Date(end.getTime() + DAY); }
    else { key = "30d"; from = new Date(tomorrow.getTime() - 30 * DAY); }
  } else if (key === "year") {
    const year = new Date(now.getTime() + TZ_OFFSET).getUTCFullYear();
    from = new Date(`${year}-01-01T00:00:00+05:00`);
  } else from = new Date(tomorrow.getTime() - Number(key.replace("d", "")) * DAY);
  const length = to.getTime() - from.getTime();
  const label = key === "custom" ? `${dayKey(from)} — ${dayKey(new Date(to.getTime() - DAY))}` : RANGE_OPTIONS.find(option => option.key === key)!.label;
  return { key, label, from, to, prevFrom: new Date(from.getTime() - length), prevTo: from, days: Math.round(length / DAY) };
}

/** Query string that keeps the selected range on links (e.g. "?range=7d"). */
export function periodQuery(period: Pick<Period, "key" | "from" | "to">) {
  if (period.key === "30d") return "";
  if (period.key !== "custom") return `?range=${period.key}`;
  return `?range=custom&from=${dayKey(period.from)}&to=${dayKey(new Date(period.to.getTime() - DAY))}`;
}

/** Current year and month (1–12) in Tashkent. */
export function tashkentYearMonth(now: Date = new Date()) {
  const local = new Date(now.getTime() + TZ_OFFSET);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1 };
}
