import "server-only";

import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { DASHBOARD_TAG } from "@/lib/referrals/tracking";
import { funnelLevel } from "./rules";
import { toUsd } from "./money";
import { dayKey } from "./period";

const DAY = 86_400_000;
const OFFER_OUTCOMES = Prisma.sql`('OFFER_SENT', 'NEGOTIATING', 'SALE')`;
async function uzsRate() { const rate = await getUsdUzsRate(); return rate ? Number(rate.rate) : null; }

// ---- KPIs ------------------------------------------------------------------------------------
async function loadKpis(fromIso: string, toIso: string, prevFromIso: string) {
  const from = new Date(fromIso), to = new Date(toIso), prevFrom = new Date(prevFromIso);
  const db = getDb(), dayAgo = new Date(Date.now() - DAY);
  const [leads, prevLeads, byCountry, fresh, stale, sales, prevSales] = await Promise.all([
    db.lead.count({ where: { createdAt: { gte: from, lt: to } } }),
    db.lead.count({ where: { createdAt: { gte: prevFrom, lt: from } } }),
    db.lead.groupBy({ by: ["country"], where: { createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
    db.lead.count({ where: { status: "NEW" } }),
    db.lead.count({ where: { status: "NEW", createdAt: { lt: dayAgo } } }),
    db.sale.count({ where: { status: "APPROVED", approvedAt: { gte: from, lt: to } } }),
    db.sale.count({ where: { status: "APPROVED", approvedAt: { gte: prevFrom, lt: from } } }),
  ]);
  const uz = byCountry.find(row => row.country === "UZ")?._count._all ?? 0;
  const foreign = byCountry.filter(row => row.country && row.country !== "UZ").reduce((sum, row) => sum + row._count._all, 0);
  return { leads, prevLeads, uz, foreign, unknown: leads - uz - foreign, fresh, stale, sales, prevSales };
}
const cachedKpis = unstable_cache(loadKpis, ["dashboard-kpis-v1"], { revalidate: 300, tags: [DASHBOARD_TAG] });

// ---- Weekly dynamics (last 12 weeks, Monday-based in Tashkent) --------------------------------
async function loadWeekly(todayKey: string) {
  const today = new Date(`${todayKey}T00:00:00+05:00`);
  const weekday = (new Date(`${todayKey}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = new Date(today.getTime() - weekday * DAY);
  const start = new Date(thisMonday.getTime() - 11 * 7 * DAY);
  const week = (table: "Lead" | "Calculation") => getDb().$queryRaw<Array<{ week: string; count: bigint }>>(Prisma.sql`SELECT to_char(date_trunc('week', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent'), 'YYYY-MM-DD') AS week, count(*)::bigint AS count FROM ${Prisma.raw(`"${table}"`)} WHERE "createdAt" >= ${start} GROUP BY 1`);
  const [leads, calculations] = await Promise.all([week("Lead"), week("Calculation")]);
  const lookup = (rows: Array<{ week: string; count: bigint }>) => new Map(rows.map(row => [row.week, Number(row.count)]));
  const leadMap = lookup(leads), calcMap = lookup(calculations);
  return Array.from({ length: 12 }, (_, index) => { const monday = dayKey(new Date(start.getTime() + index * 7 * DAY)); return { week: monday, leads: leadMap.get(monday) ?? 0, calculations: calcMap.get(monday) ?? 0 }; });
}
const cachedWeekly = unstable_cache(loadWeekly, ["dashboard-weekly-v1"], { revalidate: 300, tags: [DASHBOARD_TAG] });

// ---- Funnel ----------------------------------------------------------------------------------
async function loadFunnel(fromIso: string, toIso: string) {
  const rows = await getDb().$queryRaw<Array<{ status: string; offer: boolean; sale: boolean; count: bigint }>>(Prisma.sql`
    SELECT l.status::text AS status,
      EXISTS (SELECT 1 FROM "LeadActivity" a WHERE a."leadId" = l.id AND a.metadata->>'outcome' IN ${OFFER_OUTCOMES}) AS offer,
      EXISTS (SELECT 1 FROM "Sale" s WHERE s."leadId" = l.id AND s.status = 'APPROVED') AS sale,
      count(*)::bigint AS count
    FROM "Lead" l WHERE l."createdAt" >= ${new Date(fromIso)} AND l."createdAt" < ${new Date(toIso)}
    GROUP BY 1, 2, 3`);
  // Each lead has one level; a stage counts every lead that reached it or went further.
  const reached = [0, 0, 0, 0, 0];
  for (const row of rows) { const level = funnelLevel({ status: row.status, hasOffer: row.offer, saleApproved: row.sale }); for (let stage = 0; stage <= level; stage++) reached[stage] += Number(row.count); }
  return reached;
}
const cachedFunnel = unstable_cache(loadFunnel, ["dashboard-funnel-v1"], { revalidate: 300, tags: [DASHBOARD_TAG] });

// ---- Regions ---------------------------------------------------------------------------------
async function loadRegions(fromIso: string, toIso: string) {
  const rows = await getDb().lead.groupBy({ by: ["country", "regionCode"], where: { createdAt: { gte: new Date(fromIso), lt: new Date(toIso) } }, _count: { _all: true } });
  return rows.map(row => ({ country: row.country, regionCode: row.regionCode, count: row._count._all }));
}
const cachedRegions = unstable_cache(loadRegions, ["dashboard-regions-v1"], { revalidate: 300, tags: [DASHBOARD_TAG] });

// ---- Sellers, customers, latest leads ---------------------------------------------------------
async function loadPeople(fromIso: string, toIso: string) {
  const from = new Date(fromIso), to = new Date(toIso), db = getDb();
  const [agents, leadsByAgent, salesByAgent, unassigned, customerRows, latest, rate] = await Promise.all([
    db.salesAgent.findMany({ where: { isApproved: true }, select: { id: true, firstName: true, lastName: true } }),
    db.lead.groupBy({ by: ["assignedAgentId"], where: { createdAt: { gte: from, lt: to }, assignedAgentId: { not: null } }, _count: { _all: true } }),
    db.sale.groupBy({ by: ["agentId"], where: { status: "APPROVED", approvedAt: { gte: from, lt: to } }, _count: { _all: true } }),
    db.lead.count({ where: { createdAt: { gte: from, lt: to }, assignedAgentId: null } }),
    db.$queryRaw<Array<{ key: string; name: string | null; region_code: string | null; region: string | null; product: string | null; currency: string | null; amount: number }>>(Prisma.sql`
      SELECT coalesce(l.phone, l.id) AS key, max(coalesce(s."customerName", l."customerName")) AS name, max(l."regionCode") AS region_code, max(l.region) AS region,
        max(s."productDescription") AS product, upper(coalesce(s.currency, 'USD')) AS currency, sum(coalesce(s."saleAmount", 0))::float8 AS amount
      FROM "Sale" s JOIN "Lead" l ON l.id = s."leadId"
      WHERE s.status = 'APPROVED' AND s."approvedAt" >= ${from} AND s."approvedAt" < ${to}
      GROUP BY 1, 6`),
    db.lead.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, customerName: true, product: true, requestType: true, region: true, regionCode: true, status: true, createdAt: true, sale: { select: { status: true } }, activities: { select: { metadata: true }, take: 50 } } }),
    uzsRate(),
  ]);
  const names = new Map(agents.map(agent => [agent.id, [agent.firstName, agent.lastName].filter(Boolean).join(" ")]));
  const salesMap = new Map(salesByAgent.map(row => [row.agentId, row._count._all]));
  const sellers = leadsByAgent.map(row => ({ id: row.assignedAgentId!, name: names.get(row.assignedAgentId!) ?? "Sotuvchi", leads: row._count._all, sales: salesMap.get(row.assignedAgentId!) ?? 0 }))
    .concat(salesByAgent.filter(row => !leadsByAgent.some(item => item.assignedAgentId === row.agentId)).map(row => ({ id: row.agentId, name: names.get(row.agentId) ?? "Sotuvchi", leads: 0, sales: row._count._all })))
    .sort((a, b) => b.sales - a.sales || b.leads - a.leads);
  const customers = new Map<string, { name: string; regionCode: string | null; region: string | null; product: string | null; usd: number }>();
  for (const row of customerRows) {
    const entry = customers.get(row.key) ?? { name: row.name || "Mijoz", regionCode: row.region_code, region: row.region, product: row.product, usd: 0 };
    entry.usd += toUsd(row.amount, row.currency, rate);
    customers.set(row.key, entry);
  }
  const offerOutcomes = new Set(["OFFER_SENT", "NEGOTIATING", "SALE"]);
  return {
    sellers, unassigned,
    customers: [...customers.values()].sort((a, b) => b.usd - a.usd).slice(0, 5),
    latest: latest.map(lead => ({
      id: lead.id, title: lead.product || lead.requestType, region: lead.region, regionCode: lead.regionCode, customerName: lead.customerName, createdAt: lead.createdAt.toISOString(), lost: lead.status === "LOST",
      level: funnelLevel({ status: lead.status, saleApproved: lead.sale?.status === "APPROVED", hasOffer: lead.activities.some(activity => offerOutcomes.has(String((activity.metadata as { outcome?: unknown } | null)?.outcome ?? ""))) }),
    })),
  };
}
const cachedPeople = unstable_cache(loadPeople, ["dashboard-people-v1"], { revalidate: 300, tags: [DASHBOARD_TAG] });

export async function getDashboardData(period: { from: Date; to: Date; prevFrom: Date }) {
  const from = period.from.toISOString(), to = period.to.toISOString();
  const [kpis, weekly, funnel, regions, people] = await Promise.all([
    cachedKpis(from, to, period.prevFrom.toISOString()), cachedWeekly(dayKey(new Date())), cachedFunnel(from, to), cachedRegions(from, to), cachedPeople(from, to),
  ]);
  return { kpis, weekly, funnel, regions, people };
}

/** Conversion lead → sale in the previous period, for the "p.p." delta. */
export async function getPreviousConversion(period: { from: Date; prevFrom: Date }) {
  const kpis = await cachedKpis(period.prevFrom.toISOString(), period.from.toISOString(), new Date(period.prevFrom.getTime() - (period.from.getTime() - period.prevFrom.getTime())).toISOString());
  return kpis.leads ? (kpis.sales / kpis.leads) * 100 : 0;
}
