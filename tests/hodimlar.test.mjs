import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/employees/rules.ts");
const kassa = await import("../lib/kassa/rules.ts");
const core = await import("../lib/kassa/bot-core.ts");
const access = await import("../lib/auth/seller-access.ts");
const source = async file => (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const at = (local, type, amount) => ({ type, amount, occurredAt: new Date(`${local}+05:00`) });

/** The two debt tables in memory: the real sync functions run against it. */
function fakeTx() {
  const rows = [], logs = [];
  const tx = {
    employeeDebtEntry: {
      findUnique: async ({ where }) => rows.find(row => row.kassaEntryId === where.kassaEntryId) ?? null,
      create: async ({ data }) => { if (rows.some(row => data.kassaEntryId && row.kassaEntryId === data.kassaEntryId)) throw new Error("unique"); const row = { id: `r${rows.length + 1}`, deletedAt: null, deleteReason: null, ...data }; rows.push(row); return row; },
      update: async ({ where, data }) => Object.assign(rows.find(row => row.id === where.id), data),
    },
    employeeDebtLog: { create: async ({ data }) => { logs.push(data); return data; } },
  };
  const debt = employeeId => rules.debtOf(rows.filter(row => !row.deletedAt && row.employeeId === employeeId).map(row => ({ type: row.type, amount: row.amountUsd })));
  return { tx, rows, logs, debt };
}
const entry = patch => ({ id: "k1", type: "IN", amount: 500, currency: "USD", note: "Atham akadan", occurredAt: new Date("2026-10-30T09:00:00Z"), employeeId: "atham", ...patch });

test("debt = OPENING + DEBT − PAYMENT; a deleted row is left out and comes back restored; a minus stays", () => {
  const rows = [at("2026-10-01T10:00", "OPENING", 300), at("2026-10-02T10:00", "DEBT", 200), at("2026-10-03T10:00", "PAYMENT", 100)];
  assert.equal(rules.debtOf(rows), 400);
  assert.equal(rules.debtOf(rows.slice(0, 2)), 500, "payment deleted");
  assert.equal(rules.debtOf([...rows, at("2026-10-04T10:00", "PAYMENT", 1000)]), -600);
  assert.deepEqual(rules.withBalance(rows).map(row => row.balance), [400, 500, 300], "newest first, running in date order");
});

test("Bugun to‘ladi follows the Tashkent day: 23:59 and 00:00 are different days", () => {
  const rows = [at("2026-10-29T23:59", "PAYMENT", 10), at("2026-10-30T00:00", "PAYMENT", 5), at("2026-10-30T12:00", "PAYMENT", 7), at("2026-10-30T12:00", "DEBT", 99)];
  assert.deepEqual(rules.paidToday(rows, new Date("2026-10-30T00:00:00+05:00")), { sum: 12, count: 2 });
  assert.deepEqual(rules.paidToday(rows, new Date("2026-10-29T23:59:00+05:00")), { sum: 10, count: 1 });
});

test("validation: amount ≤ 0 and a nameless hodim are refused; an empty note takes the type's name", () => {
  const base = { type: "DEBT", amount: "1 200", note: "", occurredAt: "2026-10-30T10:00" };
  assert.equal(rules.parseDebtEntry(base).data.amountUsd, 1200);
  assert.equal(rules.parseDebtEntry(base).data.note, "Qarz yozildi");
  for (const amount of ["0", "-5", "abc", "1.234"]) assert.equal(rules.parseDebtEntry({ ...base, amount }).ok, false, amount);
  assert.equal(rules.parseEmployee({ name: "  " }).ok, false);
  assert.equal(rules.parseEmployee({ name: "Sardor", opening: "300" }).opening, 300);
  assert.equal(rules.parseEmployee({ name: "Sardor", opening: "-1" }).ok, false);
});

test("kirim + hodim lowers the debt; chiqim + toggle raises it; toggle off changes nothing; each action one log", async () => {
  const { tx, rows, logs, debt } = fakeTx();
  await rules.syncKassaDebt(tx, entry(), true, "u");
  assert.equal(debt("atham"), -500);
  assert.equal(rows[0].kassaEntryId, "k1");
  await rules.syncKassaDebt(tx, entry({ id: "k2", type: "OUT", amount: 800 }), true, "u");
  assert.equal(debt("atham"), 300);
  await rules.syncKassaDebt(tx, entry({ id: "k3", type: "OUT", amount: 900 }), false, "u");
  assert.equal(debt("atham"), 300, "only a mark");
  assert.equal(rows.length, 2);
  assert.equal(logs.length, 2);
});

test("correcting the entry (amount, hodim, type, toggle) keeps the debts right; a repeated save adds nothing", async () => {
  const { tx, rows, logs, debt } = fakeTx();
  await rules.syncKassaDebt(tx, entry(), true, "u");
  await rules.syncKassaDebt(tx, entry(), true, "u");
  assert.equal(rows.length, 1);
  assert.equal(logs.length, 1, "no change, no log");
  await rules.syncKassaDebt(tx, entry({ amount: 700 }), true, "u");
  assert.equal(debt("atham"), -700);
  await rules.syncKassaDebt(tx, entry({ amount: 700, employeeId: "jasur" }), true, "u");
  assert.deepEqual([debt("atham"), debt("jasur")], [0, -700]);
  await rules.syncKassaDebt(tx, entry({ amount: 700, employeeId: "jasur", type: "OUT" }), true, "u");
  assert.equal(debt("jasur"), 700);
  await rules.syncKassaDebt(tx, entry({ amount: 700, employeeId: "jasur", type: "OUT" }), false, "u");
  assert.equal(debt("jasur"), 0, "toggle off: the row is soft deleted");
  await rules.syncKassaDebt(tx, entry({ amount: 700, employeeId: "jasur", type: "OUT" }), true, "u");
  assert.equal(debt("jasur"), 700);
  assert.equal(rows.length, 1, "kassaEntryId keeps it one row");
  await rules.syncKassaDebt(tx, entry({ employeeId: null }), true, "u");
  assert.equal(debt("jasur"), 0);
});

test("kassa delete / restore carries the debt row; one switched off by the toggle does not come back", async () => {
  const { tx, logs, debt } = fakeTx(), when = new Date("2026-10-30T10:00:00Z");
  await rules.syncKassaDebt(tx, entry(), true, "u");
  await rules.deleteKassaDebt(tx, "k1", when, "u", "xato");
  assert.equal(debt("atham"), 0);
  await rules.restoreKassaDebt(tx, "k1", when, "u");
  assert.equal(debt("atham"), -500);
  assert.equal(logs.length, 3);
  await rules.syncKassaDebt(tx, entry({ id: "k2", type: "OUT", amount: 50 }), true, "u");
  await rules.syncKassaDebt(tx, entry({ id: "k2", type: "OUT", amount: 50 }), false, "u");
  await rules.deleteKassaDebt(tx, "k2", when, "u", null);
  await rules.restoreKassaDebt(tx, "k2", when, "u");
  assert.equal(debt("atham"), -500);
});

test("so‘m never reaches a hodim; the form's live line matches what saving does", () => {
  const base = { type: "IN", currency: "UZS", paymentType: "CASH", amount: "100", categoryId: "c", note: "x", occurredAt: "2026-10-30T10:00", employeeId: "atham" };
  assert.deepEqual(kassa.parseEntry(base), { ok: false, error: "Hodim hisoblari faqat dollarda." });
  assert.equal(kassa.parseEntry({ ...base, currency: "USD" }).data.employeeId, "atham");
  assert.equal(rules.debtTypeOf({ type: "IN", currency: "UZS", employeeId: "atham" }, true), null);
  assert.equal(rules.debtAfter(2000, 0, { type: "IN", amount: 500, addToDebt: true }), 1500);
  assert.equal(rules.debtAfter(2000, 0, { type: "OUT", amount: 500, addToDebt: true }), 2500);
  assert.equal(rules.debtAfter(2000, 0, { type: "OUT", amount: 500, addToDebt: false }), 2000);
  assert.equal(rules.debtAfter(1500, -500, { type: "IN", amount: 700, addToDebt: true }), 1300, "correction: its old effect is taken out first");
});

test("hand-written rows never touch the kassa; kassa rows are not editable on the hodim side; the kassa ledger ignores hodim fields", async () => {
  const actions = await source("app/admin/(protected)/kassa/hodimlar/actions.ts");
  assert.doesNotMatch(actions, /kassaEntry\./, "no kassa write from the hodim side");
  assert.equal(actions.match(/kassaEntryId: null/g).length, 3, "save, delete and restore skip kassa rows");
  const page = await source("app/admin/(protected)/kassa/hodimlar/[id]/page.tsx");
  assert.match(page, /🧾 kassadan/);
  assert.match(page, /row\.kassaEntryId \? `\/admin\/kassa\?range=custom/);
  const zero = { USD: 0, UZS: 0 }, row = { type: "IN", currency: "USD", amount: 500, occurredAt: new Date("2026-10-30T10:00:00+05:00") };
  assert.deepEqual(kassa.ledger(zero, [{ ...row, employeeId: "atham" }], "2026-10-30", "2026-10-30"), kassa.ledger(zero, [row], "2026-10-30", "2026-10-30"), "balances as before");
});

test("bot: a name of the list that is in the message is suggested; anything else stays empty", () => {
  const staff = [{ id: "atham", name: "Atham aka" }, { id: "jasur", name: "Jasur" }];
  const ai = { type: "IN", amount: 500, currency: "USD", categoryName: "Hodimdan", note: "x", flags: [], employeeName: "Atham aka" }, categories = [{ id: "c", name: "Hodimdan", type: "IN" }];
  assert.equal(core.normalizeDraft(ai, categories, "Atham akadan 500 dollar oldim", staff).employeeId, "atham");
  assert.equal(core.normalizeDraft(ai, categories, "Atxam akadan 500 dollar oldim", staff).employeeId, null, "not the same name");
  assert.equal(core.normalizeDraft({ ...ai, employeeName: "Atham" }, categories, "Atham akadan 500 dollar", staff).employeeId, null, "not exactly a name of the list");
  assert.equal(core.normalizeDraft({ ...ai, employeeName: null }, categories, "Atham akadan 500 dollar", staff).employeeId, null);
  assert.equal(core.normalizeDraft({ ...ai, currency: "UZS" }, categories, "Atham akadan 500 ming", staff).employeeId, null, "so‘m");
  assert.equal(core.normalizeDraft(ai, categories, "Atham akadan 500 dollar", [...staff, { id: "x", name: "Atham aka" }]).employeeId, null, "two of that name");
  assert.equal(core.entryFromDraft({ type: "IN", amount: 1, currency: "USD", categoryId: "c", paymentType: "CASH", note: "x", flags: [], occurredAt: new Date(), employeeId: "atham" }).employeeId, "atham");
});

test("only SUPER_ADMIN: pages, actions, Excel and the Do‘kon group", async () => {
  const actions = await source("app/admin/(protected)/kassa/hodimlar/actions.ts");
  const bodies = actions.split("export async function ").slice(1);
  assert.equal(bodies.length, 4);
  for (const body of bodies) assert.match(body.split("\n")[1], /^\s+const user = await requireRole\("SUPER_ADMIN"\);$/, body.slice(0, 30));
  for (const file of ["kassa/hodimlar/page.tsx", "kassa/hodimlar/[id]/page.tsx", "kassa/hodimlar/export/route.ts", "dokon/page.tsx"]) assert.match(await source(`app/admin/(protected)/${file}`), /await requireRole\("SUPER_ADMIN"\);/, file);
  for (const role of ["SELLER", "WORKSHOP", "STOREKEEPER"]) for (const path of ["/admin/dokon", "/admin/kassa/hodimlar", "/admin/kassa/hodimlar/x"]) assert.notEqual(access.roleAccess(role, path, { method: "GET", headers: { has: () => false } }), "allow", `${role} ${path}`);
  const shell = await source("components/admin/admin-shell.tsx");
  assert.match(shell, /user\.role === "SUPER_ADMIN" && <NavFold id="nav-dokon"/);
  assert.equal(shell.match(/label: "Kassa"/g).length, 1, "Kassa is listed once");
  assert.match(await source("lib/admin/shell-data.ts"), /user\.role === "SUPER_ADMIN" \? getEmployees\(\)/);
});

test("the debt total and list come from one function, biggest first; archived hodimlar are out", () => {
  const staff = [{ id: "a", debt: 100, archived: false }, { id: "b", debt: 900, archived: true }, { id: "c", debt: -20, archived: false }, ...[1, 2, 3, 4, 5].map(n => ({ id: `n${n}`, debt: n * 10, archived: false }))];
  const { total, list, holders } = rules.shopDebts(staff);
  assert.equal(total, 230);
  assert.equal(holders, 6);
  assert.deepEqual(list.map(item => item.id), ["a", "n5", "n4", "n3", "n2", "n1", "c"]);
});

test("kassa hodim select: search, Hodimdan opens it, off in so‘m, keyboard; the page has no Hodim filter, the 👤 tag stays", async () => {
  const staff = [{ id: "a", name: "Atxamjon aka", archived: false }, { id: "j", name: "Jasur", archived: false }, { id: "o", name: "Atxam eski", archived: true }];
  assert.deepEqual(rules.pickableEmployees(staff, "atx", "").map(item => item.id), ["a"], "search; archived are out");
  assert.deepEqual(rules.pickableEmployees(staff, "", "o").map(item => item.id), ["a", "j", "o"], "the entry's archived hodim stays");
  const form = await source("components/admin/kassa/entry-form.tsx"), page = await source("app/admin/(protected)/kassa/page.tsx");
  assert.match(form, /category\.id === EMPLOYEE_CATEGORY_ID && usd\) setPicker\(true\)/);
  assert.match(form, /<input autoFocus type="search" role="combobox"/, "focus goes to the search");
  assert.match(form, /disabled=\{!usd\}/);
  assert.match(form, /Hodim hisoblari faqat dollarda/);
  assert.match(form, /— Hodimsiz/);
  for (const key of ["ArrowDown", "ArrowUp", "Enter"]) assert.ok(form.includes(`event.key === "${key}"`), key);
  assert.doesNotMatch(page, /name="emp"|search\.emp/);
  assert.match(page, /name="cat"/);
  assert.match(page, /name="pay"/);
  assert.match(page, /<EmployeeTag /);
});
