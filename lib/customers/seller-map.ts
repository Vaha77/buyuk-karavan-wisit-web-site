// "Mening hududlarim" on the seller dashboard: per Uzbekistan region status of the seller's OWN customers.
// Pure (no DB), tested. The input is already scoped on the server (ownerId = the seller's SalesPerson).
import { regionsOf } from "../dashboard/regions";

export type RegionStatus = "strongest" | "strong" | "medium" | "low" | "stale" | "empty";
/** Map colours and legend labels, in legend order. "empty" is drawn with a hatch pattern (see the map component). */
export const REGION_STATUS: Record<RegionStatus, { label: string; color: string; text: "dark" | "light" }> = {
  strongest: { label: "Eng kuchli", color: "#0F6B3A", text: "light" },
  strong: { label: "Kuchli", color: "#45B36B", text: "dark" },
  medium: { label: "O‘rta", color: "#A8D5A2", text: "dark" },
  low: { label: "Kam", color: "#F2C230", text: "dark" },
  stale: { label: "90+ kun xarid yo‘q", color: "#D2372B", text: "light" },
  empty: { label: "Imkoniyat", color: "#DCE8F8", text: "dark" },
};
export const STATUS_ORDER: RegionStatus[] = ["strongest", "strong", "medium", "low", "stale", "empty"];
export const STALE_DAYS = 90;
export const WARN_DAYS = 60;

/** Days-since-purchase badge: 60+ yellow, 90+ red. */
export function daysTone(days: number): "red" | "yellow" | null {
  return days >= STALE_DAYS ? "red" : days >= WARN_DAYS ? "yellow" : null;
}

export type RegionInput = { code: string; customers: number; total: number; stale: number };

/**
 * No customers → "empty" (Imkoniyat); every customer 90+ days without a purchase → "stale";
 * the rest are split into quarters by this year's approved total (highest quarter = "strongest").
 * Equal totals get the same status.
 */
export function regionStatuses(regions: RegionInput[]): Record<string, RegionStatus> {
  const result: Record<string, RegionStatus> = {};
  const ranked: RegionInput[] = [];
  for (const region of regions) {
    if (region.customers <= 0) result[region.code] = "empty";
    else if (region.stale >= region.customers) result[region.code] = "stale";
    else ranked.push(region);
  }
  ranked.sort((a, b) => b.total - a.total);
  const quarters: RegionStatus[] = ["strongest", "strong", "medium", "low"];
  ranked.forEach(region => {
    const position = ranked.findIndex(item => item.total === region.total);
    result[region.code] = quarters[Math.min(3, Math.floor((position / ranked.length) * 4))];
  });
  return result;
}

export type MapCustomer = { id: string; name: string; country: string; regionCode: string | null; days: number; due: boolean; total: number };
export type SellerRegion = {
  code: string; name: string; customers: number; total: number; due: number; stale: number; status: RegionStatus;
  list: Array<{ id: string; name: string; days: number; total: number }>;
};
export type SellerMap = {
  regions: SellerRegion[]; opened: number; regionCount: number; unplaced: number;
  strongest: { code: string; name: string; customers: number; total: number } | null;
  attention: { code: string; name: string; stale: number } | null;
};

/** Region rows for the 14 regions of Uzbekistan, plus the two summary cards. */
export function buildSellerMap(customers: MapCustomer[]): SellerMap {
  const regions = regionsOf("UZ").map(region => {
    const own = customers.filter(customer => customer.regionCode === region.code);
    return {
      code: region.code, name: region.name, customers: own.length,
      total: Math.round(own.reduce((sum, customer) => sum + customer.total, 0) * 100) / 100,
      due: own.filter(customer => customer.due).length, stale: own.filter(customer => customer.days >= STALE_DAYS).length,
      list: own.map(({ id, name, days, total }) => ({ id, name, days, total })).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name)),
    };
  });
  const statuses = regionStatuses(regions);
  const rows: SellerRegion[] = regions.map(region => ({ ...region, status: statuses[region.code] }));
  const best = rows.filter(row => row.customers > 0 && row.total > 0).sort((a, b) => b.total - a.total)[0];
  const worst = rows.filter(row => row.stale > 0).sort((a, b) => b.stale - a.stale || b.stale / b.customers - a.stale / a.customers)[0];
  return {
    regions: rows, regionCount: rows.length, opened: rows.filter(row => row.customers > 0).length,
    unplaced: customers.filter(customer => !rows.some(row => row.code === customer.regionCode)).length,
    strongest: best ? { code: best.code, name: best.name, customers: best.customers, total: best.total } : null,
    attention: worst ? { code: worst.code, name: worst.name, stale: worst.stale } : null,
  };
}
