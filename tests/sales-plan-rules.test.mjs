import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/sales-plan/rules.ts");
const zones = await import("../lib/sales-plan/zones.ts");
const { SEED_PEOPLE, SEED_PERIOD } = await import("../lib/sales-plan/seed-data.ts");

test("six zones: every bound belongs to the higher zone", () => {
  // Ratios as in the spec (0.4 = 40%).
  const cases = [[0, "danger"], [0.399, "danger"], [0.4, "warning"], [0.599, "warning"], [0.6, "fair"], [0.699, "fair"], [0.7, "good"], [0.799, "good"], [0.8, "excellent"], [0.999, "excellent"], [1.0, "record"], [1.5, "record"]];
  for (const [ratio, zone] of cases) assert.equal(zones.zoneOf(Math.round(ratio * 1000) / 10), zone, `${ratio}`);
});

test("zone table: labels, colours and range texts", () => {
  const list = zones.resolveZones();
  assert.deepEqual(list.map(zone => `${zone.range} ${zone.label}`), ["100%+ Rekord", "80–99% Ajoyib", "70–79% Yaxshi", "60–69% Qoniqarli", "40–59% Ogohlantirish", "40% dan past Xavf"]);
  assert.deepEqual(list.map(zone => zone.color), ["#0F6B3A", "#45B36B", "#A8D5A2", "#F2C230", "#F08A3C", "#D2372B"]);
  assert.deepEqual(list.map(zone => zone.text), ["#FFFFFF", "#0B2E18", "#14213D", "#3D2E00", "#3D1C00", "#FFFFFF"]);
  assert.match(zones.zoneStyle("danger").decision, /2 davr ketma-ket/);
});

test("custom thresholds: validation and use", () => {
  assert.equal(zones.validateThresholds(zones.DEFAULT_THRESHOLDS), null);
  assert.ok(zones.validateThresholds({ ...zones.DEFAULT_THRESHOLDS, good: 85 })); // not increasing
  assert.ok(zones.validateThresholds({ ...zones.DEFAULT_THRESHOLDS, record: 201 }));
  assert.ok(zones.validateThresholds({ ...zones.DEFAULT_THRESHOLDS, warning: -1 }));
  assert.ok(zones.validateThresholds({ ...zones.DEFAULT_THRESHOLDS, fair: 60.5 }));
  assert.deepEqual(zones.parseThresholds({ record: 1 }), zones.DEFAULT_THRESHOLDS); // invalid stored value → defaults
  const custom = { record: 120, excellent: 90, good: 75, fair: 50, warning: 30 };
  assert.equal(zones.zoneOf(110, custom), "excellent");
  assert.equal(zones.zoneOf(55, custom), "fair");
  assert.equal(zones.resolveZones(custom)[0].range, "120%+");
});

test("completion and monthly plan", () => {
  assert.equal(rules.completion(750, 1000), 75);
  assert.equal(rules.completion(100, 0), 0);
  assert.equal(rules.monthlyPlan(1_500_000, 6), 250_000);
  assert.equal(rules.monthlyPlan(250_000, 6), 250_000 / 6);
  assert.equal(rules.monthlyPlan(1000, 0), 0);
});

test("period months cross the year boundary", () => {
  assert.deepEqual(rules.periodMonths({ startYear: 2026, startMonth: 11, monthCount: 3 }), [{ year: 2026, month: 11 }, { year: 2026, month: 12 }, { year: 2027, month: 1 }]);
});

const people = SEED_PEOPLE.map((person, index) => ({ id: String(index), name: person.name, kind: person.kind, branchHead: person.branchHead, note: null }));
function seedBoard(options) {
  const months = rules.periodMonths(SEED_PERIOD);
  const plans = new Map(SEED_PEOPLE.map((person, index) => [String(index), person.plan]));
  const amounts = new Map(SEED_PEOPLE.map((person, index) => [String(index), new Map(person.months.map((amount, month) => [rules.monthKey(months[month].year, months[month].month), amount]))]));
  return rules.buildPlanBoard(SEED_PERIOD, people, plans, amounts, options);
}
const find = (board, name) => board.groups.flatMap(group => group.people).find(item => item.name === name);

