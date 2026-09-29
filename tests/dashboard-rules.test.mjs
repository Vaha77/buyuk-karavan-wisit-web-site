import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/dashboard/rules.ts");
const format = await import("../lib/dashboard/format.ts");
const period = await import("../lib/dashboard/period.ts");
const regions = await import("../lib/dashboard/regions.ts");
const referral = await import("../lib/referrals/rules.ts");

const NB = " ";

test("uz formatting is deterministic", () => {
  assert.equal(format.formatInt(1240), `1${NB}240`);
  assert.equal(format.formatPercent(2.3), "2,3%");
  assert.equal(format.formatPercent(3), "3%");
  assert.equal(format.formatUsd(18400), `$18${NB}400`);
  assert.equal(format.formatUsdK(18400), "18,4k");
  assert.equal(format.formatDuration(72), "1:12");
  const now = new Date("2026-09-29T10:00:00Z");
  assert.equal(format.formatRelative(new Date("2026-09-29T09:48:00Z"), now), "12 daqiqa oldin");
  assert.equal(format.formatRelative(new Date("2026-09-29T07:00:00Z"), now), "3 soat oldin");
  assert.equal(format.formatRelative(new Date("2026-09-28T09:00:00Z"), now), "kecha");
});

test("period: default 30 days in Tashkent time, previous period of equal length", () => {
  const now = new Date("2026-09-29T20:30:00Z"); // 30 Sep 01:30 in Tashkent
  const p = period.resolvePeriod({}, now);
  assert.equal(p.key, "30d");
  assert.equal(p.to.toISOString(), "2026-09-30T19:00:00.000Z");
  assert.equal(p.to.getTime() - p.from.getTime(), 30 * 86_400_000);
  assert.equal(p.prevTo.getTime(), p.from.getTime());
  assert.equal(p.from.getTime() - p.prevFrom.getTime(), 30 * 86_400_000);
  const custom = period.resolvePeriod({ range: "custom", from: "2026-09-01", to: "2026-09-10" }, now);
  assert.equal(custom.days, 10);
  assert.equal(period.periodQuery(custom), "?range=custom&from=2026-09-01&to=2026-09-10");
  assert.equal(period.resolvePeriod({ range: "custom", from: "bad" }, now).key, "30d");
  assert.equal(period.resolvePeriod({ range: "year" }, now).from.toISOString(), "2025-12-31T19:00:00.000Z");
});

test("Uzbekistan map: top 3 navy, bottom 3 orange, middle on the blue scale, zero grey", () => {
  const items = [["A", 50], ["B", 40], ["C", 30], ["D", 20], ["E", 10], ["F", 5], ["G", 3], ["H", 2], ["I", 1], ["J", 0]].map(([code, count]) => ({ code, count }));
  const tones = rules.uzbekistanTones(items);
  assert.deepEqual(["A", "B", "C"].map(code => tones[code]), ["top", "top", "top"]);
  assert.deepEqual(["G", "H", "I"].map(code => tones[code]), ["low", "low", "low"]);
  assert.equal(tones.J, "none");
  assert.equal(tones.D, "b1");
  assert.ok(["b2", "b3"].includes(tones.F));
  const few = rules.uzbekistanTones([{ code: "A", count: 3 }, { code: "B", count: 1 }, { code: "C", count: 0 }]);
  assert.deepEqual(few, { A: "top", B: "top", C: "none" });
});

test("foreign country and all-countries tones", () => {
  assert.deepEqual(rules.foreignTones([{ code: "KZ-YUZ", count: 5 }, { code: "KZ-ALM", count: 2 }, { code: "KZ-AST", count: 0 }]), { "KZ-YUZ": "top", "KZ-ALM": "b2", "KZ-AST": "none" });
  const tones = rules.countryTones([["UZ", 219], ["KZ", 18], ["KG", 11], ["TJ", 9], ["TM", 4], ["AF", 3]].map(([code, count]) => ({ code, count })));
  assert.deepEqual(tones, { UZ: "top", KZ: "b1", KG: "b2", TJ: "b2", TM: "low", AF: "low" });
  const { rows, withoutLeads } = rules.rankingRows([{ code: "UZ", count: 219 }, { code: "AF", count: 3 }, { code: "TM", count: 0 }], rules.countryTones([{ code: "UZ", count: 219 }, { code: "AF", count: 3 }, { code: "TM", count: 0 }]));
  assert.deepEqual(rows.map(row => [row.code, row.rank, row.badge]), [["UZ", 1, "TOP"], ["AF", 2, null]]);
  assert.equal(withoutLeads, 1);
});

test("funnel: percent of the first stage and the largest absolute drop", () => {
  const { rows, biggest } = rules.buildFunnel([{ key: "a", label: "Lid keldi", count: 264 }, { key: "b", label: "Bog‘lanildi", count: 164 }, { key: "c", label: "Hisob-kitob qilindi", count: 58 }, { key: "d", label: "Tijorat taklifi", count: 31 }, { key: "e", label: "Sotuv", count: 6 }]);
  assert.equal(Math.round(rows[1].percent), 62);
  assert.deepEqual(biggest, { from: "Bog‘lanildi", to: "Hisob-kitob qilindi", lost: 106 });
  assert.equal(rules.funnelLevel({ status: "NEW", hasOffer: false, saleApproved: false }), 0);
  assert.equal(rules.funnelLevel({ status: "CONTACTED", hasOffer: false, saleApproved: false }), 1);
  assert.equal(rules.funnelLevel({ status: "IN_PROGRESS", hasOffer: false, saleApproved: false }), 2);
  assert.equal(rules.funnelLevel({ status: "IN_PROGRESS", hasOffer: true, saleApproved: false }), 3);
  assert.equal(rules.funnelLevel({ status: "WON", hasOffer: false, saleApproved: true }), 4);
});

