import "server-only";

import { getDb } from "@/lib/db";
import { buildPlanBoard, monthKey, periodMonths, type PersonInput } from "./rules";
import { parseThresholds } from "./zones";
import { sellerRanking, type SellerRanking } from "./seller-ranking";
import { tashkentYearMonth } from "@/lib/dashboard/period";

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

/** Zone thresholds from Sozlamalar (defaults when not set). */
export async function getZoneThresholds() {
  const settings = await getDb().siteSettings.findUnique({ where: { id: "global" }, select: { salesPlanZones: true } }).catch(() => null);
  return parseThresholds(settings?.salesPlanZones);
}

/** Plans and entered monthly amounts of one period (active sellers only). */
async function loadPeriod(period: SalesPeriodRow) {
  const db = getDb();
  const months = periodMonths(period);
  const [plans, monthly] = await Promise.all([
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
  return { months, planMap, amounts };
}

/** The period that started right before `period` (for the "2 davr ketma-ket" rule). */
export function previousPeriod(periods: SalesPeriodRow[], period: SalesPeriodRow) {
  const start = (item: SalesPeriodRow) => item.startYear * 12 + item.startMonth;
  return periods.filter(item => start(item) < start(period)).sort((a, b) => start(b) - start(a))[0] ?? null;
}

/** Everything the dashboard and the monthly entry dialog need for one period; totals are computed here, on the server. */
export async function getPlanBoardData(period: SalesPeriodRow, periods: SalesPeriodRow[] = []) {
  const db = getDb();
  const before = previousPeriod(periods, period);
  const [people, current, previousData, thresholds] = await Promise.all([
    db.salesPerson.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true, branchHead: true, note: true } }),
    loadPeriod(period), before ? loadPeriod(before) : null, getZoneThresholds(),
  ]);
  const persons: PersonInput[] = people;
  // Previous-period completion per seller that had a plan there; no previous data = no "2 davr" mark.
  const previous = new Map<string, number>();
  if (before && previousData) {
    const board = buildPlanBoard(before, persons, previousData.planMap, previousData.amounts, { thresholds });
    for (const person of board.groups.flatMap(group => group.people)) previous.set(person.id, person.percent);
  }
  return {
    board: buildPlanBoard(period, persons, current.planMap, current.amounts, { thresholds, previous }),
    previousName: before?.name ?? null,
    months: current.months,
    people: persons.map(person => ({ id: person.id, name: person.name, kind: person.kind, plan: current.planMap.get(person.id) ?? 0 })),
    entered: Object.fromEntries([...current.amounts].map(([personId, map]) => [personId, Object.fromEntries(map)])) as Record<string, Record<string, number>>,
  };
}

/** Management list: every seller with the plan of `periodId` and the number of monthly records. */
export async function getSalesPeople(periodId: string | null) {
  const rows = await getDb().salesPerson.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, branchHead: true, note: true, isActive: true, sortOrder: true, telegramChatId: true, plans: { where: { periodId: periodId ?? "" }, select: { planUsd: true } }, _count: { select: { monthly: true } } },
  });
  return rows.map(({ plans, _count, ...person }) => ({ ...person, plan: plans[0] ? Number(plans[0].planUsd) : null, monthlyCount: _count.monthly }));
}

/** Ranking of the current period for a seller's dashboard; only names, ranks, % and zones of other people. */
export async function getSellerRanking(salesPersonId: string | null) {
  const periods = await getSalesPeriods();
  const period = pickPeriod(periods, undefined, tashkentYearMonth());
  if (!period) return { periodName: null, ranking: { rows: [], me: null } satisfies SellerRanking };
  const { board } = await getPlanBoardData(period, periods);
  return { periodName: period.name, ranking: sellerRanking(board, salesPersonId) };
}
