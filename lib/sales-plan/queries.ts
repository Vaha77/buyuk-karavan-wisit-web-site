import "server-only";

import { getDb } from "@/lib/db";
import { buildPlanBoard, monthKey, periodMonths, type PersonInput } from "./rules";

export type SalesPeriodRow = { id: string; name: string; startYear: number; startMonth: number; monthCount: number };

export async function getSalesPeriods(): Promise<SalesPeriodRow[]> {
  return getDb().salesPeriod.findMany({ orderBy: [{ startYear: "desc" }, { startMonth: "desc" }], select: { id: true, name: true, startYear: true, startMonth: true, monthCount: true } });
}

/** The requested period, else the one containing today, else the latest. */
export function pickPeriod(periods: SalesPeriodRow[], requested: string | undefined, today: { year: number; month: number }) {
  const current = today.year * 12 + today.month - 1;
  return periods.find(period => period.id === requested)
    ?? periods.find(period => { const start = period.startYear * 12 + period.startMonth - 1; return current >= start && current < start + period.monthCount; })
    ?? periods[0] ?? null;
}

/** Everything the dashboard and the monthly entry dialog need for one period; totals are computed here, on the server. */
export async function getPlanBoardData(period: SalesPeriodRow) {
  const db = getDb();
  const months = periodMonths(period);
  const [people, plans, monthly] = await Promise.all([
    db.salesPerson.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true, branchHead: true, note: true } }),
    db.salesPlan.findMany({ where: { periodId: period.id }, select: { personId: true, planUsd: true } }),
    db.salesMonthly.findMany({ where: { OR: months.map(({ year, month }) => ({ year, month })), person: { isActive: true } }, select: { personId: true, year: true, month: true, amountUsd: true } }),
  ]);
  const planMap = new Map(plans.map(plan => [plan.personId, Number(plan.planUsd)]));
  const amounts = new Map<string, Map<string, number>>();
  for (const row of monthly) {
    const map = amounts.get(row.personId) ?? new Map<string, number>();
    map.set(monthKey(row.year, row.month), Number(row.amountUsd));
    amounts.set(row.personId, map);
  }
  const persons: PersonInput[] = people;
  return {
    board: buildPlanBoard(period, persons, planMap, amounts),
    months,
    people: persons.map(person => ({ id: person.id, name: person.name, kind: person.kind, plan: planMap.get(person.id) ?? 0 })),
    entered: Object.fromEntries([...amounts].map(([personId, map]) => [personId, Object.fromEntries(map)])) as Record<string, Record<string, number>>,
  };
}

/** Management list: every seller with the plan of `periodId` and the number of monthly records. */
export async function getSalesPeople(periodId: string | null) {
  const rows = await getDb().salesPerson.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, branchHead: true, note: true, isActive: true, sortOrder: true, plans: { where: { periodId: periodId ?? "" }, select: { planUsd: true } }, _count: { select: { monthly: true } } },
  });
  return rows.map(({ plans, _count, ...person }) => ({ ...person, plan: plans[0] ? Number(plans[0].planUsd) : null, monthlyCount: _count.monthly }));
}