test("regular customers: yearly ranking, missing months and gap to 3rd place", () => {
  const month = values => [...values, ...Array(12 - values.length).fill(null)];
  const customers = [
    { id: "a", name: "Mijoz A", regionCode: "UZ-NG", months: month([5000, 6000, 5000, 5000, 5000, 5000, 5000, 5000]) },
    { id: "b", name: "Mijoz B", regionCode: "UZ-AN", months: month([4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000]) },
    { id: "c", name: "Mijoz C", regionCode: null, months: month([3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000]) },
    { id: "d", name: "Mijoz D", regionCode: null, months: month([2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000]) },
    { id: "e", name: "Mijoz E", regionCode: null, months: month([1000, 1000, 1000, 1000, 1000, 1000, 1000]) },
  ];
  const rows = rules.rankCustomers(customers, 2026, { year: 2026, month: 9 });
  assert.deepEqual(rows.map(row => [row.id, row.place, row.total]), [["a", 1, 41000], ["b", 2, 32000], ["c", 3, 24000], ["d", 4, 16000], ["e", 5, 7000]]);
  assert.deepEqual(rows[0].status, { text: "To‘liq", tone: "ok" });
  assert.deepEqual(rows[3].status, { text: `3-o‘ringa $8${NB}000`, tone: "gap" });
  assert.deepEqual(rows[4].status, { text: "Avgust kiritilmagan", tone: "missing" });
  assert.deepEqual(rules.requiredMonths(2025, { year: 2026, month: 9 }).length, 12);
  assert.deepEqual(rules.previewRank(customers, "d", 9, 9000), { rank: 3, previousRank: 4, total: 25000 });
});

test("regions: unique codes, free-text matching mirrors the SQL backfill", () => {
  const codes = regions.REGIONS.map(region => region.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(regions.regionsOf("UZ").length, 14);
  for (const [text, code] of [["Samarqand viloyati", "UZ-SA"], ["namanagan", "UZ-NG"], ["qoqon", "UZ-FA"], ["Toshkent shahri", "UZ-TK"], ["Toshkent viloyati", "UZ-TO"], ["Qoraqalpog‘iston Respublikasi", "UZ-QR"], ["dsdsds", null], ["", null]]) assert.equal(regions.matchRegionText(text), code, text);
});

test("map data: every region polygon has a known code and Uzbek name", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const view of ["uz", "kz", "kg", "tj", "tm", "af"]) {
    const map = JSON.parse(await readFile(new URL(`../lib/dashboard/maps/${view}.json`, import.meta.url), "utf8"));
    for (const region of map.regions) assert.ok(regions.REGION_BY_CODE.has(region.code), `${view}: ${region.code}`);
    assert.equal(map.regions.length, regions.regionsOf(view.toUpperCase()).length, view);
  }
  const all = JSON.parse(await readFile(new URL("../lib/dashboard/maps/all.json", import.meta.url), "utf8"));
  assert.deepEqual(all.regions.map(region => region.code), ["UZ", "KZ", "KG", "TJ", "TM", "AF"]);
});

test("referral slugs, targets, UTM and bots", () => {
  assert.equal(referral.suggestSlug("YouTube — MrBeast videosi"), "youtube-mrbeast-videosi");
  assert.equal(referral.suggestSlug("Farg‘ona bloger"), "fargona-bloger");
  assert.equal(referral.isValidSlug("mrbeast"), true);
  for (const slug of ["ab", "-abc", "abc-", "Abc", "a_b_c", "a--b", "x".repeat(41)]) assert.equal(referral.isValidSlug(slug), false, slug);
  assert.equal(referral.safeTargetPath("/#aloqa"), "/#aloqa");
  for (const bad of ["https://evil.com", "//evil.com", "/admin", "/api/track", "/r/x"]) assert.equal(referral.safeTargetPath(bad), null, bad);
  assert.equal(referral.withUtm("/#aloqa", "mrbeast"), "/?utm_source=mrbeast&utm_medium=referral&utm_campaign=mrbeast#aloqa");
  assert.equal(referral.withUtm("/products?category=dd", "x1y"), "/products?category=dd&utm_source=x1y&utm_medium=referral&utm_campaign=x1y");
  assert.equal(referral.isBot("TelegramBot (like TwitterBot)"), true);
  assert.equal(referral.isBot("WhatsApp/2.23.20.0"), true);
  assert.equal(referral.isBot("facebookexternalhit/1.1"), true);
  assert.equal(referral.isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"), false);
  assert.equal(referral.deviceFromUserAgent("Mozilla/5.0 (Linux; Android 14; SM-S911B) Mobile Safari/537.36"), "MOBILE");
  assert.equal(referral.deviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0)"), "TABLET");
});

test("visit outcome is the furthest stage and never goes down", () => {
  assert.equal(referral.upgradeOutcome("LEAD", "INTERESTED"), "LEAD");
  assert.equal(referral.upgradeOutcome("LEFT", "CONTACT_ATTEMPT"), "CONTACT_ATTEMPT");
  assert.equal(referral.outcomeForEvent("PAGEVIEW", 10), "LEFT");
  assert.equal(referral.outcomeForEvent("HEARTBEAT", 30), "INTERESTED");
  assert.equal(referral.outcomeForEvent("PRODUCT_VIEW", 0), "INTERESTED");
  assert.equal(referral.outcomeForEvent("MADINA_OPEN", 0), "CONTACT_ATTEMPT");
  assert.equal(referral.conversion(38, 1240).toFixed(1), "3.1");
  assert.equal(referral.costPerLead(500, 38).toFixed(1), "13.2");
  assert.equal(referral.costPerLead(null, 38), null);
});
