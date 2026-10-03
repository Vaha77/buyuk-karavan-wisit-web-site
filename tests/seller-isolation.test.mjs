import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const repo = await import("../lib/customers/seller-repo.ts");
const rules = await import("../lib/customers/seller-rules.ts");
const access = await import("../lib/auth/seller-access.ts");
const approval = await import("../lib/auth/approval-rules.ts");

// ---- In-memory stand-in for the Prisma delegates the repository uses ---------------------------------------------
function matches(row, where, db) {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return condition.every(part => matches(row, part, db));
    if (key === "OR") return condition.some(part => matches(row, part, db));
    if (key === "customer") return matches(db.tables.regularCustomer.find(item => item.id === row.customerId), condition, db);
    const value = row[key];
    if (condition !== null && typeof condition === "object" && !(condition instanceof Date)) {
      if ("contains" in condition) return typeof value === "string" && (condition.mode === "insensitive" ? value.toLowerCase().includes(condition.contains.toLowerCase()) : value.includes(condition.contains));
      if ("in" in condition) return condition.in.includes(value);
      throw new Error(`unsupported condition ${JSON.stringify(condition)}`);
    }
    return value === condition;
  });
}
function fakeDb() {
  const db = { tables: { regularCustomer: [], customerContact: [], customerPurchase: [], regularCustomerMonthlySale: [] } };
  let seq = 0;
  for (const name of Object.keys(db.tables)) {
    const rows = db.tables[name];
    db[name] = {
      findMany: async ({ where } = {}) => rows.filter(row => matches(row, where, db)).map(row => ({ ...row })),
      findFirst: async ({ where } = {}) => { const row = rows.find(item => matches(item, where, db)); return row ? { ...row } : null; },
      create: async ({ data }) => { const row = { id: `${name}-${++seq}`, createdAt: new Date("2026-01-01T00:00:00Z"), isActive: true, lastPurchaseAt: null, nextContactAt: null, callIntervalDays: 60, ...data }; rows.push(row); return { ...row }; },
      update: async ({ where, data }) => { const row = rows.find(item => item.id === where.id); if (!row) throw new Error("not found"); Object.assign(row, data); return { ...row }; },
    };
  }
  return db;
}

const sellerA = { role: "SELLER", salesPersonId: "sp-a" };
const sellerB = { role: "SELLER", salesPersonId: "sp-b" };
const admin = { role: "ADMIN", salesPersonId: null };
const input = (name, phone) => ({ name, phone, country: "UZ", regionCode: "UZ-SA", note: null, callIntervalDays: 60 });

async function setup() {
  const db = fakeDb();
  const a = await repo.addSellerCustomer(db, sellerA, input("A mijozi", "+998 90 111 22 33"));
  const b = await repo.addSellerCustomer(db, sellerB, input("B mijozi", "90 444 55 66"));
  db.tables.regularCustomer.push({ id: "legacy", name: "Davron", phone: "+998901234567", phoneNormalized: "+998901234567", ownerId: null, isActive: true, callIntervalDays: 60, lastPurchaseAt: null, nextContactAt: null, createdAt: new Date("2026-01-01T00:00:00Z"), country: "UZ", regionCode: null, note: null });
  db.tables.regularCustomerMonthlySale.push({ id: "s1", customerId: a.id, year: 2026, month: 3, amountUsd: 1000 }, { id: "s2", customerId: b.id, year: 2026, month: 3, amountUsd: 7000 });
  return { db, a: a.id, b: b.id };
}

test("a seller's list, search and detail only contain their own customers", async () => {
  const { db, a, b } = await setup();
  assert.deepEqual((await repo.listCustomers(db, sellerA)).map(row => row.id), [a]);
  assert.deepEqual((await repo.listCustomers(db, sellerB)).map(row => row.id), [b]);
  assert.deepEqual(await repo.listCustomers(db, sellerA, { search: "B mijozi" }), []);
  assert.deepEqual(await repo.listCustomers(db, sellerA, { search: "444" }), []); // B's phone digits
  assert.deepEqual(await repo.listCustomers(db, sellerA, { search: "Davron" }), []); // unassigned → admins only
  assert.equal(await repo.getCustomer(db, sellerA, b), null); // B's id typed into the URL → 404
  assert.equal(await repo.getCustomer(db, sellerA, "legacy"), null);
  assert.equal((await repo.getCustomer(db, sellerA, a)).id, a);
  assert.equal((await repo.listCustomers(db, admin)).length, 3);
});

