import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/foizim/rules.ts");
const access = await import("../lib/auth/seller-access.ts");
const source = async file => (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const row = (local, fromName, amount, extra) => ({ id: `${fromName}${local}`, fromName, amount, base: null, percent: null, note: null, occurredAt: new Date(`${local}+05:00`), ...extra });

/** Only the two commission tables exist here: touching kassa or hodim tables would throw. */
function fakeDb() {
  const rows = [], logs = [];
  const myCommission = {
    create: async ({ data }) => { const item = { id: `c${rows.length + 1}`, deletedAt: null, deleteReason: null, ...data }; rows.push(item); return item; },
    findFirst: async ({ where }) => rows.find(item => item.id === where.id && (where.deletedAt === null ? !item.deletedAt : !!item.deletedAt)) ?? null,
    update: async ({ where, data }) => Object.assign(rows.find(item => item.id === where.id), data),
    updateMany: async ({ where, data }) => { const item = rows.find(one => one.id === where.id && !one.deletedAt); if (item) Object.assign(item, data); return { count: item ? 1 : 0 }; },
  };
  const db = Object.freeze({ myCommission, myCommissionLog: { create: async ({ data }) => { logs.push(data); return data; } }, $transaction: run => run(db) });
  const live = () => rows.filter(item => !item.deletedAt).map(item => ({ ...item, amount: item.amountUsd }));
  return { db, rows, logs, live };
}
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
  for (const file of ["lib/foizim/rules.ts", "lib/foizim/queries.ts", "app/admin/(protected)/kassa/foizim/actions.ts"]) assert.doesNotMatch(await source(file), /kassaEntry|employeeDebt|kassaSettings/, file);
});

test("only SUPER_ADMIN: page, actions, Excel and the menu", async () => {
  const bodies = (await source("app/admin/(protected)/kassa/foizim/actions.ts")).split("export async function ").slice(1);
  assert.equal(bodies.length, 3);
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
