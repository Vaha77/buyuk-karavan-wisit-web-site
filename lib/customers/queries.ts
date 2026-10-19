import "server-only";

import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { DASHBOARD_TAG } from "@/lib/referrals/tracking";
import type { CustomerYear } from "@/lib/dashboard/rules";
import type { CustomerSaleRow } from "./region-stats";
import type { MonthEntry } from "./region-period";

export type CustomerYearData = { year: number; customers: CustomerYear[]; prizes: Record<1 | 2 | 3, string>; years: number[] };

/** Active regular customers with their monthly USD amounts for `year` (null = month not entered). */
async function loadCustomerYear(year: number): Promise<CustomerYearData> {
  const db = getDb();
  const [customers, sales, prizes, years] = await Promise.all([
    db.regularCustomer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, regionCode: true, owner: { select: { name: true } } } }),
    db.regularCustomerMonthlySale.findMany({ where: { year }, select: { customerId: true, month: true, amountUsd: true } }),
    db.rankingPrize.findMany({ where: { year }, select: { place: true, prizeText: true } }),
    db.regularCustomerMonthlySale.groupBy({ by: ["year"] }),
  ]);
  const months = new Map<string, Array<number | null>>(customers.map(customer => [customer.id, Array(12).fill(null)]));
  for (const sale of sales) { const row = months.get(sale.customerId); if (row && sale.month >= 1 && sale.month <= 12) row[sale.month - 1] = Number(sale.amountUsd); }
  const prizeMap = { 1: "", 2: "", 3: "" } as Record<1 | 2 | 3, string>;
  for (const prize of prizes) if (prize.place >= 1 && prize.place <= 3) prizeMap[prize.place as 1 | 2 | 3] = prize.prizeText;
  return { year, customers: customers.map(customer => ({ id: customer.id, name: customer.name, regionCode: customer.regionCode, seller: customer.owner?.name ?? null, months: months.get(customer.id)! })), prizes: prizeMap, years: [...new Set([year, ...years.map(row => row.year)])].sort((a, b) => b - a) };
}
const cachedCustomerYear = unstable_cache(loadCustomerYear, ["regular-customer-year-v2"], { revalidate: 300, tags: [DASHBOARD_TAG] });
export async function getCustomerYear(year: number) { return cachedCustomerYear(year); }

export async function getRegularCustomers() {
  return getDb().regularCustomer.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], select: { id: true, name: true, country: true, regionCode: true, phone: true, note: true, isActive: true, ownerId: true, callIntervalDays: true, owner: { select: { name: true } }, _count: { select: { sales: true } } } });
}

/**
 * Active customers joined with their monthly sales for `year` and the year before, in one query (see buildRegionStats).
 * A month's location = the latest approved purchase of that month that has one, else the customer's current location.
 */
async function loadRegionRows(year: number): Promise<CustomerSaleRow[]> {
  return getDb().$queryRaw<CustomerSaleRow[]>(Prisma.sql`
    SELECT c.id, c.name, COALESCE(p.country, c.country) AS country, COALESCE(p."regionCode", c."regionCode") AS "regionCode", s.year, s.month, s."amountUsd"::float8 AS "amountUsd"
    FROM "RegularCustomer" c
    LEFT JOIN "RegularCustomerMonthlySale" s ON s."customerId" = c.id AND s.year IN (${year}, ${year - 1})
    LEFT JOIN LATERAL (
      SELECT cp.country, cp."regionCode" FROM "CustomerPurchase" cp
      WHERE cp."customerId" = c.id AND cp.status = 'APPROVED' AND cp."regionCode" IS NOT NULL
        AND EXTRACT(YEAR FROM cp.date) = s.year AND EXTRACT(MONTH FROM cp.date) = s.month
      ORDER BY cp.date DESC, cp."createdAt" DESC LIMIT 1
    ) p ON true
    WHERE c."isActive" = true`);
}
const cachedRegionRows = unstable_cache(loadRegionRows, ["regular-customer-regions-v2"], { revalidate: 300, tags: [DASHBOARD_TAG] });
export async function getCustomerRegionRows(year: number) { return cachedRegionRows(year); }

/** Region panel "Davr", daily: approved purchases summed per calendar day (the purchase's region, else the customer's). */
export function regionDayRows(codes: string[], from: string, to: string) {
  return getDb().$queryRaw<Array<{ key: string; value: number }>>(Prisma.sql`
    SELECT to_char(cp.date, 'YYYY-MM-DD') AS key, sum(cp."amountUsd")::float8 AS value
    FROM "CustomerPurchase" cp JOIN "RegularCustomer" c ON c.id = cp."customerId"
    WHERE cp.status = 'APPROVED' AND c."isActive" AND COALESCE(cp."regionCode", c."regionCode") = ANY(${codes}) AND cp.date BETWEEN ${from}::date AND ${to}::date
    GROUP BY 1`);
}
/** Region panel "Davr", monthly / yearly: the region's customers with their monthly entries in the range (located as in loadRegionRows); no entry = a null row. */
export function regionMonthRows(codes: string[], from: string | null, to: string) {
  const first = from ? Number(from.slice(0, 4)) * 100 + Number(from.slice(5, 7)) : 0, last = Number(to.slice(0, 4)) * 100 + Number(to.slice(5, 7));
  return getDb().$queryRaw<MonthEntry[]>(Prisma.sql`
    SELECT c.id, c.name, to_char(c."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') AS since, s.year, s.month, s."amountUsd"::float8 AS "amountUsd"
    FROM "RegularCustomer" c
    LEFT JOIN "RegularCustomerMonthlySale" s ON s."customerId" = c.id AND s.year * 100 + s.month BETWEEN ${first} AND ${last}
    LEFT JOIN LATERAL (
      SELECT cp."regionCode" FROM "CustomerPurchase" cp
      WHERE cp."customerId" = c.id AND cp.status = 'APPROVED' AND cp."regionCode" IS NOT NULL
        AND EXTRACT(YEAR FROM cp.date) = s.year AND EXTRACT(MONTH FROM cp.date) = s.month
      ORDER BY cp.date DESC, cp."createdAt" DESC LIMIT 1
    ) p ON true
    WHERE c."isActive" = true AND COALESCE(p."regionCode", c."regionCode") = ANY(${codes})`);
}

/** Sellers that customers can be assigned to (active SalesPerson rows). */
export async function getAssignableSellers() {
  return getDb().salesPerson.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}