test("current data lands in the expected zones", () => {
  const board = seedBoard();
  const expected = [
    ["Sirojiddin aka", "150.0", "record"], ["Akramboy aka", "78.6", "good"], ["Atxamaka", "76.9", "good"], ["Abduraxmon", "74.9", "good"],
    ["Bositxon aka", "63.0", "fair"], ["Anasxon aka", "45.0", "warning"], ["Lola filiali", "43.6", "warning"], ["Abror", "43.2", "warning"],
    ["Samarqand filiali", "36.6", "danger"], ["Abdulquddus", "22.5", "danger"],
  ];
  for (const [name, percent, zone] of expected) {
    assert.equal(find(board, name).percent.toFixed(1), percent, name);
    assert.equal(find(board, name).zone, zone, name);
  }
  assert.equal(find(board, "Atxamaka").total, 1_153_052);
  assert.equal(find(board, "Atxamaka").percent.toFixed(2), "76.87");
  assert.equal(board.total, 2_905_099);
  assert.equal(board.percent.toFixed(1), "64.6");
  assert.equal(board.zone, "fair");
  assert.deepEqual(board.byZone.map(zone => [zone.key, zone.people.length]), [["record", 1], ["excellent", 0], ["good", 3], ["fair", 1], ["warning", 3], ["danger", 2]]);
});

test("groups: by plan, largest first; 80%+ / 60–79% / below 60% counts", () => {
  const board = seedBoard();
  assert.deepEqual(board.groups.map(group => group.plan), [1_500_000, 500_000, 250_000]);
  const small = board.groups[2];
  assert.equal(small.people[0].name, "Sirojiddin aka");
  assert.deepEqual([small.high, small.middle, small.low], [1, 2, 3]); // Sirojiddin | Akramboy, Abduraxmon | Anasxon, Abror, Abdulquddus
  const mid = board.groups[1];
  assert.deepEqual([mid.high, mid.middle, mid.low], [0, 1, 2]); // Bositxon | Lola, Samarqand
  // Monthly cell: amount against plan ÷ months.
  const atx = board.groups[0].people[0];
  assert.equal(atx.months[0].percent.toFixed(2), ((166_556 / 250_000) * 100).toFixed(2));
  assert.equal(atx.months[0].zone, "fair"); // 66,6% of the monthly plan
  assert.equal(atx.remaining, 1_500_000 - 1_153_052);
});

test("2 periods in a row below 60% is flagged only with previous data", () => {
  const none = seedBoard();
  assert.ok(none.groups.flatMap(group => group.people).every(person => !person.twoPeriods && person.previousPercent === null));
  assert.ok(!none.insights.some(insight => insight.key === "two-periods"));
  const ids = name => people.find(person => person.name === name).id;
  const previous = new Map([[ids("Abdulquddus"), 30], [ids("Abror"), 55], [ids("Bositxon aka"), 20], [ids("Atxamaka"), 50]]);
  const board = seedBoard({ previous });
  assert.equal(find(board, "Abdulquddus").twoPeriods, true); // danger → danger
  assert.equal(find(board, "Abror").twoPeriods, true); // warning → warning
  assert.equal(find(board, "Bositxon aka").twoPeriods, false); // now 63% (fair)
  assert.equal(find(board, "Atxamaka").twoPeriods, false); // now 76.9%
  assert.equal(find(board, "Samarqand filiali").twoPeriods, false); // no previous data
  const card = board.insights.find(insight => insight.key === "two-periods");
  assert.ok(card && card.text.includes("Abdulquddus") && card.text.includes("Abror") && !card.text.includes("Samarqand"));
});

test("missing months stay empty and people without a plan are listed separately", () => {
  const period = { startYear: 2026, startMonth: 3, monthCount: 6 };
  const two = [{ id: "a", name: "A", kind: "EMPLOYEE", branchHead: null, note: null }, { id: "b", name: "B", kind: "EMPLOYEE", branchHead: null, note: null }];
  const board = rules.buildPlanBoard(period, two, new Map([["a", 600]]), new Map([["a", new Map([["2026-03", 100]])]]));
  assert.equal(board.groups[0].people[0].months[1].amount, null);
  assert.equal(board.groups[0].people[0].months[1].zone, null);
  assert.equal(board.groups[0].people[0].months[0].percent, 100);
  assert.deepEqual(board.withoutPlan.map(person => person.id), ["b"]);
});

test("manager summary rules", () => {
  const board = seedBoard();
  const byKey = Object.fromEntries(board.insights.map(insight => [insight.key, insight.text]));
  assert.match(byKey.record, /Sirojiddin aka.*rejasini oshirishni ko‘rib chiqing/);
  assert.match(byKey["one-month"], /Akramboy aka.*natija bitta katta sotuvga bog‘liq/); // 147 975 of 196 506 in June
  assert.match(byKey["low-months"], /Abdulquddus/);
  assert.match(byKey["plans-too-high"], /faqat 1 tasi 80%\+.*rejalar juda yuqori/); // 1 of 10 is 80%+
  assert.equal(rules.lowMonthStreak([{ amount: 1, percent: 10 }, { amount: null, percent: 0 }, { amount: 1, percent: 10 }, { amount: 1, percent: 59 }, { amount: 1, percent: 30 }], 60), 3);
  assert.equal(rules.lowMonthStreak([{ amount: 1, percent: 10 }, { amount: 1, percent: 70 }, { amount: 1, percent: 10 }], 60), 1);
});
