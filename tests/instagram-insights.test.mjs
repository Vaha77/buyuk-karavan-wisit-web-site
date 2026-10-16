import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import ExcelJS from "exceljs";

register("./ts-resolve.mjs", import.meta.url);
const s = await import("../lib/instagram/insights-rules.ts");
const { buildStatsWorkbook } = await import("../lib/instagram/stats-excel.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("ER = total_interactions / reach × 100; % change against the previous period", () => {
  assert.equal(s.engagementRate(450, 10_000), 4.5);
  assert.equal(s.engagementRate(1, 3), 33.3);
  assert.equal(s.engagementRate(10, 0), null, "no reach → no ER");
  assert.equal(s.engagementRate(null, 100), null);
  assert.equal(s.changePercent(120, 100), 20);
  assert.equal(s.changePercent(80, 100), -20);
  assert.equal(s.changePercent(5, 0), null, "nothing to compare with");
  assert.equal(s.changePercent(null, 100), null);
  assert.equal(s.changePercent(1, 3), -66.7);
});

test("periods: today / 7 / 30 / 90 days in Tashkent time, with the previous period of the same length", () => {
  const now = new Date("2026-10-11T20:30:00Z"); // 01:30 on 12 Oct in Tashkent
  const week = s.periodRange("7", now);
  assert.equal(week.to, "2026-10-12");
  assert.equal(week.from, "2026-10-06");
  assert.equal(week.days.length, 7);
  assert.equal(week.prevTo, "2026-10-05");
  assert.equal(week.prevFrom, "2026-09-29");
  const today = s.periodRange("today", now);
  assert.deepEqual(today.days, ["2026-10-12"]);
  assert.deepEqual(today.previous, ["2026-10-11"]);
  assert.equal(s.periodRange("90", now).days.length, 90);
  assert.equal(s.dayStartUtc("2026-10-12").toISOString(), "2026-10-11T19:00:00.000Z");
  assert.equal(s.formatDayUz("2026-10-11"), "11-okt 2026");
  assert.equal(s.formatDayUz("2026-01-05", true), "5-yan");
  assert.equal(s.formatNumber(90550), "90 550");
  assert.equal(s.formatNumber(1234567), "1 234 567");
  assert.equal(s.formatNumber(4.5, 1), "4,5");
  assert.equal(s.formatNumber(-1200), "−1 200");
  assert.equal(s.formatNumber(null), "—");
});

test("funnel: each step's conversion from the previous one; missing sales stay 'no data'", () => {
  const steps = s.funnel([
    { key: "views", label: "Ko‘rishlar", value: 90_550 },
    { key: "comments", label: "Kommentlar", value: 905 },
    { key: "price", label: "Narx so‘raganlar", value: 300 },
    { key: "direct", label: "Direct", value: 120 },
    { key: "leads", label: "Lidlar", value: 30 },
    { key: "sales", label: "Sotuvlar", value: null, note: "ma’lumot yo‘q" },
  ]);
  assert.deepEqual(steps.map(step => step.conversion), [null, 1, 33.1, 40, 25, null]);
  assert.equal(s.funnel([{ key: "a", label: "a", value: 0 }, { key: "b", label: "b", value: 5 }])[1].conversion, null, "no division by zero");
});

