import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/leads/stats-rules.ts");
const access = await import("../lib/auth/seller-access.ts");
const read = async file => (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const NOW = new Date("2026-11-10T12:00:00+05:00");
const row = (local, patch = {}) => ({ at: new Date(`${local}+05:00`), source: "INSTAGRAM", status: "NEW", phone: false, product: "Aire 12 HP", price: 4100, n: 1, ...patch });

test("period: default 7 kun, Tashkent day edges (23:59 vs 00:00), equal previous period", () => {
  const p = rules.leadPeriod("bogus", NOW);
  assert.equal(p.key, "7d");
  assert.equal(p.from.toISOString(), new Date("2026-11-04T00:00:00+05:00").toISOString());
  assert.equal(p.to.toISOString(), new Date("2026-11-11T00:00:00+05:00").toISOString());
  assert.equal(p.prevFrom.toISOString(), new Date("2026-10-28T00:00:00+05:00").toISOString());
  assert.equal(p.buckets.length, 7);
  assert.equal(rules.leadPeriod("year", NOW).buckets.length, 12);
  assert.equal(rules.leadPeriod("today", NOW).buckets.length, 24);
  const s = rules.buildLeadStats([row("2026-11-03T23:59"), row("2026-11-04T00:00"), row("2026-11-09T23:59"), row("2026-11-10T00:00")], p);
  assert.equal(s.total, 3, "23:59 of the day before the period is in the previous period");
  assert.equal(s.kpis[1].value, 1, "Bugungi: only 00:00 onwards");
  assert.equal(s.kpis[1].change.text, "▲ 0% kechagiga", "1 today vs 1 yesterday (23:59)");
  assert.equal(s.kpis[0].change.text, "▲ 200% o‘tgan davrga", "3 new vs 1 new before");
  assert.deepEqual(s.series.map(b => b.instagram), [1, 0, 0, 0, 0, 1, 1]);
});

test("sources, statuses, funnel %, products top 6 + Boshqalar, heatmap cell and peak", () => {
  const p = rules.leadPeriod("30d", NOW);
  const rows = [
    row("2026-11-08T20:10", { n: 4 }),
    row("2026-11-08T20:40", { status: "CONTACTED", phone: true, source: "MADINA", n: 2 }),
    row("2026-11-09T09:00", { status: "WON", phone: true, source: "INSTAGRAM_DM", product: "Aire 8 HP", price: 3250 }),
    row("2026-11-09T07:59", { status: "LOST", source: "OTHER", product: "Xolodilnik", price: null }),
    ...["A", "B", "C", "D", "E", "F"].map(name => row("2026-11-07T23:00", { product: name, price: null })),
  ];
  const s = rules.buildLeadStats(rows, p);
  assert.equal(s.total, 14);
  assert.deepEqual(s.kpis.map(k => k.value), [14, 0, 2, 1], "Davrdagi so‘rovlar = all leads of the period");
  assert.deepEqual(s.sources.map(x => [x.key, x.value]), [["instagram", 11], ["site", 2], ["other", 1]]);
  assert.deepEqual(s.funnel.map(f => [f.value, f.pct]), [[14, 100], [4, 29], [3, 21], [1, 7]], "every stage as % of Jami");
  assert.equal(s.answeredPct, 29);
  const phoneFirst = rules.buildLeadStats([row("2026-11-08T10:00", { phone: true, n: 3 }), row("2026-11-08T10:00", { status: "CONTACTED" })], p);
  assert.deepEqual(phoneFirst.funnel.map(f => f.pct), [100, 25, 75, 0], "3 phones of 4 leads = 75%, never over 100");
  assert.deepEqual(s.products[0], { name: "Aire 12 HP · 23.7 kW", price: "$4 100", value: 6 });
  assert.equal(s.products.length, 7);
  assert.deepEqual(s.products[6], { name: "Boshqalar", price: "", value: 3 });
  assert.equal(s.products.find(x => x.name === "Xolodilnik").price, "narxsiz");
  // 2026-11-08 is a Sunday (Yakshanba = row 6); 20:xx → column 12; 07:59 and 23:00 fall outside 08–22.
  assert.equal(s.heat[6][12], 6);
  assert.equal(s.heat[0][1], 1, "Monday 09:00");
  assert.equal(s.heat.flat().reduce((a, b) => a + b, 0), 7);
  assert.equal(s.peakText, "Yakshanba 20:00–21:00");
});

test("empty period: zeros and empty lists, the UI says Ma’lumot yo‘q", async () => {
  assert.match(await read("components/admin/lead-charts.tsx"), /Ma’lumot yo‘q/);
  const s = rules.buildLeadStats([], rules.leadPeriod("today", NOW));
  assert.equal(s.total, 0);
  assert.equal(s.answeredPct, 0);
  assert.deepEqual(s.sources, []);
  assert.deepEqual(s.products, []);
  assert.equal(s.peakText, "");
  assert.ok(s.funnel.every(f => Number.isFinite(f.pct)));
});

test("relative time in the table", () => {
  assert.equal(rules.ago("2026-11-10T06:42:00Z", NOW), "18 daq");
  assert.equal(rules.ago("2026-11-10T04:00:00Z", NOW), "3 soat");
  assert.equal(rules.ago("2026-11-09T18:00:00Z", NOW), "Kecha");
  assert.equal(rules.ago("2026-11-01T10:00:00Z", NOW), "1 noy");
});

test("charts only for staff: same requireAdmin as the list; a SELLER never reaches /admin/leads", async () => {
  const stats = await read("lib/leads/stats.ts");
  assert.match(stats, /export async function getLeadStats[^{]*\{\n\s*await requireAdmin\(\);/);
  assert.ok((await read("app/admin/(protected)/leads/page.tsx")).includes("getLeadStats(period, code)"), "charts follow the list's ?region=");
  const get = { method: "GET", headers: { has: () => false } };
  assert.equal(access.roleAccess("SELLER", "/admin/leads", get), "redirect");
  assert.equal(access.roleAccess("SUPER_ADMIN", "/admin/leads", get), "allow");
});

test("no sideways scroll at 360px and the 1440px grid", async () => {
  const css = await read("components/admin/admin-leads.css");
  assert.doesNotMatch(css, /\.lead-table\{[^}]*min-width/, "table fits the screen");
  assert.match(css, /@media\(max-width:700px\)\{\.lead-hide-m,\.lead-avatar\{display:none\}\.lead-m-only\{display:block!important\}\}\s*$/, "phone hides avatar, phone, source, time and shows 📞 · vaqt under the name (last rule wins)");
  assert.match(css, /\.lc-r2\{display:grid;grid-template-columns:2fr 1fr/);
  assert.match(css, /\.lc-r3\{display:grid;grid-template-columns:1\.1fr 1fr 1fr/);
  assert.match(css, /@media\(max-width:1100px\)\{\.lc-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}[^}]*\}\.lc-r2,\.lc-r3\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.lc \*/);
});

const regions = await import("../lib/dashboard/regions.ts");

test("KPI change: over 300% shows +N ta; Bugungi sparkline = today's hours 08–22", () => {
  const p = rules.leadPeriod("7d", NOW);
  const s = rules.buildLeadStats([row("2026-10-30T10:00"), row("2026-11-08T10:00", { n: 5 }), row("2026-11-10T09:30", { n: 2 }), row("2026-11-10T21:10"), row("2026-11-10T07:00")], p);
  assert.equal(s.kpis[0].name, "Davrdagi so‘rovlar");
  assert.equal(s.kpis[0].change.text, "▲ +8 ta o‘tgan davrga", "9 vs 1 = 800% → absolute");
  assert.equal(s.kpis[1].spark.length, 14);
  assert.equal(s.kpis[1].spark[1], 2, "09:00");
  assert.equal(s.kpis[1].spark[13], 1, "21:00");
  assert.equal(s.kpis[1].spark.reduce((a, b) => a + b, 0), 3, "07:00 is outside 08–22");
});

test("product groups: one Aire model whatever kW was written, winter kW from the table, Katta loyiha one group, price once", () => {
  const line = rules.productLine;
  assert.deepEqual(line("Aire 12 HP · 23.7 kW", 4100), { bare: "Aire 12 HP · 23.7 kW", group: "Aire 12 HP · 23.7 kW", price: "$4 100" });
  assert.equal(line("Aire 12 HP · 35 kW", null).group, "Aire 12 HP · 23.7 kW", "old nominal kW");
  assert.equal(line("Aire 3 HP · 9 kW", null).group, "Aire 3 HP · 6.6 kW");
  assert.equal(line("Aire 6HP", null).group, "Aire 6 HP · 12.5 kW");
  assert.equal(line("Aire 8 HP · 24 kW", null).group, "Aire 8 HP · 15.8 kW");
  assert.deepEqual(line("Aire 6 HP · 12.5 kW — $2 650 (~33.8 mln so'm)", null), { bare: "Aire 6 HP · 12.5 kW", group: "Aire 6 HP · 12.5 kW", price: "$2 650" }, "no \"$2 650 · narxsiz\"");
  assert.equal(line("Aire 20 HP", null).group, "Katta loyiha");
  assert.equal(line("Katta loyiha: ~30 HP · 66 kW", null).group, "Katta loyiha");
  assert.equal(line("Xolodilnik · 100 t", null).price, "narxsiz", "narxsiz only without any price");
  const s = rules.buildLeadStats([row("2026-11-09T10:00", { product: "Aire 12 HP · 35 kW", price: null }), row("2026-11-09T11:00", { product: "Aire 12 HP · 23.7 kW", price: 4100 }), row("2026-11-09T12:00", { product: "Aire 16 HP", price: null }), row("2026-11-09T12:00", { product: "Katta loyiha", price: null })], rules.leadPeriod("7d", NOW));
  assert.deepEqual(s.products, [{ name: "Aire 12 HP · 23.7 kW", price: "$4 100", value: 2 }, { name: "Katta loyiha", price: "narxsiz", value: 2 }]);
});

test("hot lead = has a phone (Telegram delivery no longer counts)", async () => {
  const queries = await read("lib/leads/queries.ts");
  assert.match(queries, /hot:Boolean\(row\.phone\)/);
  assert.doesNotMatch(queries, /telegramPublishedAt/);
});

test("Hudud: only the 13 Uzbek regions or Noma’lum; DB text is normalized for display only", () => {
  const name = regions.leadRegionName;
  assert.equal(name(null, "namanagan"), "Namangan viloyati");
  assert.equal(name(null, "Fargona"), "Farg‘ona viloyati");
  assert.equal(name(null, "test"), "Noma’lum");
  assert.equal(name(null, "asdasd 123"), "Noma’lum");
  assert.equal(name(null, null), "Noma’lum");
  assert.equal(name("UZ-SA", "junk"), "Samarqand viloyati", "the resolved code wins");
  assert.equal(name("UZ-TK", null), "Toshkent viloyati", "Toshkent shahri is counted with the viloyat");
  assert.equal(name("KZ-ALM", "Almaty"), "Noma’lum", "outside Uzbekistan");
  const all = new Set(regions.REGIONS.filter(r => r.country === "UZ").map(r => name(r.code, null)));
  assert.equal(all.size, 13);
});
