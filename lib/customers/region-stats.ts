// Regular customer sales by region (UZ, KZ, KG, TJ, TM) for one year. Pure: the page loads the rows in one query and
// builds the stats on the server, so the client only renders. Regions are CUSTOMER_REGIONS in lib/dashboard/regions.
import { countsFor, COUNTRY_NAMES, CUSTOMER_REGIONS } from "../dashboard/regions";
import { delta, requiredMonths } from "../dashboard/rules";

/** One row per (customer, monthly sale) from a LEFT JOIN; year/month/amountUsd are null for a customer without sales. A customer whose sales sit in two regions counts in both. */
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
  /** byCountry: monthly sums of customers without a known region, per their country ("Aniqlanmagan"). */
  unassigned: { customers: number; total: number; byCountry: Array<{ country: string; months: number[] }> };
};

const sum = (values: Array<number | null>) => values.reduce<number>((total, value) => total + (value || 0), 0);
const round = (value: number) => Math.round(value * 100) / 100;

export function buildRegionStats(rows: CustomerSaleRow[], year: number, now: { year: number; month: number }): RegionStats {
  // Same period of the previous year: Jan..current month for the current year, the whole year for past years.
  const periodEnd = year < now.year ? 12 : year === now.year ? now.month : 0;
  const required = requiredMonths(year, now);
  const customers = new Map<string, { id: string; name: string; country: string; regionCode: string | null; months: Array<number | null>; prev: Array<number | null> }>();
  for (const row of rows) {
    // Toshkent shahri is part of the one customer "Toshkent" (UZ-TO).
    const regionCode = row.regionCode === "UZ-TK" ? "UZ-TO" : row.regionCode, key = `${row.id}|${row.country}|${regionCode}`;
    let customer = customers.get(key);
    if (!customer) { customer = { id: row.id, name: row.name, country: row.country, regionCode, months: Array(12).fill(null), prev: Array(12).fill(null) }; customers.set(key, customer); }
    if (row.month === null || row.month < 1 || row.month > 12 || row.amountUsd === null) continue;
    if (row.year === year) customer.months[row.month - 1] = (customer.months[row.month - 1] ?? 0) + Number(row.amountUsd);
    else if (row.year === year - 1) customer.prev[row.month - 1] = (customer.prev[row.month - 1] ?? 0) + Number(row.amountUsd);
  }
  const all = [...customers.values()];
  const people = new Set(all.map(customer => customer.id)).size;
  const prevOf = (months: Array<number | null>) => sum(months.slice(0, periodEnd));
  const grandTotal = round(sum(all.flatMap(customer => customer.months)));
  const grandPrev = round(sum(all.flatMap(customer => customer.prev.slice(0, periodEnd))));

  const regionCodes = new Set(CUSTOMER_REGIONS.map(region => region.code));
  const regions = CUSTOMER_REGIONS.map((region): RegionStat => {
    const members = all.filter(customer => customer.country === region.country && countsFor(customer.regionCode, region.code));
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

  const outside = all.filter(customer => !customer.regionCode || !regionCodes.has(customer.regionCode) || !customer.regionCode.startsWith(`${customer.country}-`));
  return {
    year, periodEnd,
    kpis: {
      activeCustomers: people, total: grandTotal, average: people ? grandTotal / people : 0,
      regionsWithCustomers: regions.filter(region => region.customers > 0).length, regionCount: CUSTOMER_REGIONS.length,
      prevTotal: grandPrev, growth: grandPrev > 0 || grandTotal > 0 ? delta(grandTotal, grandPrev) : null,
    },
    regions,
    unassigned: {
      customers: outside.length, total: round(sum(outside.flatMap(customer => customer.months))),
      byCountry: [...new Set(outside.map(customer => customer.country))].map(country => { const members = outside.filter(customer => customer.country === country); return { country, months: Array.from({ length: 12 }, (_, index) => round(sum(members.map(customer => customer.months[index])))) }; }),
    },
  };
}

export type CountryRow = { code: string; name: string; total: number; months: number[] };
export type CountryStat = CountryRow & { regions: CountryRow[] };
/** "Respublika" view: every country with customers, its regions (Toshkent already one) and "Aniqlanmagan" for sales without a known region, so the regions add up to the country. Ranked by total. */
export function countryStats(stats: RegionStats): CountryStat[] {
  const countries = new Map<string, CountryStat>();
  const add = (country: string, row: CountryRow) => {
    const item: CountryStat = countries.get(country) ?? { code: country, name: COUNTRY_NAMES[country as keyof typeof COUNTRY_NAMES] ?? country, total: 0, months: Array(12).fill(0), regions: [] };
    item.regions.push(row); item.total = round(item.total + row.total); item.months = item.months.map((value, index) => round(value + row.months[index]));
    countries.set(country, item);
  };
  for (const region of stats.regions) if (region.customers) add(region.code.slice(0, 2), { code: region.code, name: region.name, total: region.total, months: region.months });
  for (const item of stats.unassigned.byCountry) add(item.country, { code: `${item.country}-?`, name: "Aniqlanmagan", total: round(sum(item.months)), months: item.months });
  const byTotal = (a: CountryRow, b: CountryRow) => b.total - a.total || a.name.localeCompare(b.name);
  return [...countries.values()].map(country => ({ ...country, regions: country.regions.sort(byTotal) })).sort(byTotal);
}