test("Graph parsing: totals, demographics breakdowns, link taps, follows / unfollows, media kind", () => {
  const totals = { data: [{ name: "reach", period: "day", total_value: { value: 1200 } }, { name: "views", total_value: { value: 5400 } }, { name: "likes", values: [{ value: 77 }] }, { name: "saves" }] };
  assert.deepEqual(s.parseTotals(totals), { reach: 1200, views: 5400, likes: 77 }, "a metric without data stays absent (not 0)");
  const country = { data: [{ name: "follower_demographics", period: "lifetime", total_value: { breakdowns: [{ dimension_keys: ["country"], results: [{ dimension_values: ["UZ"], value: 820 }, { dimension_values: ["KZ"], value: 90 }, { dimension_values: ["RU"], value: 45 }] }] } }] };
  assert.deepEqual(s.parseBreakdown(country), { UZ: 820, KZ: 90, RU: 45 });
  const city = { data: [{ total_value: { breakdowns: [{ dimension_keys: ["city"], results: [{ dimension_values: ["Namangan, Namangan Region"], value: 300 }, { dimension_values: ["Tashkent, Tashkent"], value: 200 }] }] } }] };
  const cities = s.shares(s.parseBreakdown(city));
  assert.equal(cities.total, 500);
  assert.deepEqual(cities.rows.map(row => [s.cityName(row.key), row.percent]), [["Namangan", 60], ["Tashkent", 40]]);
  assert.deepEqual(s.parseBreakdown({ data: [] }), {});
  assert.deepEqual(s.parseBreakdown(null), {});
  const age = s.shares({ "25-34": 50, "18-24": 30, "35-44": 20 }, s.AGE_ORDER.filter(key => ["25-34", "18-24", "35-44"].includes(key)));
  assert.deepEqual(age.rows.map(row => row.key), ["25-34", "18-24", "35-44"]);
  assert.deepEqual(s.linkTaps({ CALL: 4, DIRECTION: 2, TEXT: 1 }), { linkTaps: 7, callTaps: 4, directionTaps: 2, emailTaps: null, textTaps: 1 });
  assert.equal(s.linkTaps({}).linkTaps, null);
  assert.deepEqual(s.followsFrom({ FOLLOWER: 25, NON_FOLLOWER: 6 }), { follows: 25, unfollows: 6 });
  assert.equal(s.mediaKind({ media_type: "VIDEO", permalink: "https://www.instagram.com/reel/abc/" }), "REELS");
  assert.equal(s.mediaKind({ media_type: "IMAGE", permalink: "https://www.instagram.com/p/abc/" }), "POST");
  assert.equal(s.mediaKind({ media_type: "IMAGE" }, true), "STORY");
  assert.equal(s.needsInsightsReconnect(["instagram_business_basic"]), true);
  assert.equal(s.needsInsightsReconnect([]), true, "older connections did not store scopes");
  assert.equal(s.needsInsightsReconnect(["instagram_business_basic", "instagram_business_manage_insights"]), false);
  assert.equal(s.needsInsightsReconnect(["instagram_business_manage_insights"], "2026-10-11: #10 Application does not have permission"), true);
  assert.equal(s.DEMOGRAPHIC_TIMEFRAME, "this_month", "last_30_days is not supported since v20.0");
});

test("best time heatmap (Tashkent, Monday first) and content types", () => {
  const heat = s.activityHeatmap([new Date("2026-10-12T05:10:00Z"), new Date("2026-10-12T05:40:00Z"), new Date("2026-10-18T15:00:00Z")]);
  assert.equal(heat.grid[0][10], 2, "Monday 10:00 Tashkent");
  assert.equal(heat.grid[6][20], 1, "Sunday 20:00");
  assert.deepEqual(heat.best, { day: 0, hour: 10 });
  assert.equal(s.activityHeatmap([]).best, null);
  const types = s.contentTypes([{ mediaId: "1", type: "REELS", reach: 1000, totalInteractions: 50, leads: 2 }, { mediaId: "2", type: "REELS", reach: 3000, totalInteractions: 150, leads: 1 }, { mediaId: "3", type: "POST", reach: null, totalInteractions: null, leads: 0 }]);
  assert.deepEqual(types[0], { type: "REELS", count: 2, avgReach: 2000, er: 5, leads: 3 });
  assert.deepEqual(types[1], { type: "POST", count: 1, avgReach: null, er: null, leads: 0 });
  assert.equal(types[2].count, 0);
});

