import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/dashboard/workshop-rules.ts");

test("12-week window starts on a Tashkent Monday, 11 weeks before the current one", () => {
  // Saturday 10 Oct 2026, 23:30 in Tashkent → current week starts Monday 5 Oct.
  const start = rules.weekWindowStart(new Date("2026-10-10T18:30:00Z"));
  assert.equal(start.toISOString(), "2026-07-19T19:00:00.000Z"); // Monday 20 Jul 00:00 +05:00
  // Sunday 23:30 UTC = Monday 04:30 in Tashkent → a new week has started.
  assert.equal(rules.weekWindowStart(new Date("2026-10-11T23:30:00Z")).toISOString(), "2026-07-26T19:00:00.000Z");
});

test("weekly buckets: 12 weeks, missing weeks are zero, in/out kept apart", () => {
  const start = rules.weekWindowStart(new Date("2026-10-10T08:00:00Z"));
  const weeks = rules.fillWeeks(start, [{ week: "2026-07-20", kind: "in", count: 3 }, { week: "2026-07-20", kind: "out", count: 1 }, { week: "2026-10-05", kind: "out", count: 4 }]);
  assert.equal(weeks.length, 12);
  assert.deepEqual(weeks[0], { week: "2026-07-20", incoming: 3, issued: 1 });
  assert.deepEqual(weeks[1], { week: "2026-07-27", incoming: 0, issued: 0 });
  assert.deepEqual(weeks[11], { week: "2026-10-05", incoming: 0, issued: 4 });
});

test("preparation time reads in minutes, hours or days", () => {
  assert.equal(rules.formatPrepTime(null), "—");
  assert.equal(rules.formatPrepTime(20), "1 daq");
  assert.equal(rules.formatPrepTime(45 * 60), "45 daq");
  assert.equal(rules.formatPrepTime(5.5 * 3600), "5,5 soat");
  assert.equal(rules.formatPrepTime(30 * 3600), "30 soat");
  assert.equal(rules.formatPrepTime(56 * 3600), "2,3 kun");
});

test("attention: past due (Tashkent day) and NEW for over 24 hours; closed orders never", () => {
  const now = new Date("2026-10-10T20:00:00Z"); // 11 Oct 01:00 in Tashkent
  const old = new Date("2026-10-09T19:00:00Z"), fresh = new Date("2026-10-10T10:00:00Z");
  assert.deepEqual(rules.attentionReasons({ status: "NEW", createdAt: old, dueDate: null }, now), ["unaccepted"]);
  assert.deepEqual(rules.attentionReasons({ status: "NEW", createdAt: fresh, dueDate: null }, now), []);
  assert.deepEqual(rules.attentionReasons({ status: "STARTED", createdAt: fresh, dueDate: "2026-10-10" }, now), ["overdue"]);
  assert.deepEqual(rules.attentionReasons({ status: "ACCEPTED", createdAt: fresh, dueDate: "2026-10-11" }, now), []);
  assert.deepEqual(rules.attentionReasons({ status: "NEW", createdAt: old, dueDate: "2026-10-01" }, now), ["overdue", "unaccepted"]);
  for (const status of ["ISSUED", "RECEIVED", "CANCELLED"]) assert.deepEqual(rules.attentionReasons({ status, createdAt: old, dueDate: "2026-10-01" }, now), []);
});

test("change vs previous period is a percent; an empty previous period reads 'yangi'", () => {
  assert.deepEqual(rules.percentChange(10, 8), { text: "+25%", direction: "up" });
  assert.deepEqual(rules.percentChange(9, 10), { text: "−10%", direction: "down" });
  assert.deepEqual(rules.percentChange(10, 10), { text: "0%", direction: "flat" });
  assert.deepEqual(rules.percentChange(10, 0), { text: "yangi", direction: "new" });
  assert.deepEqual(rules.percentChange(0, 0), { text: "0%", direction: "flat" });
});