test("a seller cannot write to another seller's customer", async () => {
  const { db, b } = await setup();
  await assert.rejects(repo.customerHistory(db, sellerA, b), repo.CustomerNotFound);
  await assert.rejects(repo.recordContact(db, sellerA, b, { result: "CALLED", note: null, nextContactAt: null }), repo.CustomerNotFound);
  await assert.rejects(repo.createPurchase(db, sellerA, "user-a", b, { date: new Date(), amount: 100, currency: "USD", note: null }, 12_800), repo.CustomerNotFound);
  await assert.rejects(repo.updateSellerCustomer(db, sellerA, b, { name: "X", country: "UZ", regionCode: null, note: null, callIntervalDays: 30 }), repo.CustomerNotFound);
  assert.equal(db.tables.customerContact.length, 0);
  assert.equal(db.tables.customerPurchase.length, 0);
  assert.equal(db.tables.regularCustomer.find(row => row.id === b).name, "B mijozi");
});

test("statistics and reminders are per seller; no totals of other sellers leak", async () => {
  const { db } = await setup();
  const today = new Date("2026-10-03T06:00:00Z");
  assert.deepEqual(await repo.sellerStats(db, sellerA, 2026, today), { customers: 1, approvedUsd: 1000, pendingCount: 0, pendingUsd: 0, due: 1 });
  assert.equal((await repo.sellerStats(db, sellerB, 2026, today)).approvedUsd, 7000);
  assert.deepEqual((await repo.dueCustomers(db, sellerA, today)).map(row => row.name), ["A mijozi"]);
  assert.equal((await repo.sellerPurchases(db, sellerA)).length, 0);
});

test("a seller without a SalesPerson link sees nothing", async () => {
  const { db } = await setup();
  const unlinked = { role: "SELLER", salesPersonId: null };
  assert.deepEqual(await repo.listCustomers(db, unlinked), []);
  assert.equal((await repo.sellerStats(db, unlinked, 2026)).customers, 0);
  assert.equal((await repo.addSellerCustomer(db, unlinked, input("X", "+998935550000"))).ok, false);
});

test("duplicate phone: not saved, owner not revealed to the seller", async () => {
  const { db } = await setup();
  const before = db.tables.regularCustomer.length;
  const taken = await repo.addSellerCustomer(db, sellerA, input("Nusxa", "+998 (90) 444-55-66")); // B's number, other format
  assert.equal(taken.ok, false);
  assert.equal(taken.reason, "taken");
  assert.equal(taken.message, "Bu raqam boshqa sotuvchiga biriktirilgan. Admin bilan bog‘laning.");
  assert.ok(!taken.message.includes("B mijozi") && !taken.message.includes("sp-b"));
  assert.equal(taken.existing.ownerId, "sp-b"); // for the admin Telegram message / audit only
  const legacy = await repo.addSellerCustomer(db, sellerA, input("Nusxa", "901234567")); // unassigned customer's number
  assert.equal(legacy.reason, "taken");
  const own = await repo.addSellerCustomer(db, sellerA, input("Nusxa", "+998901112233"));
  assert.equal(own.reason, "own-duplicate");
  assert.equal(db.tables.regularCustomer.length, before);
});

test("PENDING purchases stay out of statistics until approved", async () => {
  const { db, a } = await setup();
  const purchase = await repo.createPurchase(db, sellerA, "user-a", a, { date: new Date("2026-10-02"), amount: 12_800_000, currency: "UZS", note: null }, 12_800);
  assert.equal(purchase.amountUsd, 1000);
  assert.equal(db.tables.customerPurchase[0].status, "PENDING");
  const stats = await repo.sellerStats(db, sellerA, 2026);
  assert.equal(stats.approvedUsd, 1000); // unchanged: only the March monthly sale
  assert.equal(stats.pendingCount, 1);
  assert.equal(stats.pendingUsd, 1000);
  // Approval adds it to the month's sale (what every ranking, map and total reads).
  const merged = rules.mergeMonthlySale(null, { amount: 12_800_000, currency: "UZS", amountUsd: 1000 });
  db.tables.regularCustomerMonthlySale.push({ id: "s3", customerId: a, year: 2026, month: 10, ...merged });
  assert.equal((await repo.sellerStats(db, sellerA, 2026)).approvedUsd, 2000);
});

