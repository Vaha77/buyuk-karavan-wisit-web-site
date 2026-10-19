import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const period = await import("../lib/customers/region-period.ts");
const { nice } = await import("../lib/dashboard/rules.ts");
const ok = result => { assert.equal(result.ok, true, result.error); return result.period; };

test("Bu oy follows the Tashkent calendar: 31 Oct 23:59 is October, 1 Nov 00:00 is November", () => {
  assert.equal(period.tashkentDay(new Date("2026-10-31T18:59:00Z")), "2026-10-31");
  assert.equal(period.tashkentDay(new Date("2026-10-31T19:00:00Z")), "2026-11-01");
  const october = ok(period.resolvePeriod({}, new Date("2026-10-31T18:59:00Z")));
  assert.deepEqual([october.mode, october.from, october.to, october.grain, october.label], ["month", "2026-10-01", "2026-10-31", "day", "Oktabr 2026"]);
  const november = ok(period.resolvePeriod({ period: "month" }, new Date("2026-10-31T19:00:00Z")));
  assert.deepEqual([november.from, november.to], ["2026-11-01", "2026-11-30"]);
  // Days after today stay empty.
  const points = period.periodPoints(october, new Map([["2026-10-05", 100]]), [], new Date("2026-10-19T08:00:00Z"));
  assert.equal(points.length, 31);
  assert.deepEqual([points[4].value, points[18].value, points[19].value, points[30].value], [100, 0, null, null]);
});

test("granularity: ≤ 62 days daily, ≤ 3 years monthly, longer yearly", () => {
  assert.equal(period.grainFor("2026-01-01", "2026-03-04"), "day"); // 62 days
  assert.equal(period.grainFor("2026-01-01", "2026-03-05"), "month"); // 63 days
  assert.equal(period.grainFor("2017-01-01", "2020-01-01"), "month"); // exactly 3 years
  assert.equal(period.grainFor("2017-01-01", "2020-01-02"), "year");
  const range = ok(period.resolvePeriod({ period: "range", from: "2017-01-01", to: "2019-01-01" }));
  assert.deepEqual([range.grain, range.label], ["month", "01.01.2017 – 01.01.2019"]);
  const months = period.periodPoints(range, new Map());
  assert.deepEqual([months.length, months[0].label, months[12].label, months[24].full], [25, "Yan 17", "Yan 18", "Yanvar 2019"]);
});

test("a wrong range is refused (the chart keeps its data)", () => {
  assert.deepEqual(period.resolvePeriod({ period: "range", from: "2026-05-01", to: "2026-04-30" }), { ok: false, error: "“dan” sanasi “gacha” sanasidan keyin bo‘lmasin." });
  assert.equal(period.resolvePeriod({ period: "range", from: "2026-13-01", to: "2026-04-30" }).ok, false);
  assert.equal(period.resolvePeriod({ period: "range", from: "", to: "2026-04-30" }).ok, false);
});

test("range total = the sum of its days; monthly entries add up per bucket", () => {
  const range = ok(period.resolvePeriod({ period: "range", from: "2026-09-25", to: "2026-10-05" }));
  const days = new Map([["2026-09-25", 100], ["2026-09-30", 50.5], ["2026-10-05", 20], ["2026-10-06", 999]]);
  const points = period.periodPoints(range, days, [], new Date("2026-10-19T08:00:00Z"));
  assert.equal(points.length, 11);
  assert.equal(points.reduce((sum, point) => sum + (point.value ?? 0), 0), 170.5, "days outside the range do not count");
  const entry = (id, year, month, amountUsd) => ({ id, name: id, since: "2025-01", year, month, amountUsd });
  const sums = period.sumBuckets([entry("a", 2026, 1, 100), entry("b", 2026, 1, 50), entry("a", 2025, 12, 10), entry("c", null, null, null)], "month");
  assert.deepEqual([...sums], [["2026-01", 150], ["2025-12", 10]]);
  assert.deepEqual([...period.sumBuckets([entry("a", 2026, 1, 100), entry("a", 2026, 5, 1)], "year")], [["2026", 101]]);
});

test("Kiritilmagan oylar: only completed months inside the period, since the customer was added; never in Bu oy", () => {
  const now = new Date("2026-10-19T08:00:00Z");
  const rows = [
    { id: "h", name: "Huseyin", since: "2026-01", year: 2026, month: 3, amountUsd: 10 },
    { id: "h", name: "Huseyin", since: "2026-01", year: 2026, month: 4, amountUsd: 10 },
    { id: "n", name: "Nodir", since: "2026-08", year: null, month: null, amountUsd: null },
  ];
  const range = ok(period.resolvePeriod({ period: "range", from: "2026-01-01", to: "2026-12-31" }, now));
  const missing = period.missingInPeriod(rows, range, now);
  assert.deepEqual(missing.map(item => [item.key, item.names.join(",")]), [
    ["2026-01", "Huseyin"], ["2026-02", "Huseyin"], ["2026-05", "Huseyin"], ["2026-06", "Huseyin"], ["2026-07", "Huseyin"], ["2026-08", "Huseyin,Nodir"], ["2026-09", "Huseyin,Nodir"],
  ], "October (current) and later are not required yet; Nodir only from August");
  assert.equal(missing[0].label, "Yanvar 2026");
  const spring = ok(period.resolvePeriod({ period: "range", from: "2026-03-01", to: "2026-06-30" }, now));
  assert.deepEqual(period.missingInPeriod(rows, spring, now).map(item => item.key), ["2026-05", "2026-06"], "only months inside the period");
  assert.deepEqual(period.missingInPeriod(rows, ok(period.resolvePeriod({}, now)), now), []);
  const points = period.periodPoints(spring, new Map(), ["2026-05", "2026-06"], now);
  assert.deepEqual(points.map(point => point.missing), [false, false, true, true]);
});

test("Hammasi starts at the first sale month; Toshkent includes Toshkent shahri", () => {
  const all = ok(period.resolvePeriod({ period: "all" }, new Date("2026-10-19T08:00:00Z"), "2025-11"));
  assert.deepEqual([all.from, all.to, all.grain], ["2025-11-01", "2026-10-31", "month"]);
  assert.equal(period.periodPoints(all, new Map())[2].label, "Yan 26", "the year shows once it changes");
  assert.deepEqual(period.regionCodesFor("UZ-TO"), ["UZ-TO", "UZ-TK"]);
  assert.ok(period.regionCodesFor("KZ-VOS").includes("KZ-ABA"), "regions inside another polygon count for it");
});

test("axis maximum: 1/2/2.5/5 × 10ⁿ in four steps, close to the data", () => {
  assert.equal(nice(162_100), 200_000);
  assert.equal(nice(40_000), 40_000);
  assert.equal(nice(5_530), 8_000);
  assert.equal(nice(23), 40);
  assert.equal(nice(1), 4);
  assert.equal(nice(0), 4);
});
