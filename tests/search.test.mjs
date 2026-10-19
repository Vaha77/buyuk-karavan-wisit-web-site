import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const { phoneDigits, searchPlan } = await import("../lib/search/plan.ts");
const seller = { id: "user-a", role: "SELLER", salesPersonId: "sp-a" };

test("phone search ignores spaces, dashes and +998", () => {
  for (const input of ["+998 90 123 45 67", "90 123-45-67", "998901234567", "901234567"]) assert.equal(phoneDigits(input), "998901234567", input);
  assert.equal(phoneDigits("123-45"), "12345");
  assert.equal(phoneDigits("Huseyin"), null);
  assert.equal(phoneDigits("12"), null, "too short");
});

test("seller finds only their own customers, leads, orders and offers; no products", () => {
  const plan = searchPlan(seller, "Huseyin", "agent-a");
  assert.deepEqual(plan.customers.AND[0], { ownerId: "sp-a" }, "another seller's customer is never matched");
  assert.deepEqual(plan.leads.AND[0], { assignedAgentId: "agent-a" });
  assert.deepEqual(plan.orders.AND[0], { sellerId: "user-a" });
  assert.deepEqual(plan.offers.AND[0], { sellerId: "user-a" });
  assert.equal(plan.products, null);
  assert.equal(searchPlan(seller, "Huseyin", null).leads, null, "no linked agent → no leads");
  assert.deepEqual(searchPlan({ ...seller, salesPersonId: null }, "x y", null).customers.AND[0], { ownerId: "__no-sales-person__" });
});

test("workshop: orders and goods only; admin: everything except offers (no admin offers page)", () => {
  const workshop = searchPlan({ id: "w", role: "WORKSHOP", salesPersonId: null }, "#12", null);
  assert.deepEqual([!!workshop.customers, !!workshop.leads, !!workshop.orders, !!workshop.products, !!workshop.offers], [false, false, true, true, false]);
  assert.deepEqual(workshop.orders.AND[1].OR[0], { number: 12 });
  const admin = searchPlan({ id: "s", role: "SUPER_ADMIN", salesPersonId: null }, "90 123 45 67", null);
  assert.deepEqual(admin.customers.AND[0], {}, "no owner limit");
  assert.ok(admin.customers.AND[1].OR.some(part => part.phoneNormalized?.contains === "998901234567"));
  assert.ok(admin.leads && admin.orders && admin.products);
});

test("seh order search by monthly number \"11-04\" / \"1104\"", () => {
  const user = { id: "w", role: "WORKSHOP", salesPersonId: null };
  for (const query of ["11-04", "1104"]) assert.deepEqual(searchPlan(user, query, null).orders.AND[1].OR.find(item => item.monthNo), { monthKey: { endsWith: "-11" }, monthNo: 4 }, query);
});
