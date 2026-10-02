import "server-only";

import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { DASHBOARD_TAG } from "@/lib/referrals/tracking";
import type { CustomerYear } from "@/lib/dashboard/rules";
import type { CustomerSaleRow } from "./region-stats";

export type CustomerYearData = { year: number; customers: CustomerYear[]; prizes: Record<1 | 2 | 3, string>; years: number[] };

/** Active regular customers with their monthly USD amounts for `year` (null = month not entered). */
async function loadCustomerYear(year: number): Promise<CustomerYearData> {
  const db = getDb();
  const [customers, sales, prizes, years] = await Promise.all([
    db.regularCustomer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, regionCode: true } }),
    db.regularCustomerMonthlySale.findMany({ where: { year }, select: { customerId: true, month: true, amountUsd: true } }),
    db.rankingPrize.findMany({ where: { year }, select: { place: true, prizeText: true } }),
    db.regularCustomerMonthlySale.groupBy({ by: ["year"] }),
  ]);
  const months = new Map<string, Array<number | null>>(customers.map(customer => [customer.id, Array(12).fill(null)]));
  for (const sale of sales) { const row = months.get(sale.customerId); if (row && sale.month >= 1 && sale.month <= 12) row[sale.month - 1] = Number(sale.amountUsd); }
  const prizeMap = { 1: "", 2: "", 3: "" } as Record<1 | 2 | 3, string>;
  for (const prize of prizes) if (prize.place >= 1 && prize.place <= 3) prizeMap[prize.place as 1 | 2 | 3] = prize.prizeText;
  return { year, customers: customers.map(customer => ({ id: customer.id, name: customer.name, regionCode: customer.regionCode, months: months.get(customer.id)! })), prizes: prizeMap, years: [...new Set([year, ...years.map(row => row.year)])].sort((a, b) => b - a) };
}
const cachedCustomerYear = unstable_cache(loadCustomerYear, ["regular-customer-year-v1"], { revalidate: 300, tags: [DASHBOARD_TAG] });
export async function getCustomerYear(year: number) { return cachedCustomerYear(year); }

export async function getRegularCustomers() {
  return getDb().regularCustomer.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], select: { id: true, name: true, country: true, regionCode: true, phone: true, note: true, isActive: true, ownerId: true, callIntervalDays: true, owner: { select: { name: true } }, _count: { select: { sales: true } } } });
}

/** Active customers joined with their monthly sales for `year` and the year before, in one query (see buildRegionStats). */
async function loadRegionRows(year: number): Promise<CustomerSaleRow[]> {
  return getDb().$queryRaw<CustomerSaleRow[]>(Prisma.sql`
    SELECT c.id, c.name, c.country, c."regionCode", s.year, s.month, s."amountUsd"::float8 AS "amountUsd"
    FROM "RegularCustomer" c
    LEFT JOIN "RegularCustomerMonthlySale" s ON s."customerId" = c.id AND s.year IN (${year}, ${year - 1})
    WHERE c."isActive" = true`);
}
const cachedRegionRows = unstable_cache(loadRegionRows, ["regular-customer-regions-v1"], { revalidate: 300, tags: [DASHBOARD_TAG] });
export async function getCustomerRegionRows(year: number) { return cachedRegionRows(year); }

/** Sellers that customers can be assigned to (active SalesPerson rows). */
export async function getAssignableSellers() {
  return getDb().salesPerson.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}