test("Excel: the workbook has the KPI, daily, post and audience sheets with the numbers", async () => {
  const board = {
    period: "7", range: { from: "2026-10-06", to: "2026-10-12", days: ["2026-10-11", "2026-10-12"] },
    kpis: [{ key: "reach", label: "Qamrov", value: 12000, previous: 10000, change: 20 }, { key: "er", label: "ER%", value: 4.5, previous: null, change: null }],
    funnel: s.funnel([{ key: "views", label: "Ko‘rishlar", value: 1000 }, { key: "sales", label: "Sotuvlar", value: null, note: "ma’lumot yo‘q" }]),
    kinds: { PRICE: 5, POSITIVE: 3, QUESTION: 1, NEGATIVE: 0, SPAM: 2 },
    daily: [{ day: "2026-10-11", likes: 10, comments: 2, direct: 1 }, { day: "2026-10-12", likes: 12, comments: 3, direct: 0 }],
    posts: [{ id: "m1", type: "REELS", postedAt: "2026-10-10T08:00:00.000Z", caption: "Agregat", permalink: "https://www.instagram.com/reel/x/", views: 900, reach: 800, likes: 40, comments: 5, saved: 3, shares: 2, avgWatchMs: 7300, totalInteractions: 50, er: 6.3, direct: 2, leads: 1 }],
    audience: { date: "2026-10-12", timeframe: "this_month", follower: { country: { UZ: 820, KZ: 90 } }, engaged: { gender: { F: 10, M: 30 } } },
  };
  const buffer = await buildStatsWorkbook(board).xlsx.writeBuffer();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  assert.deepEqual(book.worksheets.map(sheet => sheet.name), ["Umumiy", "Kunlik", "Postlar", "Auditoriya"]);
  const summary = book.getWorksheet("Umumiy");
  assert.equal(summary.getCell("A2").value, "Davr: 6-okt 2026 — 12-okt 2026");
  assert.deepEqual([summary.getCell("A3").value, summary.getCell("B3").value, summary.getCell("C3").value, summary.getCell("D3").value], ["Qamrov", 12000, 10000, 20]);
  const days = book.getWorksheet("Kunlik");
  assert.deepEqual(days.getRow(2).values.slice(1), ["11-okt 2026", 10, 2, 1]);
  const posts = book.getWorksheet("Postlar");
  assert.equal(posts.getCell("A2").value, "Reels");
  assert.equal(posts.getCell("K2").value, 7.3, "average watch time in seconds");
  assert.equal(posts.getCell("M2").value, 1);
  const audience = book.getWorksheet("Auditoriya");
  assert.deepEqual(audience.getRow(2).values.slice(1), ["Obunachilar", "country", "UZ", 820]);
  assert.equal(audience.rowCount, 5);
});

test("wiring: insights scope, daily cron, map precomputed for the server, additive migration", async () => {
  const rules = await read("../lib/instagram/rules.ts");
  assert.match(rules, /"instagram_business_manage_insights"/);
  const vercel = JSON.parse(await read("../vercel.json"));
  assert.ok(vercel.crons.some(cron => cron.path === "/api/cron/instagram-insights" && cron.schedule === "0 1 * * *"), "06:00 Tashkent");
  for (const cron of vercel.crons) assert.match(cron.schedule, /^\d+ \d+ \* \* \*$/, "Hobby: daily only");
  const map = JSON.parse(await read("../lib/instagram/world-map.json"));
  assert.deepEqual(map.countries.map(item => item.code).sort(), ["AF", "KG", "KZ", "RU", "TJ", "TM", "UZ"]);
  assert.equal(map.neighbours.length, 9);
  for (const item of [...map.countries, ...map.neighbours]) assert.match(item.d, /^M[\d.-]/);
  const board = await read("../components/admin/instagram/stats-board.tsx");
  assert.doesNotMatch(board, /^"use client"/, "map rendered on the server");
  assert.doesNotMatch(board, /d3-geo|topojson/, "no geo library at runtime");
  const migration = await read("../prisma/migrations/20261018090000_add_instagram_insights/migration.sql");
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), /\bDROP\b|DELETE FROM|\bTRUNCATE\b|ALTER COLUMN/i);
  const insights = await read("../lib/instagram/insights.ts");
  assert.doesNotMatch(insights, /console\.\w+\([^\n]*token/i, "no tokens in logs");
});

