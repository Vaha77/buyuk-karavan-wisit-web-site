import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const kassa = await import("../lib/kassa/rules.ts");
const source = async file => (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const zero = { USD: 0, UZS: 0 };
const at = (local, type, currency, amount) => ({ type, currency, amount, occurredAt: new Date(`${local}+05:00`) });

test("day boundary is Tashkent time: 23:59 stays on the day, 00:00 starts the next", () => {
  const days = kassa.ledger(zero, [at("2026-10-27T23:59:59", "IN", "USD", 10), at("2026-10-28T00:00:00", "IN", "USD", 5)], "2026-10-27", "2026-10-28");
  assert.deepEqual(days.map(day => [day.day, day.USD.in]), [["2026-10-27", 10], ["2026-10-28", 5]]);
  assert.equal(kassa.parseEntry({ type: "IN", currency: "USD", paymentType: "CASH", amount: "1 200", categoryId: "c", note: "x", occurredAt: "2026-10-27T23:59" }).data.occurredAt.toISOString(), "2026-10-27T18:59:00.000Z");
});

test("balances carry over: opening + earlier entries; a minus balance carries as minus", () => {
  const opening = { USD: 10_000, UZS: 100_000_000 };
  const carry = kassa.carryFrom(opening, [{ type: "IN", currency: "USD", sum: 500 }, { type: "OUT", currency: "UZS", sum: 1_000_000 }]);
  assert.deepEqual(carry, { USD: 10_500, UZS: 99_000_000 });
  const rows = [at("2026-10-01T10:00", "OUT", "USD", 12_000), at("2026-10-02T09:00", "IN", "USD", 700), at("2026-10-03T12:00", "OUT", "UZS", 450_000)];
  const days = kassa.ledger(carry, rows, "2026-10-01", "2026-10-03");
  assert.deepEqual(days.map(day => day.USD), [{ start: 10_500, in: 0, out: 12_000, end: -1_500 }, { start: -1_500, in: 700, out: 0, end: -800 }, { start: -800, in: 0, out: 0, end: -800 }]);
  assert.equal(days[2].UZS.end, 98_550_000);
  assert.deepEqual(kassa.totals(days, "USD"), { start: 10_500, in: 700, out: 12_000, end: -800 });
  assert.equal(kassa.money(-800, "USD"), "−$ 800");
  assert.equal(kassa.money(450_000, "UZS", true), "+450 000 so‘m");
  assert.equal(kassa.money(1200, "USD"), "$ 1 200");
});

test("correcting a past entry changes every later day and logs only the changed fields", async () => {
  const rows = [at("2026-10-01T10:00", "IN", "USD", 100), at("2026-10-02T10:00", "OUT", "USD", 30)];
  assert.equal(kassa.ledger(zero, rows, "2026-10-01", "2026-10-03")[2].USD.end, 70);
  rows[0].amount = 150;
  assert.deepEqual(kassa.ledger(zero, rows, "2026-10-01", "2026-10-03").map(day => day.USD.end), [150, 120, 120]);
  const before = { amount: 100, note: "Sotuv", occurredAt: new Date("2026-10-01T05:00:00Z"), createdAt: new Date() };
  assert.deepEqual(kassa.diffEntry(before, { amount: 150, note: "Sotuv", occurredAt: new Date("2026-10-01T05:00:00Z") }), { amount: ["100", "150"] });
  const actions = await source("app/admin/(protected)/kassa/actions.ts");
  assert.match(actions, /\$transaction\(async tx => \{ await tx\.kassaEntry\.update[\s\S]*?tx\.kassaEntryLog\.create/);
  assert.doesNotMatch(actions, /kassaEntry\.delete/, "entries are never deleted");
});

test("USD and UZS never mix", () => {
  const days = kassa.ledger({ USD: 1, UZS: 2 }, [at("2026-10-01T10:00", "IN", "USD", 5), at("2026-10-01T11:00", "OUT", "UZS", 7)], "2026-10-01", "2026-10-01");
  assert.deepEqual(days[0].USD, { start: 1, in: 5, out: 0, end: 6 });
  assert.deepEqual(days[0].UZS, { start: 2, in: 0, out: 7, end: -5 });
});

test("entry validation and note suggestions", () => {
  const base = { type: "OUT", currency: "UZS", paymentType: "BANK", amount: "450 000", categoryId: "c", note: " Benzin ", occurredAt: "2026-10-27T10:00" };
  assert.equal(kassa.parseEntry(base).data.amount, 450_000);
  assert.equal(kassa.parseEntry(base).data.note, "Benzin");
  for (const bad of [{ amount: "0" }, { amount: "-5" }, { amount: "1.234" }, { note: "" }, { categoryId: "" }, { currency: "EUR" }, { occurredAt: "kecha" }]) assert.equal(kassa.parseEntry({ ...base, ...bad }).ok, false, JSON.stringify(bad));
  const history = [{ note: "UCS yo‘lkira", amount: 120, currency: "USD", categoryId: "a", type: "OUT" }, { note: "UCS yo‘lkira", amount: 90, currency: "USD", categoryId: "a", type: "OUT" }, { note: "UCS yuk tushirish", amount: 300_000, currency: "UZS", categoryId: "b", type: "OUT" }, { note: "UCS qaytardi", amount: 5, currency: "USD", categoryId: "c", type: "IN" }];
  assert.deepEqual(kassa.suggestNotes(history, "ucs", "OUT").map(hint => [hint.note, hint.amount]), [["UCS yo‘lkira", 120], ["UCS yuk tushirish", 300_000]]);
});

test("only SUPER_ADMIN: every page, action and the Excel route check the role; the menu hides it", async () => {
  const actions = await source("app/admin/(protected)/kassa/actions.ts");
  const bodies = actions.split("export async function ").slice(1);
  assert.equal(bodies.length, 9, "save, category ×2, opening, delete, restore, bot draft ✓ / ✕ / all");
  for (const body of bodies) assert.match(body.split("\n")[1], /^\s+(const user = )?await requireRole\("SUPER_ADMIN"\);$/, `${body.slice(0, 30)} starts with requireRole(SUPER_ADMIN)`);
  for (const file of ["app/admin/(protected)/kassa/page.tsx", "app/admin/(protected)/kassa/report/page.tsx", "app/admin/(protected)/kassa/export/route.ts"]) assert.match(await source(file), /await requireRole\("SUPER_ADMIN"\);/, file);
  assert.match(await source("lib/auth/require-admin.ts"), /if \(!hasRole\(user\.role, roles\)\) redirect\("\/admin"\);/, "other roles are sent away");
  assert.match(await source("components/admin/admin-shell.tsx"), /\{ label: "Kassa", href: "\/admin\/kassa", icon: Wallet, superOnly: true \}/);
});

test("delete is soft: a deleted entry leaves every balance (later days too) and comes back when restored; both are logged", async () => {
  const rows = [at("2026-10-01T10:00", "IN", "USD", 1250), at("2026-10-02T10:00", "OUT", "USD", 200), at("2026-10-03T10:00", "IN", "USD", 50)];
  const ends = list => kassa.ledger(zero, list, "2026-10-01", "2026-10-03").map(day => day.USD.end);
  assert.deepEqual(ends(rows), [1250, 1050, 1100]);
  const live = rows.filter((_, index) => index !== 0); // the past day's entry is deleted
  assert.deepEqual(ends(live), [0, -200, -150], "every later day moves, a minus carries");
  assert.deepEqual(ends(rows), [1250, 1050, 1100], "restored");
  const queries = await source("lib/kassa/queries.ts");
  assert.equal(queries.match(/kassaEntry\.(findMany|groupBy)\(\{ (by: \[[^\]]+\], )?where: (\{ \.\.\.)?live\b/g)?.length, 3, "ledger carry, ledger rows and note history skip deleted entries");
  assert.match(queries, /const where: Prisma\.KassaEntryWhereInput = \{ \.\.\.live,/, "list and Excel skip deleted entries");
  const actions = await source("app/admin/(protected)/kassa/actions.ts");
  assert.match(actions, /deleteEntryAction[\s\S]*?updateMany\(\{ where: \{ id: String\(id\), deletedAt: null \}, data: \{ deletedAt: at, deletedById: user\.id, deleteReason \} \}\);\n\s+if \(count\) await tx\.kassaEntryLog\.create/);
  assert.match(actions, /restoreEntryAction[\s\S]*?deletedAt: null, deletedById: null[\s\S]*?kassaEntryLog\.create/);
});
