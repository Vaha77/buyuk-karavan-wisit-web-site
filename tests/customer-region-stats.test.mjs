import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const { buildRegionStats, countryStats } = await import("../lib/customers/region-stats.ts");

const now = { year: 2026, month: 3 }; // March 2026: January and February must be entered
const sale = (id, name, regionCode, year, month, amountUsd, country = "UZ") => ({ id, name, country, regionCode, year, month, amountUsd });
const rows = [
  sale("a", "Alfa", "UZ-SA", 2026, 1, 1000), sale("a", "Alfa", "UZ-SA", 2026, 2, 1500),
  sale("a", "Alfa", "UZ-SA", 2025, 1, 800), sale("a", "Alfa", "UZ-SA", 2025, 2, 700), sale("a", "Alfa", "UZ-SA", 2025, 9, 9999), // September is outside the YTD window
  sale("b", "Beta", "UZ-SA", 2026, 1, 500),
  sale("c", "Gamma", "UZ-TO", 2026, 1, 4000), sale("c", "Gamma", "UZ-TO", 2026, 2, 1000),
  sale("d", "Delta", "UZ-NG", null, null, null), // customer without any sale
  sale("e", "Epsilon", null, 2026, 1, 300), // no region
  sale("f", "Foxtrot", "KZ-AST", 2026, 2, 200, "KZ"), // foreign
];

test("region totals, shares, averages and ranking", () => {
  const stats = buildRegionStats(rows, 2026, now);
  assert.equal(stats.regions.length, 53); // UZ 13 (one Toshkent) + KZ 20 + KG 9 + TJ 5 + TM 6
  assert.deepEqual(stats.regions.slice(0, 4).map(region => region.code), ["UZ-TO", "UZ-SA", "KZ-AST", "UZ-NG"]);
  const sa = stats.regions.find(region => region.code === "UZ-SA");
  assert.equal(sa.customers, 2);
  assert.equal(sa.total, 3000);
  assert.equal(sa.average, 1500);
  assert.equal(Math.round(sa.share * 10) / 10, Math.round((3000 / 8500) * 1000) / 10);
  assert.deepEqual(sa.topCustomer, { name: "Alfa", total: 2500 });
  assert.equal(sa.lastMonth, 2);
  assert.deepEqual(sa.months.slice(0, 3), [1500, 1500, 0]);
  assert.deepEqual(sa.customerRows.map(customer => customer.id), ["a", "b"]);
});

test("growth compares with the same months of the previous year", () => {
  const stats = buildRegionStats(rows, 2026, now);
  const sa = stats.regions.find(region => region.code === "UZ-SA");
  assert.equal(sa.prevTotal, 1500); // Jan + Feb + Mar 2025, not September
  assert.equal(sa.growth.direction, "up");
  assert.equal(sa.growth.value, 100);
  const tk = stats.regions.find(region => region.code === "UZ-TO");
  assert.equal(tk.growth.relative, false); // no sales last year
  assert.equal(stats.regions.find(region => region.code === "UZ-AN").growth, null);
});

test("missing months list the customers that have not been entered", () => {
  const sa = buildRegionStats(rows, 2026, now).regions.find(region => region.code === "UZ-SA");
  assert.deepEqual(sa.missing, [{ month: 2, names: ["Beta"] }]);
  const ng = buildRegionStats(rows, 2026, now).regions.find(region => region.code === "UZ-NG");
  assert.equal(ng.customers, 1);
  assert.equal(ng.total, 0);
  assert.deepEqual(ng.missing.map(item => item.month), [1, 2]);
});

test("KPIs count every active customer; customers without a region stay off the map", () => {
  const { kpis, unassigned } = buildRegionStats(rows, 2026, now);
  assert.equal(kpis.activeCustomers, 6);
  assert.equal(kpis.total, 8500);
  assert.equal(Math.round(kpis.average), Math.round(8500 / 6));
  assert.equal(kpis.regionsWithCustomers, 4);
  assert.equal(kpis.regionCount, 53);
  assert.equal(kpis.prevTotal, 1500);
  assert.deepEqual(unassigned, { customers: 1, total: 300, byCountry: [{ country: "UZ", months: [300, ...Array(11).fill(0)] }] });
  assert.equal(buildRegionStats(rows, 2026, now).regions.find(region => region.code === "KZ-AST").total, 200);
});

test("sales follow the purchase location; new regions also count for their parent", () => {
  const moved = [sale("m", "Mover", "UZ-SA", 2026, 1, 600), sale("m", "Mover", "UZ-TO", 2026, 2, 400), sale("k", "Kappa", "KZ-ABA", 2026, 1, 900, "KZ")];
  const stats = buildRegionStats(moved, 2026, now);
  const at = code => stats.regions.find(region => region.code === code);
  assert.deepEqual([at("UZ-SA").total, at("UZ-TO").total], [600, 400]);
  assert.equal(stats.kpis.activeCustomers, 2); // Mover is one customer even in two regions
  assert.deepEqual([at("KZ-ABA").total, at("KZ-VOS").total, at("KZ-VOS").customers], [900, 900, 1]);
});

test("past years use all 12 months and an empty input gives zeroed regions", () => {
  const past = buildRegionStats(rows, 2025, now);
  assert.equal(past.periodEnd, 12);
  assert.equal(past.regions.find(region => region.code === "UZ-SA").total, 11499);
  const empty = buildRegionStats([], 2026, now);
  assert.equal(empty.kpis.activeCustomers, 0);
  assert.equal(empty.kpis.growth, null);
  assert.ok(empty.regions.every(region => region.total === 0 && region.customers === 0 && region.share === 0));
});

test("respublika view: regions (with Aniqlanmagan) add up to the country; Toshkent shahar + viloyat is one row", () => {
  const extra = [...rows, sale("g", "Golf", "UZ-TK", 2026, 2, 700), sale("h", "Hotel", null, 2026, 2, 50, "KZ")];
  const stats = buildRegionStats(extra, 2026, now), countries = countryStats(stats);
  assert.deepEqual(countries.map(country => country.code), ["UZ", "KZ"], "only countries with customers, ranked by total");
  for (const country of countries) {
    assert.equal(country.total, country.regions.reduce((sum, region) => sum + region.total, 0), `${country.code}: regions = country total`);
    country.months.forEach((value, index) => assert.equal(value, country.regions.reduce((sum, region) => sum + region.months[index], 0)));
  }
  const uz = countries[0];
  assert.equal(uz.total, 9000, "all UZ sales incl. the one without a region");
  assert.deepEqual(uz.regions.filter(region => region.name === "Toshkent").map(region => region.total), [5700], "city + region in one Toshkent");
  assert.ok(!uz.regions.some(region => region.code === "UZ-TK"));
  assert.deepEqual(uz.regions.find(region => region.name === "Aniqlanmagan"), { code: "UZ-?", name: "Aniqlanmagan", total: 300, months: [300, ...Array(11).fill(0)] });
  assert.deepEqual(countries[1].regions.map(region => [region.code, region.total]), [["KZ-AST", 200], ["KZ-?", 50]]);
});

test("respublika view follows the chosen year", () => {
  const past = countryStats(buildRegionStats(rows, 2025, now));
  assert.equal(past.find(country => country.code === "UZ").total, 11499, "2025 sales only (1500 + 9999)");
  assert.equal(countryStats(buildRegionStats(rows, 2026, now)).find(country => country.code === "UZ").total, 8300);
});
