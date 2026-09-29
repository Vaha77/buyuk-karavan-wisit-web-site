import "server-only";

import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { toUsd } from "@/lib/dashboard/money";
import { dayKey } from "@/lib/dashboard/period";
import { conversion, costPerLead, linkSegments, OUTCOME_ORDER, type OutcomeCounts, type OutcomeKey, type ReferralSourceKey } from "./rules";
import { DASHBOARD_TAG } from "./tracking";

export type LinkRow = {
  id: string; name: string; slug: string; source: ReferralSourceKey; status: "ACTIVE" | "PAUSED"; targetPath: string; createdAt: string;
  clicks: number; outcomes: OutcomeCounts; segments: ReturnType<typeof linkSegments>; leads: number; sales: number; salesUsd: number;
  conversion: number; costUsd: number | null; costPerLead: number | null; hasVisits: boolean;
};
type Range = { from: Date; to: Date };
const emptyOutcomes = (): OutcomeCounts => Object.fromEntries(OUTCOME_ORDER.map(key => [key, 0])) as OutcomeCounts;
async function uzsRate() { const rate = await getUsdUzsRate(); return rate ? Number(rate.rate) : null; }

/**
 * Per-link statistics for visits in [from, to). Every visitor counts once by their furthest stage, so
 * ketdi + qiziqdi + bog‘lanish + zayavka (LEAD and SALE) = klik. salesUsd sums approved sales of those visits’ leads.
 */
async function loadLinkRows(fromIso: string, toIso: string): Promise<LinkRow[]> {
  const from = new Date(fromIso), to = new Date(toIso);
  const db = getDb();
  const [links, visitCounts, outcomeCounts, sales, everVisited, rate] = await Promise.all([
    db.referralLink.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, slug: true, source: true, status: true, targetPath: true, createdAt: true, cost: true, costCurrency: true } }),
    db.visit.groupBy({ by: ["referralLinkId"], where: { referralLinkId: { not: null }, firstSeenAt: { gte: from, lt: to } }, _count: { _all: true } }),
    db.visit.groupBy({ by: ["referralLinkId", "outcome"], where: { referralLinkId: { not: null }, firstSeenAt: { gte: from, lt: to } }, _count: { _all: true } }),
    db.sale.findMany({ where: { status: "APPROVED", lead: { visit: { referralLinkId: { not: null }, firstSeenAt: { gte: from, lt: to } } } }, select: { saleAmount: true, currency: true, lead: { select: { visit: { select: { referralLinkId: true } } } } } }),
    db.visit.groupBy({ by: ["referralLinkId"], where: { referralLinkId: { not: null } }, _count: { _all: true } }),
    uzsRate(),
  ]);
  const byLink = <T extends { referralLinkId: string | null }>(rows: T[]) => new Map(rows.map(row => [row.referralLinkId!, row]));
  const visits = byLink(visitCounts), visited = byLink(everVisited);
  return links.map(link => {
    const outcomes = emptyOutcomes();
    for (const row of outcomeCounts) if (row.referralLinkId === link.id) outcomes[row.outcome as OutcomeKey] = row._count._all;
    const linkSales = sales.filter(sale => sale.lead.visit?.referralLinkId === link.id);
    const clicks = visits.get(link.id)?._count._all ?? 0, leadCount = outcomes.LEAD + outcomes.SALE;
    const costUsd = link.cost ? toUsd(link.cost, link.costCurrency, rate) : null;
    return {
      id: link.id, name: link.name, slug: link.slug, source: link.source, status: link.status, targetPath: link.targetPath, createdAt: link.createdAt.toISOString(),
      clicks, outcomes, segments: linkSegments(outcomes), leads: leadCount, sales: outcomes.SALE, salesUsd: linkSales.reduce((sum, sale) => sum + toUsd(sale.saleAmount, sale.currency, rate), 0),
      conversion: conversion(leadCount, clicks), costUsd, costPerLead: costPerLead(costUsd, leadCount), hasVisits: (visited.get(link.id)?._count._all ?? 0) > 0,
    };
  });
}
const cachedLinkRows = unstable_cache(loadLinkRows, ["referral-link-rows-v1"], { revalidate: 300, tags: [DASHBOARD_TAG] });
export async function getLinkRows(range: Range) { return cachedLinkRows(range.from.toISOString(), range.to.toISOString()); }

export async function getLinkSummary(range: Range) {
  const [rows, directLeads] = await Promise.all([
    getLinkRows(range),
    getDb().lead.count({ where: { referralLinkId: null, createdAt: { gte: range.from, lt: range.to } } }),
  ]);
  const totals = rows.reduce((sum, row) => ({ clicks: sum.clicks + row.clicks, leads: sum.leads + row.leads, sales: sum.sales + row.sales, costUsd: sum.costUsd + (row.costUsd || 0), paidLeads: sum.paidLeads + (row.costUsd ? row.leads : 0) }), { clicks: 0, leads: 0, sales: 0, costUsd: 0, paidLeads: 0 });
  const paid = rows.filter(row => row.costPerLead !== null).sort((a, b) => a.costPerLead! - b.costPerLead!);
  return { rows, totals, directLeads, cheapest: paid[0] || null, active: rows.filter(row => row.status === "ACTIVE").length };
}

