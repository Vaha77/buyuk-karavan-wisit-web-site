// Regular customer sales by Uzbekistan region for one year. Pure: the page loads the rows in one query and
// builds the stats on the server, so the client only renders. Regions are the 14 UZ-XX codes in lib/dashboard/regions.
import { regionsOf } from "../dashboard/regions";
import { delta, requiredMonths } from "../dashboard/rules";

/** One row per (customer, monthly sale) from a LEFT JOIN; year/month/amountUsd are null for a customer without sales. */
export type CustomerSaleRow = { id: string; name: string; country: string; regionCode: string | null; year: number | null; month: number | null; amountUsd: number | null };
export type Growth = ReturnType<typeof delta> | null;
export type RegionCustomer = { id: string; name: string; total: number; months: Array<number | null> };
export type RegionStat = {
  code: string; name: string; customers: number; total: number; share: number; average: number; prevTotal: number; growth: Growth;
  topCustomer: { name: string; total: number } | null; lastMonth: number | null; months: number[];
  missing: Array<{ month: number; names: string[] }>; customerRows: RegionCustomer[];
};
export type RegionStats = {
  year: number; periodEnd: number;
  kpis: { activeCustomers: number; total: number; average: number; regionsWithCustomers: number; regionCount: number; prevTotal: number; growth: Growth };
  regions: RegionStat[]; // ranked: total desc, then customer count, then name
  unassigned: { customers: number; total: number };
};

const sum = (values: Array<number | null>) => values.reduce<number>((total, value) => total + (value || 0), 0);
const round = (value: number) => Math.round(value * 100) / 100;

export function buildRegionStats(rows: CustomerSaleRow[], year: number, now: { year: number; month: number }): RegionStats {
  // Same period of the previous year: Jan..current month for the current year, the whole year for past years.
  const periodEnd = year < now.year ? 12 : year === now.year ? now.month : 0;
  const required = requiredMonths(year, now);
  const customers = new Map<string, { id: string; name: string; country: string; regionCode: string | null; months: Array<number | null>; prev: Array<number | null> }>();
  for (const row of rows) {
    let customer = customers.get(row.id);
    if (!customer) { customer = { id: row.id, name: row.name, country: row.country, regionCode: row.regionCode, months: Array(12).fill(null), prev: Array(12).fill(null) }; customers.set(row.id, customer); }
    if (row.month === null || row.month < 1 || row.month > 12 || row.amountUsd === null) continue;
    if (row.year === year) customer.months[row.month - 1] = (customer.months[row.month - 1] ?? 0) + Number(row.amountUsd);
    else if (row.year === year - 1) customer.prev[row.month - 1] = (customer.prev[row.month - 1] ?? 0) + Number(row.amountUsd);
  }
  const all = [...customers.values()];
  const prevOf = (months: Array<number | null>) => sum(months.slice(0, periodEnd));
  const grandTotal = round(sum(all.flatMap(customer => customer.months)));
  const grandPrev = round(sum(all.flatMap(customer => customer.prev.slice(0, periodEnd))));

  const uzRegions = regionsOf("UZ");
  const regionCodes = new Set(uzRegions.map(region => region.code));
  const regions = uzRegions.map((region): RegionStat => {
    const members = all.filter(customer => customer.country === "UZ" && customer.regionCode === region.code);
    const customerRows = members.map(customer => ({ id: customer.id, name: customer.name, total: round(sum(customer.months)), months: customer.months }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const total = round(sum(customerRows.map(row => row.total)));
    const prevTotal = round(sum(members.map(customer => prevOf(customer.prev))));
    const months = Array.from({ length: 12 }, (_, index) => round(sum(members.map(customer => customer.months[index]))));
    const entered = months.map((_, index) => members.some(customer => customer.months[index] !== null));
    const lastIndex = entered.lastIndexOf(true);
    const top = customerRows[0];
    return {
      code: region.code, name: region.name, customers: members.length, total, share: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      average: members.length ? total / members.length : 0, prevTotal, growth: prevTotal > 0 || total > 0 ? delta(total, prevTotal) : null,
      topCustomer: top && top.total > 0 ? { name: top.name, total: top.total } : null, lastMonth: lastIndex >= 0 ? lastIndex + 1 : null, months,
      missing: required.map(month => ({ month, names: members.filter(customer => customer.months[month - 1] === null).map(customer => customer.name) })).filter(item => item.names.length),
      customerRows,
    };
  }).sort((a, b) => b.total - a.total || b.customers - a.customers || a.name.localeCompare(b.name));

  const outside = all.filter(customer => customer.country !== "UZ" || !customer.regionCode || !regionCodes.has(customer.regionCode));
  return {
    year, periodEnd,
    kpis: {
      activeCustomers: all.length, total: grandTotal, average: all.length ? grandTotal / all.length : 0,
      regionsWithCustomers: regions.filter(region => region.customers > 0).length, regionCount: uzRegions.length,
      prevTotal: grandPrev, growth: grandPrev > 0 || grandTotal > 0 ? delta(grandTotal, grandPrev) : null,
    },
    regions,
    unassigned: { customers: outside.length, total: round(sum(outside.flatMap(customer => customer.months))) },
  };
}
