import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const stats = await import("../lib/dokon/stats.ts");
const kassa = await import("../lib/kassa/rules.ts");
const access = await import("../lib/auth/seller-access.ts");
const source = async file => (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const zero = { USD: 0, UZS: 0 };
const at = (local, type, currency, amount, categoryId = "c") => ({ type, currency, amount, categoryId, occurredAt: new Date(`${local}+05:00`) });
const debt = (local, type, amount, kassaEntryId = null) => ({ type, amount, kassaEntryId, note: type, occurredAt: new Date(`${local}+05:00`) });
const NOW = new Date("2026-10-30T12:00:00+05:00");

test("the dashboard reads the same functions as the Kassa and Hodimlar pages, so the cards match for every period", async () => {
  const page = await source("app/admin/(protected)/dokon/page.tsx");
  for (const call of ["getKassaLedger(period.from, period.to)", "getKassaLedger(period.prevFrom, period.prevTo)", "getEmployees()", "shopDebts(employees)", 'totals(days, "USD")', 'totals(days, "UZS")']) assert.ok(page.includes(call), call);
  assert.doesNotMatch(page, /getDb|\$queryRaw/, "no second calculation");
  assert.match(await source("app/admin/(protected)/kassa/page.tsx"), /getKassaLedger\(period\.from, period\.to\)/);
  assert.match(await source("app/admin/(protected)/kassa/hodimlar/page.tsx"), /shopDebts\(all\)/);
  assert.deepEqual(stats.PERIOD_KEYS, { bugun: "today", hafta: "7d", oy: "month", davr: "custom" }, "the Kassa page's period keys");
});

test("chart days follow Tashkent time (23:59 / 00:00); USD and UZS never mix; net = kirim − chiqim", () => {
  const days = kassa.ledger(zero, [at("2026-10-27T23:59", "IN", "USD", 10), at("2026-10-28T00:00", "OUT", "USD", 4), at("2026-10-28T10:00", "IN", "UZS", 900)], "2026-10-27", "2026-10-28");
  assert.deepEqual(stats.kassaChart(days, "USD").map(({ label, a, b, line }) => [label, a, b, line]), [["27.10", 10, 0, 10], ["28.10", 0, 4, -4]]);
  assert.deepEqual(stats.kassaChart(days, "UZS").map(row => row.a), [0, 900]);
});

test("a long range goes by month with the same sums", () => {
  const rows = [at("2026-01-05T10:00", "IN", "USD", 10), at("2026-01-20T10:00", "IN", "USD", 5), at("2026-03-02T10:00", "OUT", "USD", 7)];
  const chart = stats.kassaChart(kassa.ledger(zero, rows, "2026-01-01", "2026-03-31"), "USD");
  assert.deepEqual(chart.map(({ full, a, b, line }) => [full, a, b, line]), [["yan 2026", 15, 0, 15], ["fev 2026", 0, 0, 0], ["mar 2026", 0, 7, -7]]);
});

test("a deleted entry is out of the chart and cards (the ledger query skips it), and back when restored", async () => {
  const rows = [at("2026-10-27T10:00", "IN", "USD", 10), at("2026-10-27T11:00", "IN", "USD", 5)];
  const sum = list => stats.kassaChart(kassa.ledger(zero, list, "2026-10-27", "2026-10-27"), "USD")[0].a;
  assert.equal(sum(rows), 15);
  assert.equal(sum(rows.slice(0, 1)), 10);
  assert.match(await source("lib/kassa/queries.ts"), /kassaEntry\.findMany\(\{ where: \{ \.\.\.live, occurredAt: \{ gte: from, lt: to \} \}/);
  assert.match(await source("lib/employees/queries.ts"), /employeeDebtEntry\.findMany\(\{ where: \{ deletedAt: null, employeeId \}/);
});

test("spend donut: top 4 + Boshqa, shares of one currency", () => {
  const rows = [["a", 50], ["b", 20], ["c", 10], ["d", 10], ["e", 6], ["f", 4]].map(([id, amount]) => at("2026-10-27T10:00", "OUT", "USD", amount, id));
  const parts = stats.spendByCategory([...rows, at("2026-10-27T10:00", "OUT", "UZS", 999999, "a"), at("2026-10-27T10:00", "IN", "USD", 500, "a")], "USD", { a: "Tovar" });
  assert.deepEqual(parts.map(part => [part.name, part.pct]), [["Tovar", 50], ["—", 20], ["—", 10], ["—", 10], ["Boshqa", 10]]);
  assert.deepEqual(stats.spendByCategory([], "USD", {}), []);
});

test("± change: none without a previous value", () => {
  assert.equal(stats.pctChange(110, 100), 10);
  assert.equal(stats.pctChange(90, 100), -10);
  assert.equal(stats.pctChange(90, 0), null);
});

test("hodim stats: olgan − bergan = debt; the line's last point = debt; % right", () => {
  const rows = [debt("2026-08-10T10:00", "OPENING", 300), debt("2026-09-10T10:00", "DEBT", 700), debt("2026-09-20T10:00", "PAYMENT", 250), debt("2026-10-30T09:00", "PAYMENT", 250, "k1")];
  const all = stats.employeeStats(rows, {}, NOW);
  assert.equal(all.taken - all.given, all.debt);
  assert.equal(all.debt, 500);
  assert.deepEqual([all.takenCount, all.givenCount, all.pct, all.left, all.average, all.monthChange], [2, 2, 50, 500, 250, -250]);
  assert.deepEqual(all.months.map(({ full, a, b, line }) => [full, a, b, line]), [["avg 2026", 300, 0, 300], ["sen 2026", 700, 250, 750], ["okt 2026", 0, 250, 500]]);
  assert.equal(all.months.at(-1).line, all.debt);
  assert.equal(all.lastPayment.kassaEntryId, "k1");
  assert.equal(all.recent[0].kassaEntryId, "k1", "newest first");
  const month = stats.employeeStats(rows, stats.employeeRange({ p: "oy" }, NOW), NOW);
  assert.deepEqual([month.taken, month.given, month.debt, month.months.length, month.months[0].line], [0, 250, 500, 1, 500], "a period narrows the sums, never the debt");
});

test("no division by zero: nothing taken or nothing paid", () => {
  const paidOnly = stats.employeeStats([debt("2026-10-01T10:00", "PAYMENT", 50)], {}, NOW);
  assert.deepEqual([paidOnly.pct, paidOnly.left, paidOnly.debt], [0, 0, -50]);
  const takenOnly = stats.employeeStats([debt("2026-10-01T10:00", "DEBT", 50)], {}, NOW);
  assert.deepEqual([takenOnly.pct, takenOnly.average, takenOnly.lastPayment], [0, 0, null]);
  const empty = stats.employeeStats([], {}, NOW);
  assert.deepEqual([empty.pct, empty.debt, empty.months, empty.since], [0, 0, [], null]);
});

test("the Oy / Yil / Davr chips follow the Tashkent calendar", () => {
  assert.equal(stats.employeeRange({ p: "oy" }, NOW).from.toISOString(), "2026-09-30T19:00:00.000Z");
  assert.equal(stats.employeeRange({ p: "yil" }, NOW).from.toISOString(), "2025-12-31T19:00:00.000Z");
  const range = stats.employeeRange({ p: "davr", from: "2026-10-01", to: "2026-10-01" }, NOW);
  assert.equal(range.to.getTime() - range.from.getTime(), 86_400_000);
  assert.deepEqual(stats.employeeRange({}, NOW), {}, "default: Hammasi");
  assert.deepEqual(stats.employeeRange({ p: "davr", from: "kecha" }, NOW), { from: undefined, to: undefined });
});

test("only SUPER_ADMIN; no new table; charts stay plain SVG/CSS and respect reduced motion", async () => {
  for (const file of ["dokon/page.tsx", "kassa/hodimlar/[id]/page.tsx"]) assert.match(await source(`app/admin/(protected)/${file}`), /await requireRole\("SUPER_ADMIN"\);/, file);
  for (const role of ["SELLER", "WORKSHOP", "STOREKEEPER"]) assert.notEqual(access.roleAccess(role, "/admin/dokon", { method: "GET", headers: { has: () => false } }), "allow", role);
  assert.match(await source("lib/auth/require-admin.ts"), /if \(!hasRole\(user\.role, roles\)\) redirect\("\/admin"\);/);
  const charts = await source("components/admin/kassa/dokon-charts.tsx"), css = await source("components/admin/kassa/kassa.css");
  assert.doesNotMatch(charts, /from "(recharts|chart\.js|d3)/);
  assert.match(charts, /IntersectionObserver/);
  assert.match(charts, /prefers-reduced-motion/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{[^}]*\.dokon-plot i/);
});

const staff = [{ id: "a", name: "Atham", position: null, archived: false, debt: 1500 }, { id: "j", name: "Jasur", position: "Omborchi", archived: false, debt: 300 }, { id: "o", name: "Old", position: null, archived: true, debt: 900 }];
const row = (employeeId, local, type, amount) => ({ employeeId, ...debt(local, type, amount) });
const staffRows = [row("a", "2026-08-01T10:00", "OPENING", 2000), row("a", "2026-10-30T09:00", "PAYMENT", 500), row("j", "2026-10-01T10:00", "DEBT", 300), row("o", "2026-09-01T10:00", "DEBT", 900)];

test("Hodimlar stats: debt = olgan − bergan, equal to the sum of the hodim pages; archived are out; the line ends at the debt", () => {
  const { sums, today, cards, parts } = stats.staffStats(staff, staffRows, {}, NOW);
  assert.deepEqual([sums.taken, sums.takenCount, sums.given, sums.givenCount], [2300, 2, 500, 1]);
  assert.equal(sums.taken - sums.given, 1800);
  assert.equal(sums.debt, 1800);
  assert.equal(sums.months.at(-1).line, 1800);
  assert.equal(sums.debt, ["a", "j"].reduce((sum, id) => sum + stats.employeeStats(staffRows.filter(item => item.employeeId === id), {}, NOW).debt, 0), "the hodim pages add up to it");
  assert.deepEqual(today, { sum: 500, count: 1, people: 1 });
  assert.deepEqual(cards.map(card => [card.id, card.pct, card.trend.length, card.trend.at(-1), card.rising]), [["a", 25, 12, 1500, true], ["j", 0, 12, 300, true]]);
  assert.deepEqual(parts.map(part => [part.name, part.pct]), [["Atham", 83], ["Jasur", 17]]);
  const empty = stats.staffStats([], [], {}, NOW);
  assert.deepEqual([empty.sums.pct, empty.sums.months, empty.parts, empty.cards], [0, [], [], []]);
  const falling = stats.staffStats(staff, [row("a", "2025-01-01T10:00", "DEBT", 100), row("a", "2026-10-01T10:00", "PAYMENT", 100)], {}, NOW);
  assert.equal(falling.cards[0].rising, false);
});

test("donut: no 0% parts; shares stay inside one currency", () => {
  const rows = [at("2026-10-27T10:00", "OUT", "USD", 100000, "a"), at("2026-10-27T10:00", "OUT", "USD", 1, "b"), at("2026-10-27T10:00", "OUT", "UZS", 500, "b")];
  assert.deepEqual(stats.spendByCategory(rows, "USD", { a: "A", b: "B" }).map(part => part.name), ["A"]);
  assert.deepEqual(stats.spendByCategory(rows, "UZS", { a: "A", b: "B" }).map(part => [part.name, part.pct]), [["B", 100]]);
});

test("excludeFromStats: out of kirim / chiqim, chart and donut; the balance still counts it; so‘m sums stay apart", async () => {
  const rows = [at("2026-10-27T10:00", "IN", "USD", 100, "sale"), at("2026-10-27T11:00", "OUT", "USD", 40, "boss"), at("2026-10-27T12:00", "IN", "UZS", 700, "sale"), at("2026-10-27T13:00", "OUT", "UZS", 90, "boss")];
  const flow = stats.statsDays(rows, new Set(["boss"]), "2026-10-27", "2026-10-27");
  assert.deepEqual([flow[0].USD.in, flow[0].USD.out, flow[0].UZS.in, flow[0].UZS.out], [100, 0, 700, 0]);
  const full = kassa.ledger(zero, rows, "2026-10-27", "2026-10-27");
  assert.deepEqual([full[0].USD.end, full[0].UZS.end], [60, 610], "balance unchanged");
  const page = await source("app/admin/(protected)/dokon/page.tsx");
  assert.match(page, /usd = totals\(days, "USD"\), uzs = totals\(days, "UZS"\)/, "balance from the full ledger");
  assert.match(page, /kassaChart\(flow, currency\), parts: spendByCategory\(counted, currency, names\)/);
  assert.match(page, /inOutUzs\.in/);
  assert.match(await readFile(new URL("../prisma/migrations/20261105090000_kassa_category_exclude_stats/migration.sql", import.meta.url), "utf8"), /DEFAULT false;\s*$/, "no category is marked by the migration");
});

test("the net line shares the bars' scale: bars start at the zero line, drawn inside the plot", async () => {
  const css = await source("components/admin/kassa/kassa.css"), charts = await source("components/admin/kassa/dokon-charts.tsx");
  assert.match(css, /\.dokon-plot>button\{[^}]*align-items:flex-start/, "not centred: the bars' zero is the line's zero");
  assert.match(css, /\.dokon-plot svg\{[^}]*overflow:hidden/);
  assert.match(charts, /low < 0 && <div className="dokon-zero"/);
});

test("Hodimlar page: only SUPER_ADMIN", async () => {
  assert.match(await source("app/admin/(protected)/kassa/hodimlar/page.tsx"), /await requireRole\("SUPER_ADMIN"\);/);
});