// ---- Link detail -----------------------------------------------------------------------------

export async function getLinkDetail(id: string, range: Range, dailyDays: 14 | 30) {
  const db = getDb();
  const link = await db.referralLink.findUnique({ where: { id }, include: { ownerAgent: { select: { firstName: true, lastName: true } } } });
  if (!link) return null;
  const dailyFrom = new Date(range.to.getTime() - dailyDays * 86_400_000);
  const [row, duration, daily] = await Promise.all([
    getLinkRows(range).then(rows => rows.find(item => item.id === id)!),
    db.visit.aggregate({ where: { referralLinkId: id, firstSeenAt: { gte: range.from, lt: range.to } }, _avg: { durationSec: true } }),
    db.$queryRaw<Array<{ day: string; clicks: bigint }>>(Prisma.sql`SELECT to_char(("firstSeenAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent')::date, 'YYYY-MM-DD') AS day, count(*)::bigint AS clicks FROM "Visit" WHERE "referralLinkId" = ${id} AND "firstSeenAt" >= ${dailyFrom} AND "firstSeenAt" < ${range.to} GROUP BY 1 ORDER BY 1`),
  ]);
  const counts = new Map(daily.map(item => [item.day, Number(item.clicks)]));
  const days = Array.from({ length: dailyDays }, (_, index) => { const date = new Date(dailyFrom.getTime() + index * 86_400_000); const key = dayKey(date); return { day: key, clicks: counts.get(key) ?? 0 }; });
  return { link, row, avgDurationSec: Math.round(duration._avg.durationSec ?? 0), days };
}

export type VisitorFilter = "all" | "leads" | "left";
const PAGE_SIZE = 20;
const STEP_LABELS: Record<string, string> = { TEL_CLICK: "Telefon", TELEGRAM_CLICK: "Telegram tugmasi", MADINA_OPEN: "Madina AI chat", FORM_SUBMIT: "Forma" };

/** "Bosh → Mahsulotlar → BR +20PG → Forma" from the stored events (consecutive repeats collapsed, at most 6 steps). */
function pathSummary(events: Array<{ type: string; path: string }>, productNames: Map<string, string>) {
  const steps: string[] = [];
  for (const event of events) {
    let label = STEP_LABELS[event.type];
    if (!label && event.type === "PAGEVIEW") {
      const path = event.path.split("?")[0];
      const product = path.match(/^\/products\/([^/]+)/)?.[1];
      label = path === "/" ? "Bosh" : path === "/products" ? "Mahsulotlar" : product ? productNames.get(product) || "Mahsulot" : path.startsWith("/projects") ? "Loyiha" : path;
    }
    if (label && steps.at(-1) !== label) steps.push(label);
  }
  return steps.length > 6 ? [...steps.slice(0, 5), "…", steps.at(-1)!] : steps;
}

export async function getLinkVisitors(id: string, range: Range, filter: VisitorFilter, page: number) {
  const where: Prisma.VisitWhereInput = { referralLinkId: id, firstSeenAt: { gte: range.from, lt: range.to }, ...(filter === "leads" ? { outcome: { in: ["LEAD", "SALE"] } } : filter === "left" ? { outcome: "LEFT" } : {}) };
  const [total, visits] = await Promise.all([
    getDb().visit.count({ where }),
    getDb().visit.findMany({ where, orderBy: { firstSeenAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, visitorId: true, country: true, regionCode: true, device: true, durationSec: true, outcome: true, firstSeenAt: true, lead: { select: { id: true } }, events: { orderBy: { createdAt: "asc" }, take: 30, select: { type: true, path: true } } } }),
  ]);
  const slugs = [...new Set(visits.flatMap(visit => visit.events.map(event => event.path.match(/^\/products\/([^/?]+)/)?.[1]).filter((slug): slug is string => !!slug)))];
  const products = slugs.length ? await getDb().product.findMany({ where: { slug: { in: slugs } }, select: { slug: true, model: true } }) : [];
  const names = new Map(products.map(product => [product.slug, product.model]));
  return {
    total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    rows: visits.map(visit => ({ id: visit.id, label: `#V-${visit.id.slice(-4).toUpperCase()}`, country: visit.country, regionCode: visit.regionCode, device: visit.device, durationSec: visit.durationSec, outcome: visit.outcome as OutcomeKey, firstSeenAt: visit.firstSeenAt.toISOString(), leadId: visit.lead?.id ?? null, steps: pathSummary(visit.events, names) })),
  };
}
