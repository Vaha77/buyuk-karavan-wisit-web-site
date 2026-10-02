// Sales plan (Sotuv rejasi): completion %, plan groups and the manager summary. Pure, used on the server.
// Zones (colours, labels, thresholds) live in ./zones.
import { formatPercent, MONTHS_LONG } from "../dashboard/format";
import { DEFAULT_THRESHOLDS, resolveZones, zoneOf, type ZoneInfo, type ZoneKey, type ZoneThresholds } from "./zones";

export type { ZoneKey } from "./zones";

/** Completion in percent (total ÷ plan × 100); 0 when there is no plan. */
export function completion(total: number, plan: number) { return plan > 0 ? (total / plan) * 100 : 0; }
/** Monthly plan = period plan ÷ number of months. */
export function monthlyPlan(plan: number, monthCount: number) { return monthCount > 0 ? plan / monthCount : 0; }

export type PeriodShape = { startYear: number; startMonth: number; monthCount: number };
/** The calendar months of a period, in order (may cross a year boundary). */
export function periodMonths(period: PeriodShape) {
  return Array.from({ length: period.monthCount }, (_, index) => {
    const zeroBased = period.startMonth - 1 + index;
    return { year: period.startYear + Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
  });
}
export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

export type PersonInput = { id: string; name: string; kind: "EMPLOYEE" | "BRANCH"; branchHead: string | null; note: string | null };
export type MonthCell = { year: number; month: number; amount: number | null; percent: number; zone: ZoneKey | null };
export type PersonResult = PersonInput & {
  plan: number; total: number; percent: number; zone: ZoneKey; remaining: number; over: number; months: MonthCell[];
  /** Completion in the previous period (null = no plan there); `twoPeriods` = below the fair line in both. */
  previousPercent: number | null; twoPeriods: boolean;
};
export type PlanGroup = { plan: number; people: PersonResult[]; total: number; planSum: number; percent: number; zone: ZoneKey; high: number; middle: number; low: number };
export type Insight = { key: string; tone: ZoneKey; title: string; text: string };
export type PlanBoard = {
  groups: PlanGroup[]; total: number; planSum: number; percent: number; zone: ZoneKey; withoutPlan: PersonInput[]; insights: Insight[];
  thresholds: ZoneThresholds; zones: ZoneInfo[]; byZone: Array<{ key: ZoneKey; people: Array<{ name: string; percent: number }> }>;
};
export type BoardOptions = { thresholds?: ZoneThresholds; previous?: Map<string, number> };

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * People with a plan in the period, grouped by plan amount (largest first); inside a group by completion.
 * `amounts` is keyed by personId → monthKey; a missing key means the month was not entered.
 * `previous` maps personId → completion % in the previous period (only people that had a plan there).
 */
export function buildPlanBoard(period: PeriodShape, people: PersonInput[], plans: Map<string, number>, amounts: Map<string, Map<string, number>>, options: BoardOptions = {}): PlanBoard {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const months = periodMonths(period);
  const withoutPlan: PersonInput[] = [];
  const results: PersonResult[] = [];
  for (const person of people) {
    const plan = plans.get(person.id) ?? 0;
    if (!(plan > 0)) { withoutPlan.push(person); continue; }
    const perMonth = monthlyPlan(plan, period.monthCount), entered = amounts.get(person.id);
    const cells: MonthCell[] = months.map(({ year, month }) => {
      const amount = entered?.get(monthKey(year, month));
      if (amount === undefined) return { year, month, amount: null, percent: 0, zone: null };
      const percent = completion(amount, perMonth);
      return { year, month, amount, percent, zone: zoneOf(percent, thresholds) };
    });
    const total = round2(cells.reduce((sum, cell) => sum + (cell.amount ?? 0), 0)), percent = completion(total, plan);
    const previousPercent = options.previous?.get(person.id) ?? null;
    results.push({
      ...person, plan, total, percent, zone: zoneOf(percent, thresholds), remaining: Math.max(0, round2(plan - total)), over: Math.max(0, round2(total - plan)), months: cells,
      previousPercent, twoPeriods: previousPercent !== null && previousPercent < thresholds.fair && percent < thresholds.fair,
    });
  }
  const byPlan = new Map<number, PersonResult[]>();
  for (const result of results) byPlan.set(result.plan, [...(byPlan.get(result.plan) ?? []), result]);
  const groups = [...byPlan.entries()].sort((a, b) => b[0] - a[0]).map(([plan, members]): PlanGroup => {
    const sorted = [...members].sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
    const total = round2(sorted.reduce((sum, item) => sum + item.total, 0)), planSum = plan * sorted.length, percent = completion(total, planSum);
    const high = sorted.filter(item => item.percent >= thresholds.excellent).length, low = sorted.filter(item => item.percent < thresholds.fair).length;
    return { plan, people: sorted, total, planSum, percent, zone: zoneOf(percent, thresholds), high, middle: sorted.length - high - low, low };
  });
  const total = round2(groups.reduce((sum, group) => sum + group.total, 0)), planSum = groups.reduce((sum, group) => sum + group.planSum, 0), percent = completion(total, planSum);
  const zones = resolveZones(thresholds);
  const everyone = groups.flatMap(group => group.people);
  const byZone = zones.map(zone => ({ key: zone.key, people: everyone.filter(person => person.zone === zone.key).sort((a, b) => b.percent - a.percent).map(person => ({ name: person.name, percent: person.percent })) }));
  return { groups, total, planSum, percent, zone: zoneOf(percent, thresholds), withoutPlan, insights: buildInsights(groups, thresholds), thresholds, zones, byZone };
}

const pct = (value: number) => formatPercent(value);
const names = (people: PersonResult[]) => people.map(person => `${person.name} (${pct(person.percent)})`).join(", ");
const whole = (value: number) => `${Math.round(value)}%`;

/** Longest run of consecutive entered months below `limit` (a month that was not entered breaks the run). */
export function lowMonthStreak(cells: MonthCell[], limit: number) {
  let best = 0, run = 0;
  for (const cell of cells) { run = cell.amount !== null && cell.percent < limit ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

/** Manager summary (automatic rules). */
export function buildInsights(groups: PlanGroup[], thresholds: ZoneThresholds = DEFAULT_THRESHOLDS): Insight[] {
  const people = groups.flatMap(group => group.people), insights: Insight[] = [];
  const repeat = people.filter(person => person.twoPeriods).sort((a, b) => a.percent - b.percent);
  if (repeat.length) insights.push({ key: "two-periods", tone: "danger", title: `⚠ 2 davr ketma-ket ${whole(thresholds.fair)} dan past`, text: `${repeat.map(person => `${person.name} (${pct(person.previousPercent!)} → ${pct(person.percent)})`).join(", ")}. Qoida bo‘yicha almashtirish masalasini ko‘rib chiqing.` });
  const record = people.filter(person => person.percent >= thresholds.record).sort((a, b) => b.percent - a.percent);
  if (record.length) insights.push({ key: "record", tone: "record", title: "Rekord zonasi", text: `${names(record)} — rejasini oshirishni ko‘rib chiqing.` });
  const spiky = people.filter(person => person.total > 0 && person.months.some(cell => (cell.amount ?? 0) / person.total >= 0.7));
  if (spiky.length) insights.push({ key: "one-month", tone: "fair", title: "Natija bitta oyga to‘plangan", text: spiky.map(person => { const top = person.months.reduce((best, cell) => (cell.amount ?? 0) > (best.amount ?? 0) ? cell : best); return `${person.name}: ${pct(((top.amount ?? 0) / person.total) * 100)} — ${MONTHS_LONG[top.month - 1].toLowerCase()}`; }).join("; ") + " — natija bitta katta sotuvga bog‘liq." });
  const streak = people.filter(person => lowMonthStreak(person.months, thresholds.fair) >= 3);
  if (streak.length) insights.push({ key: "low-months", tone: "warning", title: `3 oy ketma-ket oylik reja ${whole(thresholds.fair)} dan past`, text: `${streak.map(person => person.name).join(", ")} — oylik natijalar barqaror past, yaxshilash rejasi kerak.` });
  const high = people.filter(person => person.percent >= thresholds.excellent).length;
  if (people.length && high / people.length < 0.5) insights.push({ key: "plans-too-high", tone: "fair", title: `${whole(thresholds.excellent)}+ natija kam`, text: `${people.length} ta sotuvchidan faqat ${high} tasi ${whole(thresholds.excellent)}+ — rejalar juda yuqori bo‘lishi mumkin, keyingi davr rejalarini qayta ko‘ring.` });
  return insights;
}