test("comments come from Instagram (daily insight, else the period's posts), not the webhook journal", async () => {
  assert.deepEqual(s.instagramComments([{ comments: 4 }, { comments: null }, { comments: 6 }], [{ comments: 99 }]), { value: 10, source: "account" });
  assert.deepEqual(s.instagramComments([{ comments: null }], [{ comments: 7 }, { comments: 5 }, { comments: null }]), { value: 12, source: "media" }, "comments_count / media insights when the daily metric is empty");
  assert.deepEqual(s.instagramComments([], []), { value: null, source: null });
  const queries = await read("../lib/instagram/stats-queries.ts");
  assert.match(queries, /instagramComments\(days, media\)/);
  assert.doesNotMatch(queries, /kpi\("comments", "Kommentlar", comments\.length/, "KPI not from the webhook journal");
  assert.match(queries, /comments: statsByDay\.get\(day\)\?\.comments/, "daily chart from Instagram");
  assert.match(queries, /groupBy\(\{ by: \["kind"\], where: own, _count/, "kinds: the accounts whole journal");
  const graph = await read("../lib/instagram/graph.ts");
  assert.match(graph, /listMediaSince[\s\S]*comments_count/);
  const board = await read("../components/admin/instagram/stats-board.tsx");
  assert.match(board, /Avto-javob tizimi ishga tushgandan beri/);
});

test("follower growth: follows_and_unfollows (FOLLOWER = followed) against the followers_count history", () => {
  assert.deepEqual(s.followsFrom({ FOLLOWER: 25, NON_FOLLOWER: 6, UNKNOWN: 2 }), { follows: 25, unfollows: 6 }, "UNKNOWN is not counted");
  const day = (date, followersCount, follows, unfollows) => ({ date, followersCount, follows, unfollows });
  // Count on the 10th = 1000, on the 13th = 1012: the follows of the 10th–12th (13th not yet in the count).
  const ok = s.followerGrowthCheck([day("2026-10-10", 1000, 5, 1), day("2026-10-11", null, 6, 2), day("2026-10-12", null, 4, 0), day("2026-10-13", 1012, 30, 0)]);
  assert.deepEqual(ok, { countNet: 12, reportedNet: 12, from: "2026-10-10", to: "2026-10-13", mismatch: false, swapped: false });
  const swapped = s.followerGrowthCheck([day("2026-10-10", 1000, 1, 20), day("2026-10-11", 1019, 0, 0)]);
  assert.equal(swapped.mismatch, true);
  assert.equal(swapped.swapped, true, "FOLLOWER / NON_FOLLOWER read the wrong way round");
  const off = s.followerGrowthCheck([day("2026-10-10", 1000, 10, 0), day("2026-10-11", 1100, null, null)]);
  assert.equal(off.mismatch, true);
  assert.equal(off.swapped, false);
  assert.equal(s.followerGrowthCheck([day("2026-10-10", 1000, 10, 0), day("2026-10-11", 1009, 0, 0)]).mismatch, false, "small lag is tolerated");
  assert.equal(s.followerGrowthCheck([day("2026-10-10", 1000, null, null), day("2026-10-11", 1010, 3, 0)]).reportedNet, null, "a day without follows → no comparison");
  assert.equal(s.followerGrowthCheck([day("2026-10-10", 1000, 5, 0)]).countNet, null, "one count is not a history");
  assert.equal(s.growthPercent(1040, 90550), 1.2);
  assert.equal(s.growthPercent(null, 100), null);
  assert.equal(s.growthPercent(-5, 0), null);
});

test("Statistika design: block order, colours, map scale and audience switch as in the design file", async () => {
  const board = await read("../components/admin/instagram/stats-board.tsx");
  const css = await read("../components/admin/instagram/instagram.css");
  await read("../docs/design/instagram/instagram-statistika.dc.html");
  const order = ["<Kpis", "<Funnel", "<DailyChart", "<Kinds", "<CountryMap", "<Demographics", "<Heatmap", "<ContentTypes", "<TopPosts", "<Growth"].map(tag => board.indexOf(`${tag} `) >= 0 ? board.indexOf(`${tag} `) : board.indexOf(`${tag}/`));
  assert.ok(order.every(index => index > 0), "every block rendered");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "design order");
  assert.match(board, /#1E4E8C/);
  assert.match(board, /#E8792B/);
  assert.match(board, /rgba\(30,78,140,/, "dark-blue map scale");
  assert.match(board, /Davlatlar bo‘yicha auditoriya/);
  assert.match(board, /igs-map-name/, "country name and % on the map");
  const client = await read("../components/admin/instagram/stats-client.tsx");
  assert.match(client, />Obunachilar</);
  assert.match(client, />Reaksiya beruvchilar</);
  assert.match(css, /--igs-navy:#1E4E8C/);
  assert.match(board, /\["today", "7", "30", "90"\]/, "Bugun first");
  assert.doesNotMatch(board, /Namuna ma/, "real data, no sample badge");
});
