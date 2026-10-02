// Sales plan (Sotuv rejasi): completion %, colour zones, plan groups and the manager summary. Pure, used on the server.
import { formatInt, formatPercent, MONTHS_LONG } from "../dashboard/format";

export type ZoneKey = "excellent" | "good" | "warning" | "replace";
export const ZONES: Array<{ key: ZoneKey; label: string; range: string; min: number; color: string; text: string }> = [
  { key: "excellent", label: "Ajoyib", range: "100%+", min: 100, color: "#0F6B3A", text: "#FFFFFF" },
  { key: "good", label: "Yaxshi", range: "60–99%", min: 60, color: "#45B36B", text: "#0B2A16" },
  { key: "warning", label: "Ogohlantirish", range: "40–59%", min: 40, color: "#F08A3C", text: "#2B1200" },
  { key: "replace", label: "Almashtirish", range: "40% dan past", min: -Infinity, color: "#D2372B", text: "#FFFFFF" },
];
export const ZONE_BY_KEY = Object.fromEntries(ZONES.map(zone => [zone.key, zone])) as Record<ZoneKey, (typeof ZONES)[number]>;
/** The 60% line drawn on every progress bar. */
export const THRESHOLD = 60;

/** Completion in percent (total ÷ plan × 100); 0 when there is no plan. */
export function completion(total: number, plan: number) { return plan > 0 ? (total / plan) * 100 : 0; }
/** 100+ excellent, 60–99 good, 40–59 warning, below 40 replace. Boundaries belong to the higher zone. */
export function zoneOf(percent: number): ZoneKey { return ZONES.find(zone => percent >= zone.min)!.key; }
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
export type PersonResult = PersonInput & { plan: number; total: number; percent: number; zone: ZoneKey; remaining: number; over: number; threshold: number; months: MonthCell[] };
export type PlanGroup = { plan: number; people: PersonResult[]; total: number; planSum: number; percent: number; zone: ZoneKey; above: number; below: number };
export type Insight = { key: string; tone: ZoneKey; title: string; text: string };
export type PlanBoard = { groups: PlanGroup[]; total: number; planSum: number; percent: number; zone: ZoneKey; withoutPlan: PersonInput[]; insights: Insight[] };

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * People with a plan in the period, grouped by plan amount (largest first); inside a group by completion.
 * `amounts` is keyed by personId → monthKey; a missing key means the month was not entered.
 */
export function buildPlanBoard(period: PeriodShape, people: PersonInput[], plans: Map<string, number>, amounts: Map<string, Map<string, number>>): PlanBoard {
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
      return { year, month, amount, percent, zone: zoneOf(percent) };
    });
    const total = round2(cells.reduce((sum, cell) => sum + (cell.amount ?? 0), 0)), percent = completion(total, plan);
    results.push({ ...person, plan, total, percent, zone: zoneOf(percent), remaining: Math.max(0, round2(plan - total)), over: Math.max(0, round2(total - plan)), threshold: plan * (THRESHOLD / 100), months: cells });
  }
  const byPlan = new Map<number, PersonResult[]>();
  for (const result of results) byPlan.set(result.plan, [...(byPlan.get(result.plan) ?? []), result]);
  const groups = [...byPlan.entries()].sort((a, b) => b[0] - a[0]).map(([plan, members]): PlanGroup => {
    const sorted = [...members].sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
    const total = round2(sorted.reduce((sum, item) => sum + item.total, 0)), planSum = plan * sorted.length, percent = completion(total, planSum);
    return { plan, people: sorted, total, planSum, percent, zone: zoneOf(percent), above: sorted.filter(item => item.percent >= THRESHOLD).length, below: sorted.filter(item => item.percent < THRESHOLD).length };
  });
  const total = round2(groups.reduce((sum, group) => sum + group.total, 0)), planSum = groups.reduce((sum, group) => sum + group.planSum, 0), percent = completion(total, planSum);
  return { groups, total, planSum, percent, zone: zoneOf(percent), withoutPlan, insights: buildInsights(groups) };
}

const pct = (value: number) => formatPercent(value);
const names = (people: PersonResult[]) => people.map(person => `${person.name} (${pct(person.percent)})`).join(", ");

/** Manager summary: weakest group, people below 40%, results concentrated in one month (70%+), people over plan. */
export function buildInsights(groups: PlanGroup[]): Insight[] {
  const people = groups.flatMap(group => group.people), insights: Insight[] = [];
  const weakest = [...groups].sort((a, b) => a.percent - b.percent)[0];
  if (weakest && groups.length > 1) insights.push({ key: "weakest-group", tone: weakest.zone, title: "Eng zaif guruh", text: `Reja ${formatInt(weakest.plan)} guruhi: ${pct(weakest.percent)} · ${weakest.people.length} ta sotuvchidan ${weakest.below} tasi 60% dan past.` });
  const low = people.filter(person => person.percent < 40).sort((a, b) => a.percent - b.percent);
  if (low.length) insights.push({ key: "below-40", tone: "replace", title: "40% dan past — almashtirish zonasi", text: `${names(low)}. Sababini aniqlash yoki rejani qayta ko‘rib chiqish kerak.` });
  const spiky = people.filter(person => person.total > 0 && person.months.some(cell => (cell.amount ?? 0) / person.total >= 0.7));
  if (spiky.length) insights.push({ key: "one-month", tone: "warning", title: "Natija bitta oyga to‘plangan", text: spiky.map(person => { const top = person.months.reduce((best, cell) => (cell.amount ?? 0) > (best.amount ?? 0) ? cell : best); return `${person.name}: ${pct(((top.amount ?? 0) / person.total) * 100)} — ${MONTHS_LONG[top.month - 1].toLowerCase()}`; }).join("; ") + ". Barqaror savdo emas, bitta yirik bitim." });
  const over = people.filter(person => person.percent >= 100).sort((a, b) => b.percent - a.percent);
  if (over.length) insights.push({ key: "over-plan", tone: "excellent", title: "Rejadan oshganlar", text: `${names(over)}. Keyingi davrda rejani oshirish mumkin.` });
  if (insights.length < 3) {
    const good = people.filter(person => person.percent >= THRESHOLD && person.percent < 100);
    insights.push({ key: "on-track", tone: "good", title: "60% chegarasidan yuqori", text: good.length ? `${good.length} ta sotuvchi 60–99% oralig‘ida: ${names(good)}.` : "Hozircha hech kim 60–99% oralig‘ida emas." });
  }
  return insights.slice(0, 5);
}
