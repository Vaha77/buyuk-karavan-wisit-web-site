import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/sales-plan/rules.ts");
const { SEED_PEOPLE, SEED_PERIOD } = await import("../lib/sales-plan/seed-data.ts");

test("zones: 100 / 60 / 40 boundaries belong to the higher zone", () => {
  assert.equal(rules.zoneOf(150), "excellent");
  assert.equal(rules.zoneOf(100), "excellent");
  assert.equal(rules.zoneOf(99.99), "good");
  assert.equal(rules.zoneOf(60), "good");
  assert.equal(rules.zoneOf(59.99), "warning");
  assert.equal(rules.zoneOf(40), "warning");
  assert.equal(rules.zoneOf(39.99), "replace");
  assert.equal(rules.zoneOf(0), "replace");
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

function seedBoard() {
  const months = rules.periodMonths(SEED_PERIOD);
  const people = SEED_PEOPLE.map((person, index) => ({ id: String(index), name: person.name, kind: person.kind, branchHead: person.branchHead, note: null }));
  const plans = new Map(SEED_PEOPLE.map((person, index) => [String(index), person.plan]));
  const amounts = new Map(SEED_PEOPLE.map((person, index) => [String(index), new Map(person.months.map((amount, month) => [rules.monthKey(months[month].year, months[month].month), amount]))]));
  return rules.buildPlanBoard(SEED_PERIOD, people, plans, amounts);
}

test("seed data matches the reference totals", () => {
  const board = seedBoard();
  const person = name => board.groups.flatMap(group => group.people).find(item => item.name === name);
  assert.equal(person("Atxamaka").total, 1_153_052);
  assert.equal(person("Atxamaka").percent.toFixed(2), "76.87");
  assert.equal(person("Atxamaka").zone, "good");
  assert.equal(person("Sirojiddin aka").total, 375_110);
  assert.equal(person("Sirojiddin aka").percent.toFixed(2), "150.04");
  assert.equal(person("Sirojiddin aka").zone, "excellent");
  assert.equal(board.total, 2_905_099);
});

test("groups by plan, largest first, people sorted by completion", () => {
  const board = seedBoard();
  assert.deepEqual(board.groups.map(group => group.plan), [1_500_000, 500_000, 250_000]);
  const small = board.groups[2];
  assert.equal(small.people.length, 6);
  assert.equal(small.people[0].name, "Sirojiddin aka");
  assert.ok(small.people.every((item, index, list) => !index || list[index - 1].percent >= item.percent));
  assert.equal(small.above + small.below, small.people.length);
  // Monthly cell: amount against plan ÷ months.
  const atx = board.groups[0].people[0];
  assert.equal(atx.months[0].percent.toFixed(2), ((166_556 / 250_000) * 100).toFixed(2));
  assert.equal(atx.remaining, 1_500_000 - 1_153_052);
  assert.equal(atx.threshold, 900_000);
});

test("missing months stay empty and people without a plan are listed separately", () => {
  const period = { startYear: 2026, startMonth: 3, monthCount: 6 };
  const people = [{ id: "a", name: "A", kind: "EMPLOYEE", branchHead: null, note: null }, { id: "b", name: "B", kind: "EMPLOYEE", branchHead: null, note: null }];
  const board = rules.buildPlanBoard(period, people, new Map([["a", 600]]), new Map([["a", new Map([["2026-03", 100]])]]));
  assert.equal(board.groups[0].people[0].months[1].amount, null);
  assert.equal(board.groups[0].people[0].months[1].zone, null);
  assert.equal(board.groups[0].people[0].months[0].percent, 100);
  assert.deepEqual(board.withoutPlan.map(person => person.id), ["b"]);
});

test("manager summary flags low performers, one-month spikes and over-plan", () => {
  const keys = seedBoard().insights.map(insight => insight.key);
  assert.ok(keys.includes("weakest-group"));
  assert.ok(keys.includes("below-40"));
  assert.ok(keys.includes("one-month")); // Akramboy aka: 147 975 of 196 506 in June
  assert.ok(keys.includes("over-plan"));
  assert.ok(keys.length >= 3 && keys.length <= 5);
});
