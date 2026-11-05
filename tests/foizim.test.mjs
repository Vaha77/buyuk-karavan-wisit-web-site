import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/foizim/rules.ts");
const month = await import("../lib/foizim/month.ts");
const access = await import("../lib/auth/seller-access.ts");
const source = async file => (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const row = (local, fromName, amount, extra) => ({ id: `${fromName}${local}`, fromName, amount, base: null, percent: null, note: null, occurredAt: new Date(`${local}+05:00`), ...extra });

/** Only the foizim tables (and users to look up) exist here: touching kassa or hodim tables would throw. */
function table(prefix) {
  const rows = [];
  return { rows, model: {
    create: async ({ data }) => { const item = { id: `${prefix}${rows.length + 1}`, deletedAt: null, deleteReason: null, ...data }; rows.push(item); return item; },
    findFirst: async ({ where }) => rows.find(item => item.id === where.id && (where.deletedAt === null ? !item.deletedAt : !!item.deletedAt)) ?? null,
    update: async ({ where, data }) => Object.assign(rows.find(item => item.id === where.id), data),
    updateMany: async ({ where, data }) => { const item = rows.find(one => one.id === where.id && !one.deletedAt); if (item) Object.assign(item, data); return { count: item ? 1 : 0 }; },
  } };
}
const USERS = [{ id: "s1", name: "Atxam aka", role: "SELLER" }, { id: "k1", name: "Ravshan", role: "STOREKEEPER" }, { id: "m1", name: "Menejer", role: "MANAGER" }];
function fakeDb() {
  const commissions = table("c"), shortages = table("sh"), logs = [], log = { create: async ({ data }) => { logs.push(data); return data; } };
  const adminUser = { findFirst: async ({ where }) => USERS.find(user => user.id === where.id && user.role === where.role) ?? null };
  const db = Object.freeze({ myCommission: commissions.model, myCommissionLog: log, shopShortage: shortages.model, shopShortageLog: log, adminUser, $transaction: run => run(db) });
  const live = () => commissions.rows.filter(item => !item.deletedAt).map(item => ({ ...item, amount: item.amountUsd }));
  return { db, rows: commissions.rows, shortageRows: shortages.rows, logs, live };
}
const money = (local, direction, kind, amount) => ({ direction, kind, amount, occurredAt: new Date(`${local}+05:00`) });
const short = (local, type, amount) => ({ type, amount, occurredAt: new Date(`${local}+05:00`) });
const form = patch => ({ fromName: " Atxam aka ", amount: "900", occurredAt: "2026-11-05T10:00", note: "", ...patch });

test("period total and Kimdan sums; top 10 then Boshqalar", () => {
  const rows = [row("2026-11-05T10:00", "Atxam aka", 900), row("2026-11-03T10:00", "Sobitxon", 550), row("2026-11-02T10:00", "Atxam aka", 100), row("2026-10-31T10:00", "UCS", 390)];
  const month = rows.filter(item => rules.inRange(item, rules.commissionRange({}, new Date("2026-11-05T12:00:00+05:00"))));
  assert.equal(rules.sumOf(month), 1550, "default oy");
  assert.deepEqual(rules.byFrom(month), [{ name: "Atxam aka", sum: 1000 }, { name: "Sobitxon", sum: 550 }]);
  assert.equal(rules.sumOf(rows.filter(item => rules.inRange(item, rules.commissionRange({ p: "yil" }, new Date("2026-11-05T12:00:00+05:00"))))), 1940);
  const many = Array.from({ length: 12 }, (_, n) => row("2026-11-01T10:00", `n${n}`, 100 - n));
  const bars = rules.byFrom(many);
  assert.equal(bars.length, 11);
  assert.deepEqual(bars.at(-1), { name: "Boshqalar", sum: 90 + 89 });
  assert.deepEqual(rules.fromSuggestions([{ fromName: "B" }, { fromName: "A" }, { fromName: "A" }]), ["A", "B"]);
});

test("Tashkent day: 23:59 and 00:00 fall on different days", () => {
  const now = new Date("2026-11-05T00:00:00+05:00"), today = rules.commissionRange({ p: "bugun" }, now);
  assert.equal(rules.inRange(row("2026-11-04T23:59", "a", 1), today), false);
  assert.equal(rules.inRange(row("2026-11-05T00:00", "a", 1), today), true);
  assert.equal(rules.inRange(row("2026-11-05T23:59", "a", 1), today), true);
  assert.equal(rules.inRange(row("2026-11-06T00:00", "a", 1), today), false);
  assert.equal(rules.inRange(row("2026-10-31T23:59", "a", 1), rules.commissionRange({ p: "oy" }, now)), false);
});

test("percent: 18000 × 5% = 900; a hand-typed amount is what is saved; validation", () => {
  assert.equal(rules.percentOf(18000, 5), 900);
  assert.equal(rules.percentOf(1234.56, 2.5), 30.86);
  assert.equal(rules.percentText({ base: 18000, percent: 5 }), "5% × $18 000");
  const parsed = rules.parseCommission(form({ calc: "on", base: "18 000", percent: "5", amount: "850" }));
  assert.deepEqual([parsed.data.amountUsd, parsed.data.baseAmountUsd, parsed.data.percent, parsed.data.fromName, parsed.data.note], [850, 18000, 5, "Atxam aka", null]);
  assert.equal(rules.parseCommission(form({ base: "18000", percent: "5" })).data.baseAmountUsd, null, "toggle off keeps no percent data");
  for (const amount of ["0", "-5", "", "abc", "1.234"]) assert.equal(rules.parseCommission(form({ amount })).ok, false, amount);
  assert.equal(rules.parseCommission(form({ fromName: "   " })).ok, false);
  assert.equal(rules.parseCommission(form({ calc: "on", base: "18000", percent: "0" })).ok, false);
});

test("each action one log; a deleted row is not counted and comes back restored; only commission tables are touched", async () => {
  const { db, logs, live } = fakeDb();
  assert.deepEqual(await rules.saveCommission(db, "u", form()), { ok: true });
  assert.equal(logs.length, 1);
  assert.equal((await rules.saveCommission(db, "u", form({ amount: "0" }))).ok, false);
  assert.equal(logs.length, 1, "refused save writes nothing");
  await rules.saveCommission(db, "u", form({ id: "c1" }));
  assert.equal(logs.length, 1, "unchanged save writes no log");
  await rules.saveCommission(db, "u", form({ id: "c1", amount: "950" }));
  assert.deepEqual(logs[1].changes, { amountUsd: ["900", "950"] });
  assert.equal(rules.sumOf(live()), 950);
  assert.deepEqual(await rules.deleteCommission(db, "u", "c1", " xato "), { ok: true });
  assert.equal(logs.length, 3);
  assert.equal(logs[2].changes.deleteReason[1], "xato");
  assert.equal(rules.sumOf(live()), 0);
  assert.equal((await rules.deleteCommission(db, "u", "c1", "")).ok, false, "twice: no second log");
  assert.deepEqual(await rules.restoreCommission(db, "u", "c1"), { ok: true });
  assert.equal(logs.length, 4);
  assert.equal(rules.sumOf(live()), 950);
  for (const file of ["lib/foizim/rules.ts", "lib/foizim/month.ts", "lib/foizim/queries.ts", "app/admin/(protected)/kassa/foizim/actions.ts"]) assert.doesNotMatch(await source(file), /kassaEntry|employeeDebt|kassaSettings/, file);
});

test("only SUPER_ADMIN: page, actions, Excel and the menu", async () => {
  const bodies = (await source("app/admin/(protected)/kassa/foizim/actions.ts")).split("export async function ").slice(1);
  assert.equal(bodies.length, 5);
  for (const body of bodies) assert.match(body.split("\n")[1], /^\s+const user = await requireRole\("SUPER_ADMIN"\);$/);
  for (const file of ["page.tsx", "export/route.ts"]) assert.match(await source(`app/admin/(protected)/kassa/foizim/${file}`), /await requireRole\("SUPER_ADMIN"\);/, file);
  for (const role of ["SELLER", "WORKSHOP", "STOREKEEPER"]) for (const path of ["/admin/kassa/foizim", "/admin/kassa/foizim/export"]) assert.notEqual(access.roleAccess(role, path, { method: "GET", headers: { has: () => false } }), "allow", `${role} ${path}`);
  const shell = await source("components/admin/admin-shell.tsx"), at = text => shell.indexOf(text);
  assert.match(shell, /label: "Mening foizim", href: "\/admin\/kassa\/foizim", icon: Percent, superOnly: true/);
  assert.ok(at("/>Dashboard<") < at("/>Kassa<") && at("/>Kassa<") < at("/>Mening foizim<") && at("/>Mening foizim<") < at("/>Hodimlar</>"), "Dashboard · Kassa · Mening foizim · Hodimlar");
  assert.match(await source("components/admin/kassa/dokon-tabs.tsx"), /Kassa<\/Chip>\n.*Foizim<\/Chip>\n.*Hodimlar<\/Chip>/);
});

test("Grafiklar: months Yan–Dek with the running total up to this month; cards; year donut top 4 + Boshqalar", () => {
  const now = new Date("2026-11-05T12:00:00+05:00");
  const rows = [row("2026-01-01T00:00", "A", 600), row("2025-12-31T23:59", "A", 999), row("2026-07-10T10:00", "B", 2350), row("2026-11-04T10:00", "C", 1840), row("2026-11-05T10:00", "D", 10), row("2026-11-05T11:00", "E", 5), row("2026-11-05T11:30", "F", 1)];
  const stats = rules.yearStats(rows, now);
  assert.equal(stats.months.length, 12);
  assert.deepEqual([stats.months[0].label, stats.months[5].label, stats.months[6].label], ["Yan", "Iyn", "Iyl"]);
  assert.deepEqual(stats.months.map(month => month.cum), [600, 600, 600, 600, 600, 600, 2950, 2950, 2950, 2950, 4806, null]);
  assert.equal(stats.months[10].current, true);
  assert.deepEqual([stats.month, stats.total, stats.average, stats.best.full], [1856, 4806, 436.91, "Iyul 2026"]);
  assert.deepEqual(stats.top.map(item => item.name), ["B", "C", "A", "D", "Boshqalar"]);
  assert.equal(stats.top.at(-1).sum, 6);
  assert.equal(rules.yearStats([], now).best, null);
});

test("month close: a positive result comes off the shortage and the next month starts at $0", () => {
  const rows = [money("2026-10-03T10:00", "IN", "SELLER_COMMISSION", 1840), money("2026-10-10T10:00", "OUT", "SALARY", 400), money("2026-10-11T10:00", "OUT", "SALARY", 400), money("2026-10-12T10:00", "OUT", "OTHER_OUT", 450)];
  const { months, shortage, open } = month.monthCloses(rows, [short("2026-10-01T09:00", "OPENING", 14500)], new Date("2026-11-05T12:00:00+05:00"));
  assert.deepEqual(months.map(item => item.key), ["2026-10", "2026-11"]);
  assert.deepEqual([months[0].in, months[0].salary, months[0].salaryCount, months[0].other, months[0].result, months[0].deducted, months[0].shortageAfter, months[0].carry], [1840, 800, 2, 450, 590, 590, 13910, 0]);
  assert.equal(shortage, 13910);
  assert.deepEqual([open.key, open.closed, open.start, open.result], ["2026-11", false, 0, 0]);
});

test("month close: a result above the shortage clears it and the rest carries; a minus carries and leaves the shortage", () => {
  const now = new Date("2026-12-05T12:00:00+05:00");
  const rows = [money("2026-10-03T10:00", "IN", "OTHER_IN", 1000), money("2026-11-03T10:00", "OUT", "SALARY", 1200)];
  const { months, shortage } = month.monthCloses(rows, [short("2026-10-01T09:00", "OPENING", 300), short("2026-11-20T10:00", "ADD", 50)], now);
  assert.deepEqual([months[0].deducted, months[0].carry, months[0].shortageAfter], [300, 700, 0]);
  assert.deepEqual([months[1].start, months[1].result, months[1].deducted, months[1].carry, months[1].shortageBefore], [700, -500, 0, -500, 50]);
  assert.equal(shortage, 50, "the minus month took nothing");
  assert.deepEqual([months[2].start, months[2].closed], [-500, false]);
  assert.equal(month.monthCloses(rows, [], now).months[0].carry, 1000, "no shortage: everything carries");
});

test("month close: correcting a past month re-flows the later months; Tashkent 23:59 / 00:00", () => {
  const now = new Date("2026-12-05T12:00:00+05:00"), shortages = [short("2026-10-01T09:00", "OPENING", 1000)];
  const rows = [money("2026-10-05T10:00", "IN", "OTHER_IN", 400), money("2026-11-05T10:00", "IN", "OTHER_IN", 400)];
  assert.equal(month.monthCloses(rows, shortages, now).shortage, 200);
  rows[0] = { ...rows[0], amount: 900 };
  const after = month.monthCloses(rows, shortages, now);
  assert.deepEqual([after.months[0].deducted, after.months[1].shortageBefore, after.months[1].deducted, after.shortage], [900, 100, 100, 0]);
  const edge = month.monthCloses([money("2026-10-31T23:59", "IN", "OTHER_IN", 10), money("2026-11-01T00:00", "IN", "OTHER_IN", 5)], [], new Date("2026-11-01T00:00:00+05:00"));
  assert.deepEqual(edge.months.map(item => [item.key, item.in, item.closed]), [["2026-10", 10, true], ["2026-11", 5, false]]);
  assert.equal(edge.open.start, 10, "October closed at 00:00");
  assert.equal(month.monthCloses([], [short("2026-10-31T23:59", "ADD", 50)], new Date("2026-10-31T23:59:00+05:00")).months[0].closed, false);
});

test("shortage = OPENING + ADD + ADJUST − deducted; a deleted row does not count; history adds the automatic lines", async () => {
  const now = new Date("2026-11-05T12:00:00+05:00"), rows = [money("2026-10-03T10:00", "IN", "OTHER_IN", 100)];
  const typed = [{ id: "a", note: "x", ...short("2026-10-01T09:00", "OPENING", 1000) }, { id: "b", note: "y", ...short("2026-10-02T09:00", "ADD", 200) }, { id: "c", note: "z", ...short("2026-10-03T09:00", "ADJUST", -50) }];
  const closes = month.monthCloses(rows, typed, now);
  assert.equal(closes.shortage, 1050);
  const history = month.shortageHistory(typed, closes.months);
  assert.deepEqual([history[0].auto, history[0].note, history[0].amount], [true, "Oktabr qoldig‘i ayrildi", -100]);
  assert.equal(history.length, 4);
  const { db, shortageRows, logs } = fakeDb(), form = patch => ({ type: "ADD", amount: "620", note: "Reviziya", occurredAt: "2026-11-05T10:00", ...patch });
  assert.equal((await rules.saveShortage(db, "u", form({ amount: "-5" }))).ok, false, "only ADJUST may be minus");
  assert.equal((await rules.saveShortage(db, "u", form({ note: " " }))).ok, false);
  assert.equal(rules.parseShortage(form({ type: "ADJUST", amount: "-1 200" })).data.amountUsd, -1200);
  await rules.saveShortage(db, "u", form());
  await rules.deleteShortage(db, "u", "sh1", "");
  const live = () => shortageRows.filter(item => !item.deletedAt).map(item => ({ ...item, amount: item.amountUsd }));
  assert.equal(month.monthCloses([], live(), now).shortage, 0);
  await rules.restoreAny(db, "u", "sh1");
  assert.equal(month.monthCloses([], live(), now).shortage, 620);
  assert.equal(logs.length, 3, "save, delete, restore: one log each");
});

test("kinds: a seller / storekeeper is required and must have that role; the name comes from the user; salary warning", async () => {
  const { db, rows } = fakeDb(), base = { amount: "400", occurredAt: "2026-11-05T10:00" };
  assert.equal((await rules.saveCommission(db, "u", { ...base, kind: "SELLER_COMMISSION" })).ok, false);
  assert.equal((await rules.saveCommission(db, "u", { ...base, kind: "SALARY", salaryMonth: "2026-11" })).ok, false);
  assert.equal((await rules.saveCommission(db, "u", { ...base, kind: "SALARY", storekeeperId: "k1" })).ok, false, "month required");
  assert.equal((await rules.saveCommission(db, "u", { ...base, kind: "SELLER_COMMISSION", sellerId: "m1" })).ok, false, "a manager is no seller");
  assert.equal((await rules.saveCommission(db, "u", { ...base, kind: "SELLER_COMMISSION", sellerId: "k1" })).ok, false, "a storekeeper is no seller");
  assert.equal((await rules.saveCommission(db, "u", { ...base, kind: "SALARY", storekeeperId: "s1", salaryMonth: "2026-11" })).ok, false);
  assert.equal((await rules.saveCommission(db, "u", { ...base, kind: "OTHER_OUT" })).ok, false, "category required");
  assert.deepEqual(await rules.saveCommission(db, "u", { ...base, kind: "SELLER_COMMISSION", sellerId: "s1", fromName: "boshqa", calc: "on", base: "18000", percent: "5", amount: "900" }), { ok: true });
  assert.deepEqual([rows[0].direction, rows[0].fromName, rows[0].sellerId, rows[0].storekeeperId], ["IN", "Atxam aka", "s1", null]);
  await rules.saveCommission(db, "u", { ...base, kind: "SALARY", storekeeperId: "k1", salaryMonth: "2026-11", calc: "on", base: "1", percent: "1" });
  assert.deepEqual([rows[1].direction, rows[1].fromName, rows[1].salaryMonth, rows[1].baseAmountUsd], ["OUT", "Ravshan", "2026-11", null]);
  await rules.saveCommission(db, "u", { ...base, kind: "OTHER_OUT", category: " Mashina " });
  assert.deepEqual([rows[2].direction, rows[2].fromName, rows[2].category], ["OUT", "Mashina", "Mashina"]);
  const list = rows.map(item => ({ ...item, amount: item.amountUsd, percent: item.percent }));
  assert.equal(rules.salaryTaken(list, "k1", "2026-11"), true);
  assert.equal(rules.salaryTaken(list, "k1", "2026-11", rows[1].id), false, "its own row while editing");
  assert.equal(rules.salaryTaken(list, "k1", "2026-12"), false);
  assert.deepEqual(rules.lastBy(list, "sellerId", item => item.percent), { s1: 5 });
});

test("old rows stay IN / OTHER_IN; sotuv rejasi block sums SELLER_COMMISSION only and is Super Admin only", async () => {
  const sql = await source("prisma/migrations/20261108090000_foizim_kassa/migration.sql");
  assert.match(sql, /"direction" "CommissionDirection" NOT NULL DEFAULT 'IN'/);
  assert.match(sql, /"kind" "CommissionKind" NOT NULL DEFAULT 'OTHER_IN'/);
  assert.doesNotMatch(sql, /DROP|ALTER COLUMN|"KassaEntry"|"EmployeeDebt/);
  assert.equal(rules.parseCommission({ fromName: "UCS", amount: "390", occurredAt: "2026-11-02T10:00" }).data.kind, "OTHER_IN", "no kind = OTHER_IN");
  const rows = [
    { ...row("2026-11-05T10:00", "Atxam aka", 900, { base: 18000, percent: 5 }), kind: "SELLER_COMMISSION", sellerId: "s1", direction: "IN" },
    { ...row("2026-11-03T10:00", "Sobitxon", 550, { base: 18300, percent: 3 }), kind: "SELLER_COMMISSION", sellerId: "s2", direction: "IN" },
    { ...row("2026-11-03T10:00", "UCS", 390), kind: "OTHER_IN", direction: "IN" },
    { ...row("2026-10-03T10:00", "Atxam aka", 100, { base: 1000, percent: 10 }), kind: "SELLER_COMMISSION", sellerId: "s1", direction: "IN" },
  ];
  const { list, total } = rules.sellerCommissions(rows, [{ id: "s1", name: "Atxam aka" }, { id: "s2", name: "Sobitxon" }, { id: "s3", name: "Huseyin" }], { from: new Date("2026-11-01T00:00:00+05:00"), to: new Date("2026-12-01T00:00:00+05:00") });
  assert.deepEqual(list.map(item => [item.name, item.base, item.pct, item.amount]), [["Atxam aka", 18000, 5, 900], ["Sobitxon", 18300, 3.01, 550], ["Huseyin", 0, null, 0]]);
  assert.deepEqual(total, { base: 36300, amount: 1450, pct: 3.99 });
  const plan = await source("app/admin/(protected)/sales-plan/page.tsx");
  assert.match(plan, /\{user\.role === "SUPER_ADMIN" && <MyCommissionBlock /);
  assert.equal(plan.match(/getCommissions\(/g).length, 1, "read only inside the Super Admin block");
  assert.equal(rules.wholeMonth(rules.commissionRange({ p: "otgan" }, new Date("2026-11-05T12:00:00+05:00"))), "2026-10");
  assert.equal(rules.wholeMonth(rules.commissionRange({ p: "yil" }, new Date("2026-11-05T12:00:00+05:00"))), null);
});

test("a salary counts in its salaryMonth: November's pay written on 03.12 closes November, not December", () => {
  const rows = [money("2026-11-05T10:00", "IN", "SELLER_COMMISSION", 1840), { ...money("2026-12-03T10:00", "OUT", "SALARY", 400), salaryMonth: "2026-11" }, money("2026-12-04T10:00", "IN", "OTHER_IN", 100)];
  const { months, shortage, open } = month.monthCloses(rows, [short("2026-11-01T09:00", "OPENING", 14500)], new Date("2026-12-05T12:00:00+05:00"));
  assert.deepEqual([months[0].key, months[0].salary, months[0].salaryCount, months[0].result, months[0].deducted, months[0].shortageAfter, months[0].carry], ["2026-11", 400, 1, 1440, 1440, 13060, 0]);
  assert.deepEqual([open.key, open.salary, open.in, open.result], ["2026-12", 0, 100, 100]);
  assert.equal(shortage, 13060);
  assert.equal(month.rowMonth({ ...rows[1], salaryMonth: null }), "2026-12", "no month: the paid date");
});
