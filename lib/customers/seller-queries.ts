import "server-only";

import type { AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { COUNTRY_NAMES, regionName, type CountryCode } from "@/lib/dashboard/regions";
import { customerHistory, dueCustomers, getCustomer, listCustomers, sellerDashboardRows, sellerMapCustomers, sellerPurchases, sellerStats } from "./seller-repo";
import { buildSellerMap } from "./seller-map";
import { buildLeaderboard } from "./leaderboard";
import { getCustomerYear } from "./queries";
import { daysWithoutPurchase, dueTone, isDue } from "./seller-rules";
import { viewerOf } from "./seller-service";
import { leadStats, monthPlan, purchaseStats, staleCustomers, yearPlans, yearSales } from "./seller-dashboard";

const OPEN_ORDERS = ["NEW", "ACCEPTED", "STARTED", "ISSUED"] as const;

type User = Pick<AdminUser, "role" | "salesPersonId">;
type Row = Awaited<ReturnType<typeof listCustomers>>[number];

export function toRow(customer: Row, today = new Date()) {
  return {
    id: customer.id, name: customer.name, phone: customer.phoneNormalized ?? customer.phone,
    region: customer.regionCode ? regionName(customer.regionCode).replace(/ viloyati$/, "") : COUNTRY_NAMES[customer.country as CountryCode] ?? customer.country,
    callIntervalDays: customer.callIntervalDays, days: daysWithoutPurchase(customer, today),
    due: isDue(customer, today) ? dueTone(customer, today) : null,
    nextContact: customer.nextContactAt?.toISOString() ?? null,
  };
}

export const myCustomers = (user: User) => listCustomers(getDb(), viewerOf(user));
export const myCustomer = (user: User, id: string) => getCustomer(getDb(), viewerOf(user), id);
export const myCustomerHistory = (user: User, id: string) => customerHistory(getDb(), viewerOf(user), id);
export const myStats = (user: User, year: number) => sellerStats(getDb(), viewerOf(user), year);
export const myDueCustomers = (user: User) => dueCustomers(getDb(), viewerOf(user));
export const myPurchases = (user: User) => sellerPurchases(getDb(), viewerOf(user));
/** "Mening hududlarim": built from the seller's own customers only (scoped query). */
export const myRegionMap = async (user: User, year: number) => buildSellerMap(await sellerMapCustomers(getDb(), viewerOf(user), year));
/** "Mijozlar reytingi": all sellers' customers, unscoped on purpose — buildLeaderboard drops every amount. */
export async function customerLeaderboard(user: User, now: { year: number; month: number }) {
  const [data, owners] = await Promise.all([getCustomerYear(now.year), getDb().regularCustomer.findMany({ where: { isActive: true }, select: { id: true, ownerId: true, owner: { select: { name: true } } } })]);
  return buildLeaderboard(data.customers, new Map(owners.map(row => [row.id, { ownerId: row.ownerId, name: row.owner?.name ?? null }])), data.prizes, user.salesPersonId ?? "", now.year, now);
}

/**
 * "Mening dashboardim": every query is filtered by the seller's own ids (customer scope, SalesPerson, linked agent,
 * AdminUser for workshop orders), in parallel. Only the seller's own numbers are returned.
 */
export async function myDashboard(user: Pick<AdminUser, "id" | "role" | "salesPersonId">, month: { year: number; month: number }) {
  const db = getDb(), personId = user.salesPersonId ?? "", now = { ...month, day: new Date(Date.now() + 5 * 3_600_000).getUTCDate() };
  const monthStart = new Date(Date.UTC(now.year, now.month - 1, 1) - 5 * 3_600_000), yearStart = new Date(Date.UTC(now.year, 0, 1) - 5 * 3_600_000);
  const [rows, person, planRows, orders] = await Promise.all([
    sellerDashboardRows(db, viewerOf(user), now.year),
    db.salesPerson.findUnique({ where: { id: personId }, select: { agentId: true } }),
    db.salesPlan.findMany({ where: { personId }, select: { planUsd: true, period: { select: { startYear: true, startMonth: true, monthCount: true } } } }),
    db.workshopOrder.findMany({ where: { sellerId: user.id, status: { in: [...OPEN_ORDERS] } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, number: true, type: true, customerName: true, status: true, createdAt: true, dueDate: true } }),
  ]);
  const agentId = person?.agentId ?? null;
  const [leads, newLeads, marja] = await Promise.all([
    agentId ? db.lead.findMany({ where: { assignedAgentId: agentId, createdAt: { gte: monthStart } }, select: { source: true, status: true, referralLinkId: true, sale: { select: { id: true } } } }) : null,
    agentId ? db.lead.count({ where: { assignedAgentId: agentId, status: "NEW" } }) : null,
    agentId ? db.marjaTransaction.findMany({ where: { agentId, type: "SALE_EARNED", createdAt: { gte: yearStart } }, select: { amount: true, createdAt: true } }) : null,
  ]);
  // Sales = approved purchases of the seller's own customers; plan = period plan ÷ months, 0 outside every period.
  const sales = yearSales(rows.purchases, now.year), plans = yearPlans(planRows.map(row => ({ planUsd: Number(row.planUsd), ...row.period })), now.year);
  return {
    plan: plans[now.month - 1] > 0 ? monthPlan({ planUsd: plans[now.month - 1], monthCount: 1, doneUsd: sales[now.month - 1] }, now) : null,
    customers: rows.customers.length, stale: staleCustomers(rows.customers), purchases: purchaseStats(rows.purchases, now),
    months: { sales, plans },
    leads: leads ? leadStats(leads.map(lead => ({ source: lead.source, status: lead.status, referralLinkId: lead.referralLinkId, hasSale: !!lead.sale }))) : null, newLeads,
    marja: marja?.length ? { year: marja.reduce((sum, row) => sum + row.amount, 0), month: marja.filter(row => row.createdAt >= monthStart).reduce((sum, row) => sum + row.amount, 0) } : null,
    orders,
  };
}