test("approval: SELLER must get a free SalesPerson, SUPER_ADMIN is never granted", () => {
  assert.equal(approval.DEFAULT_APPROVAL_ROLE, "SELLER");
  assert.ok(!approval.APPROVAL_ROLES.includes("SUPER_ADMIN"));
  assert.deepEqual(approval.checkApproval("SUPER_ADMIN", "", null, "u1"), { error: "Bu rolni tasdiqlashda berib bo‘lmaydi." });
  assert.deepEqual(approval.checkApproval("SELLER", "", null, "u1"), { error: "Sotuvchini tanlang." });
  assert.deepEqual(approval.checkApproval("SELLER", "sp-x", null, "u1"), { error: "Tanlangan sotuvchi topilmadi." });
  assert.deepEqual(approval.checkApproval("SELLER", "sp-a", { id: "sp-a", userId: "someone-else" }, "u1"), { error: approval.SELLER_TAKEN });
  assert.deepEqual(approval.checkApproval("MANAGER", "sp-a", { id: "sp-a", userId: null }, "u1"), { role: "MANAGER", salesPersonId: null });
  assert.deepEqual(approval.checkApproval("SELLER", "sp-a", { id: "sp-a", userId: null }, "u1"), { role: "SELLER", salesPersonId: "sp-a" });
});

test("a user approved as SELLER only sees their own SalesPerson's customers", async () => {
  const { db, a } = await setup();
  const approved = approval.checkApproval("SELLER", "sp-a", { id: "sp-a", userId: null }, "new-user");
  const viewer = { role: approved.role, salesPersonId: approved.salesPersonId };
  assert.deepEqual((await repo.listCustomers(db, viewer)).map(row => row.id), [a]);
  assert.equal((await repo.sellerStats(db, viewer, 2026, new Date("2026-10-03T06:00:00Z"))).approvedUsd, 1000);
  assert.ok(!access.isSellerPathAllowed("/admin/customers"));
});

test("seller routes: only /admin/my is reachable", () => {
  for (const path of ["/admin/my", "/admin/my/today", "/admin/my/purchase", "/admin/my/customers/abc"]) assert.ok(access.isSellerPathAllowed(path), path);
  for (const path of ["/admin", "/admin/customers", "/admin/customers/purchases", "/admin/sales-plan", "/admin/users", "/admin/mystery", "/admin/my-other"]) assert.ok(!access.isSellerPathAllowed(path), path);
  assert.equal(access.homeFor("SELLER"), "/admin/my");
  assert.equal(access.homeFor("ADMIN"), "/admin");
});

test("every seller page and action is guarded, and staff guards reject SELLER", async () => {
  const guard = await readFile(new URL("../lib/auth/require-admin.ts", import.meta.url), "utf8");
  assert.match(guard, /if \(user\.role === "SELLER"\) forbidden\(\)/);
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /role === "SELLER" && !isSellerPathAllowed/);
  const actions = await readFile(new URL("../app/admin/(seller)/my/actions.ts", import.meta.url), "utf8");
  const exported = [...actions.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\s*\n?\s*const [^=]+= await (\w+)\(/g)];
  const all = [...actions.matchAll(/export async function (\w+)/g)].map(match => match[1]);
  assert.ok(all.length >= 4);
  assert.deepEqual(exported.map(match => match[1]).sort(), all.sort(), "every action starts with a guard");
  assert.ok(exported.every(match => match[2] === "requireSeller"), "seller actions use requireSeller");
});

test("reminder rules", () => {
  const base = { callIntervalDays: 30, lastPurchaseAt: new Date("2026-09-01T05:00:00Z"), nextContactAt: null, createdAt: new Date("2026-01-01") };
  const today = new Date("2026-10-01T04:00:00Z");
  assert.equal(rules.daysWithoutPurchase(base, today), 30);
  assert.equal(rules.isDue(base, today), true);
  assert.equal(rules.dueTone(base, today), "red");
  assert.equal(rules.isDue({ ...base, lastPurchaseAt: new Date("2026-09-15") }, today), false);
  assert.equal(rules.isDue({ ...base, nextContactAt: new Date("2026-10-05") }, today), false); // postponed
  const agreed = { ...base, lastPurchaseAt: new Date("2026-09-25"), nextContactAt: new Date("2026-09-30T10:00:00Z") };
  assert.equal(rules.isDue(agreed, today), true);
  assert.equal(rules.dueTone(agreed, today), "yellow");
  assert.equal(rules.dayNumber(rules.defaultNextContact("NO_ANSWER", today, 60)) - rules.dayNumber(today), 1);
  assert.equal(rules.dayNumber(rules.defaultNextContact("CALLED", today, 60)) - rules.dayNumber(today), 60);
  assert.deepEqual(rules.mergeMonthlySale({ amount: 500, currency: "USD", amountUsd: 500 }, { amount: 250, currency: "USD", amountUsd: 250 }), { amount: 750, currency: "USD", amountUsd: 750 });
  assert.deepEqual(rules.mergeMonthlySale({ amount: 500, currency: "USD", amountUsd: 500 }, { amount: 1_280_000, currency: "UZS", amountUsd: 100 }), { amount: 600, currency: "USD", amountUsd: 600 });
  assert.equal(rules.purchaseUsd(1_280_000, "UZS", null), null);
});
