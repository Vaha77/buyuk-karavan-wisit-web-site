import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const bot = await import("../lib/sex/bot-text.ts");
const excel = await import("../lib/prays/excel.ts");
const zborka = await import("../lib/sex/zborka.ts");
const rules = await import("../lib/sex/rules.ts");

/** Catalog products named the way the price list describes them, priced from the Bitzer R22 file. */
async function bitzerCatalog(parts = []) {
  const [sheet] = await excel.readPriceWorkbook(new Uint8Array(await readFile(new URL("../docs/design/sex/bitzer-r22-15.07.26.xlsx", import.meta.url))));
  const products = sheet.rows.flatMap(row => {
    const model = row.model.replace(/\s+/g, ""), liters = row.receiverLiters.replace(/\D+/g, "");
    return [
      { id: `${model}-k`, name: `BITZER ${model} kompressor R22`, brand: "BITZER", model, categoryName: "Kompressorlar", basePriceUsd: Number(row.compressorPrice) },
      { id: `${model}-rb`, name: `BITZER ${model} kompressor resiver ustida ${liters}L R22`, brand: "BITZER", model, categoryName: "Kompressorlar", basePriceUsd: Number(row.receiverPrice) },
      { id: `${model}-vd`, name: `BITZER ${model} vadinoy agregat · vadinoy kondensator ${row.waterCondenser} R22`, brand: "BITZER", model, categoryName: "Agregatlar", basePriceUsd: Number(row.waterPrice) },
      { id: `${model}-vz`, name: `BITZER ${model} vazdushniy agregat · ${row.airCondenser} R22`, brand: "BITZER", model, categoryName: "Agregatlar", basePriceUsd: Number(row.airPrice) },
    ];
  });
  return zborka.buildZborkaCatalog(products, parts);
}

test("part prices come from the price list: water condenser = vadinoy − R/B ustida, FN block = vazdushniy − R/B ustida", async () => {
  const catalog = await bitzerCatalog();
  assert.equal(catalog.groups.length, 1);
  const [group] = catalog.groups;
  assert.equal(group.label, "Bitzer R22");
  assert.equal(group.models.length, 19);
  assert.deepEqual(group.hpTable, { 3: 178, 5: 245, 8: 290, 10: 321, 15: 431, 20: 539, 30: 763, 40: 942, 50: 1125 });
  assert.deepEqual(group.fnTable, { FN22: 250, FN43: 403, FN70: 626, FN80: 689, FN105: 833, FN120: 1016, FN160: 1228, FN180: 1381, FNV200: 1646, FNV240: 1900, FNV280: 2254, FNV300: 2411, FNV350: 2675 });
  assert.deepEqual(catalog.receivers, {}, "no receiver prices until the admin enters them");
});

test("zborka quote: standard + Σ(chosen − standard); a receiver swap needs both receiver prices", async () => {
  const catalog = await bitzerCatalog([{ id: "r20", name: "Resiver bachok", size: "20 L", group: "Resiver", basePriceUsd: 305 }, { id: "r30", name: "Resiver bachok 30 L", size: null, group: "Resiver", basePriceUsd: 387 }]);
  const [group] = catalog.groups, model = group.models.find(item => item.key === "4NES+20");
  assert.deepEqual([model.liters, model.hp, model.fn], ["20", "20", "FN160"]);
  const standard = zborka.quoteZborka(model, group, catalog.receivers, { assembly: "vz" });
  assert.deepEqual([standard.ok, standard.base, standard.changes.length, standard.title], [true, 4123, 0, "BITZER 4NES+20 vazdushniy agregat · FN160"]);
  const fnv200 = zborka.quoteZborka(model, group, catalog.receivers, { assembly: "vz", fn: "FNV200" });
  assert.equal(fnv200.base, 4123 + 1646 - 1228);
  assert.deepEqual(fnv200.telegram, ["Resiver: 20 L", "Kondensator: FNV200 (standart FN160 o‘rniga), rama bilan"]);
  const bigger = zborka.quoteZborka(model, group, catalog.receivers, { assembly: "vz", fn: "FNV200", liters: "30" });
  assert.equal(bigger.base, 4123 + 1646 - 1228 + 387 - 305);
  const water = zborka.quoteZborka(model, group, catalog.receivers, { assembly: "vd", hp: "30" });
  assert.equal(water.base, 3434 + 763 - 539);
  assert.deepEqual(zborka.quoteZborka(model, group, catalog.receivers, { assembly: "rb", liters: "45" }), { ok: false, error: "Resiver narxi kiritilmagan" });
  const small = group.models.find(item => item.key === "2FES+3"); // standard 8 L has no receiver price
  assert.deepEqual(zborka.quoteZborka(small, group, catalog.receivers, { assembly: "rb", liters: "20" }), { ok: false, error: "Resiver narxi kiritilmagan" });
  assert.equal(zborka.quoteZborka(small, group, catalog.receivers, { assembly: "k" }).base, 915);
});

test("status machine: NEW→ACCEPTED (Navbatda)→STARTED (Terilmoqda)→ISSUED→RECEIVED, one step at a time, each by its one role", () => {
  const ok = (role, status, action) => rules.checkTransition(role, status, action).ok;
  assert.deepEqual(rules.checkTransition("WORKSHOP", "NEW", "accept"), { ok: true, to: "ACCEPTED" });
  assert.deepEqual(rules.checkTransition("WORKSHOP", "ACCEPTED", "start"), { ok: true, to: "STARTED" });
  assert.deepEqual(rules.checkTransition("WORKSHOP", "STARTED", "issue"), { ok: true, to: "ISSUED" });
  assert.deepEqual(rules.checkTransition("SUPER_ADMIN", "ISSUED", "receive"), { ok: true, to: "RECEIVED" });
  // Every action is allowed from exactly one status, and moves exactly one step forward.
  for (const [action, rule] of Object.entries(rules.TRANSITIONS)) {
    assert.equal(rules.STATUS_ORDER.indexOf(rule.to), rules.STATUS_ORDER.indexOf(rule.from) + 1, action);
    for (const status of rules.STATUS_ORDER) if (status !== rule.from) assert.equal(ok(rule.role, status, action), false, `${action} from ${status}`);
  }
  assert.equal(ok("WORKSHOP", "ACCEPTED", "issue"), false, "Navbatda → Chiqib ketdi needs Terishni boshladim first");
  assert.equal(ok("WORKSHOP", "ISSUED", "receive"), false, "WORKSHOP cannot receive (krim)");
  for (const role of ["SUPER_ADMIN", "ADMIN", "MANAGER", "SELLER"]) for (const [action, from] of [["accept", "NEW"], ["start", "ACCEPTED"], ["issue", "STARTED"]]) assert.equal(ok(role, from, action), false, `${role} cannot ${action}`);
  for (const role of ["ADMIN", "MANAGER", "SELLER", "WORKSHOP"]) assert.equal(ok(role, "ISSUED", "receive"), false, `${role} cannot receive`);
  assert.equal(rules.actionFor("SUPER_ADMIN", "ISSUED"), "receive");
  for (const status of ["NEW", "ACCEPTED", "STARTED"]) assert.equal(rules.actionFor("SUPER_ADMIN", status), null, `SUPER_ADMIN has no workshop button on ${status}`);
  assert.deepEqual(["NEW", "ACCEPTED", "STARTED", "ISSUED"].map(status => rules.actionFor("WORKSHOP", status)), ["accept", "start", "issue", null]);
  assert.equal(rules.actionFor("SELLER", "NEW"), null);
  assert.deepEqual(rules.STATUS_LABEL, { NEW: "Yangi", ACCEPTED: "Navbatda", STARTED: "Terilmoqda", ISSUED: "Chiqib ketdi", RECEIVED: "Krimga olindi", CANCELLED: "Bekor qilingan" });
});

test("visibility: a seller sees only their own orders, the workshop only open tasks", () => {
  assert.deepEqual(rules.orderScope({ id: "s1", role: "SELLER" }), { sellerId: "s1" });
  assert.deepEqual(rules.orderScope({ id: "w", role: "WORKSHOP" }), { status: { in: ["NEW", "ACCEPTED", "STARTED"] } });
  assert.deepEqual(rules.orderScope({ id: "a", role: "SUPER_ADMIN" }), {});
  assert.equal(rules.canViewOrder({ id: "s1", role: "SELLER" }, { sellerId: "s2", status: "NEW" }), false);
  assert.equal(rules.canViewOrder({ id: "s1", role: "SELLER" }, { sellerId: "s1", status: "RECEIVED" }), true);
  assert.equal(rules.canViewOrder({ id: "w", role: "WORKSHOP" }, { sellerId: "s1", status: "STARTED" }), true);
  assert.equal(rules.canViewOrder({ id: "w", role: "WORKSHOP" }, { sellerId: "s1", status: "ISSUED" }), false);
  assert.equal(rules.canCreateOrders("WORKSHOP"), false);
  assert.equal(rules.canCreateOrders("SELLER"), true);
});

test("prices: workshop orders carry only the price-list price (no selling price / markup); WORKSHOP gets no price fields", () => {
  // An older snapshot shape with sale/markup must not leak either.
  const order = { id: "o", number: 413, product: "BITZER 4NES+20 vazdushniy agregat · FNV200", priceSnapshot: { markupPercent: 10, unitBaseUsd: 4541, unitSaleUsd: 4996, totalBaseUsd: 4541, totalSaleUsd: 4996, standardBaseUsd: 4123 }, items: [{ id: "i", title: "x", qty: 1, baseUsd: 4541 }] };
  const workshop = rules.stripPrices(order, "WORKSHOP");
  assert.doesNotMatch(JSON.stringify(workshop), /4541|4996|4123|price|baseUsd|Usd/i);
  for (const role of ["SELLER", "SUPER_ADMIN", "ADMIN"]) {
    const view = rules.stripPrices(order, role);
    assert.deepEqual(view.prices, { unitBaseUsd: 4541, totalBaseUsd: 4541, standardBaseUsd: 4123 }, role);
    assert.equal(view.items[0].baseUsd, 4541, role);
    assert.doesNotMatch(JSON.stringify(view), /sale|markup|ustama|4996/i, `${role}: no selling price or markup`);
  }
  const parts = [{ id: "g", name: "Glazok", size: "3/8", basePriceUsd: 9 }, { id: "r", name: "Resiver bachok", size: "20 L", basePriceUsd: null }];
  const sellerForm = rules.orderFormParts("SELLER", parts);
  assert.deepEqual(sellerForm, [{ id: "g", label: "Glazok 3/8", basePriceUsd: 9 }, { id: "r", label: "Resiver bachok 20 L", basePriceUsd: null }]);
  assert.doesNotMatch(JSON.stringify(sellerForm), /sale|markup/i);
  assert.doesNotMatch(JSON.stringify(rules.orderFormParts("WORKSHOP", parts)), /price|Usd/i);
  assert.equal(rules.priceAccess("WORKSHOP"), "none");
  assert.equal(rules.priceAccess("SELLER"), "base");
});

test("workshop order sources never compute a selling price or markup", async () => {
  for (const file of ["../lib/sex/service.ts", "../app/admin/(sex)/seh/new/page.tsx", "../components/admin/sex/new-order.tsx", "../components/admin/sex/orders-board.tsx", "../app/admin/(sex)/seh/export/route.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /sellPrice|getMarkupPercent|Sotuv narxi|SaleUsd/, file);
  }
});

test("process steps (4 steps) and the 24 h overdue mark", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const issued = { status: "ISSUED", acceptedAt: new Date("2026-10-04T05:00:00Z"), startedAt: new Date("2026-10-04T05:30:00Z"), issuedAt: new Date("2026-10-04T06:00:00Z"), receivedAt: null, acceptedBy: { name: "Ikromjon" }, startedBy: { name: "Ikromjon" }, issuedBy: { name: "Ikromjon" } };
  const steps = rules.processSteps(issued, now);
  assert.deepEqual(steps.map(step => step.label), ["Qabul qildi", "Terishni boshladi", "Chiqarib yubordi", "Krimga oldi"]);
  assert.deepEqual(steps.map(step => step.state), ["done", "done", "done", "wait"]);
  assert.equal(steps[0].text, "Ikromjon · kecha 10:00");
  assert.equal(steps[1].text, "Ikromjon · kecha 10:30");
  assert.deepEqual(rules.processSteps({ ...issued, status: "ACCEPTED", startedAt: null, issuedAt: null }, now).map(step => [step.state, step.text]).slice(1, 3), [["wait", "navbatda"], ["later", "—"]]);
  assert.equal(rules.isReceiveOverdue(issued, now), true);
  assert.equal(rules.isReceiveOverdue({ ...issued, issuedAt: new Date("2026-10-05T01:00:00Z") }, now), false);
  assert.deepEqual(rules.processSteps({ status: "NEW", acceptedAt: null, issuedAt: null, receivedAt: null }, now).map(step => step.state), ["wait", "later", "later", "later"]);
  assert.equal(rules.orderNumber(7), "#0007");
});

test("every Seh action starts with a role guard; WORKSHOP-only and SELLER-only actions check the role", async () => {
  const source = await readFile(new URL("../app/admin/(sex)/seh/actions.ts", import.meta.url), "utf8");
  const all = [...source.matchAll(/export async function (\w+)/g)].map(match => match[1]);
  const guarded = [...source.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\s*const user = await requireSexUser\(\);/g)].map(match => match[1]);
  assert.deepEqual(guarded.sort(), all.sort());
  assert.match(source, /createNoRequestAction[\s\S]*?if \(user\.role !== "WORKSHOP"\)/);
  assert.match(source, /confirmNoRequestAction[\s\S]*?if \(user\.role !== "SELLER"/);
  const prays = await readFile(new URL("../app/admin/(protected)/prays/actions.ts", import.meta.url), "utf8");
  const praysAll = [...prays.matchAll(/export async function (\w+)/g)].length;
  assert.equal([...prays.matchAll(/export async function \w+\([^)]*\)[^{]*\{\s*(?:const actor = )?await requireRole\("SUPER_ADMIN"\);/g)].length, praysAll, "every Prays action is SUPER_ADMIN only");
});

test("configurator: BR +20PG + FNV200 + DD160 = $4 954 at price-list prices, +10 % = $5 450", async () => {
  const configurator = await import("../lib/sex/configurator.ts");
  const p = (id, name, model, base) => ({ id, name, brand: "XUEYING", model, categoryName: null, basePriceUsd: base });
  const products = [
    p("k20", "XUEYING BR +20PG kompressor", "BR +20PG", 880), p("k25", "XUEYING BR +25PG kompressor", "BR +25PG", 1220), p("kz", "XUEYING BR −25PZ kompressor", "BR −25PZ", 1260),
    p("a20", "XUEYING BR +20PG vazdushniy agregat FN160", "BR +20PG", 2413), p("a25", "XUEYING BR +25PG vazdushniy agregat FN160", "BR +25PG", 3253), p("az", "XUEYING BR −25PZ vazdushniy agregat FNV200", "BR −25PZ", 3293),
    p("t20", "XUEYING BR +20PG vazdushniy agregat komplekti FN160 DD160", "BR +20PG", 4454), p("t25", "XUEYING BR +25PG vazdushniy agregat komplekti FN160 DD200", "BR +25PG", 5600), p("tz", "XUEYING BR −25PZ vazdushniy agregat komplekti FNV200 DJ170", "BR −25PZ", 6316),
  ];
  const templates = configurator.buildKitTemplates(products);
  const template = templates.find(item => item.id === "t20");
  assert.ok(template);
  const standard = configurator.standardSelection(template);
  assert.equal(configurator.kitTotal(template, standard).base, 4454, "standard parts add up to the kit price");
  const option = (slot, key) => template.options[slot].find(item => item.key === key);
  assert.equal(option("cond", "FN160").price, 1533);
  assert.equal(option("cond", "FN160").source, "XUEYING BR +20PG agregat FN160 $2 413 − XUEYING BR +20PG kompressor $880 = $1 533");
  assert.equal(option("cond", "FNV200").price, 2033);
  assert.equal(option("evap", "DD160").price, 2041);
  assert.equal(option("evap", "DD200").price, 2347);
  assert.equal(option("evap", "DJ170").price, 3023);
  assert.deepEqual(template.options.cond.map(item => item.key), ["FN160", "FNV200"], "standard first");
  const custom = configurator.kitTotal(template, { comp: "BR+20PG", cond: "FNV200", evap: "DD160" });
  assert.equal(custom.base, 4954);
  assert.equal(configurator.kitClientPrice(custom.base, 10), 5450);
  assert.equal(configurator.kitClientPrice(custom.base, 0), 4954);
  assert.equal(configurator.kitClientPrice(custom.base, 99), configurator.kitClientPrice(custom.base, 15), "markup is capped at 15 %");
  assert.equal(configurator.kitTotal(template, standard, [100, -5, NaN]).base, 4554, "extras add at price-list prices");
});

test("“Sehda ishlanmoqda” timer text and the overdue mark", async () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const ago = minutes => new Date(now.getTime() - minutes * 60_000);
  assert.equal(rules.workingSince(ago(35), now), "35 daqiqadan beri");
  assert.equal(rules.workingSince(ago(0), now), "1 daqiqadan beri");
  assert.equal(rules.workingSince(ago(135), now), "2 soat 15 daqiqadan beri");
  assert.equal(rules.workingSince(ago(120), now), "2 soatdan beri");
  assert.equal(rules.workingSince(ago(27 * 60), now), "1 kun 3 soatdan beri");
  assert.equal(rules.workingSince(ago(48 * 60 + 10), now), "2 kundan beri");
  assert.equal(rules.daysPastDue(null, now), 0);
  assert.equal(rules.daysPastDue("2026-10-05", now), 0, "due today is not late");
  assert.equal(rules.daysPastDue("2026-10-04", now), 1);
  assert.equal(rules.daysPastDue("2026-10-09", now), 0);
  assert.equal(rules.daysPastDue("2026-10-04", new Date("2026-10-04T20:00:00Z")), 1, "Tashkent day (UTC+5)");
  const css = await readFile(new URL("../components/admin/sex/sex.css", import.meta.url), "utf8");
  assert.match(css, /@keyframes sx-wave-fill\{0%\{width:8%\}50%\{width:72%\}100%\{width:8%\}\}/);
  assert.match(css, /@keyframes sx-wrench\{0%,100%\{transform:rotate\(-18deg\)\}50%\{transform:rotate\(18deg\)\}\}/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.sx-wave-fill,\.sx-wrench\{animation:none\}/);
});

test("loading screens: each section has its own skeleton; shimmer, bar and spinner respect reduced motion", async () => {
  const expected = { "app/admin/(sex)/seh/loading.tsx": "SexListSkeleton", "app/admin/(sex)/seh/new/loading.tsx": "SexNewSkeleton", "app/admin/(protected)/loading.tsx": "GenericSkeleton", "app/admin/(protected)/prays/loading.tsx": "PraysSkeleton", "app/admin/(protected)/customers/loading.tsx": "CustomersSkeleton", "app/admin/(protected)/sales-plan/loading.tsx": "SalesPlanSkeleton", "app/admin/(seller)/my/loading.tsx": "MySkeleton", "app/admin/loading.tsx": "ShellSkeleton" };
  for (const [file, component] of Object.entries(expected)) assert.match(await readFile(new URL(`../${file}`, import.meta.url), "utf8"), new RegExp(`<${component}/>`), file);
  const css = await readFile(new URL("../components/admin/feedback.css", import.meta.url), "utf8");
  assert.match(css, /\.admin-nav-progress\{position:fixed;top:0;left:0;z-index:1000;height:3px;width:0;background:#1E4E8C/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.sk::after,\.admin-nav-progress\{animation:none/);
});

test("“Sex” → “Seh”: pages live under /admin/seh and old /admin/sex links redirect with 308", async () => {
  const access = await import("../lib/auth/seller-access.ts");
  assert.equal(access.homeFor("WORKSHOP"), "/admin/seh");
  assert.ok(access.isSellerPathAllowed("/admin/seh/new"));
  const config = (await import("../next.config.ts")).default;
  const redirects = await config.redirects();
  assert.deepEqual(redirects, [
    { source: "/admin/sex", destination: "/admin/seh", permanent: true },
    { source: "/admin/sex/:path*", destination: "/admin/seh/:path*", permanent: true },
  ]);
  for (const file of ["../app/admin/(sex)/seh/page.tsx", "../app/admin/(sex)/seh/new/page.tsx", "../app/admin/(sex)/seh/export/route.ts"]) await readFile(new URL(file, import.meta.url));
});


test("queue numbers: Navbatda orders 1, 2, 3… by acceptance time; starting one renumbers the rest", () => {
  const at = minute => new Date(Date.UTC(2026, 9, 9, 4, minute));
  const orders = [
    { id: "c", status: "ACCEPTED", acceptedAt: at(30) }, { id: "a", status: "ACCEPTED", acceptedAt: at(10) },
    { id: "n", status: "NEW", acceptedAt: null }, { id: "b", status: "ACCEPTED", acceptedAt: at(20) }, { id: "s", status: "STARTED", acceptedAt: at(5) },
  ];
  assert.deepEqual([...rules.queuePositions(orders)], [["a", 1], ["b", 2], ["c", 3]]);
  const afterStart = orders.map(order => order.id === "a" ? { ...order, status: "STARTED" } : order);
  assert.deepEqual([...rules.queuePositions(afterStart)], [["b", 1], ["c", 2]]);
  assert.equal(rules.queuePositions([]).size, 0);
});

test("daily “terish boshlandi” counter resets at the start of the Tashkent day; the limit only warns", () => {
  // 18:59 UTC = 23:59 Tashkent; 19:00 UTC = 00:00 next Tashkent day.
  assert.equal(rules.tashkentDayStart(new Date("2026-10-09T18:59:00Z")).toISOString(), "2026-10-08T19:00:00.000Z");
  assert.equal(rules.tashkentDayStart(new Date("2026-10-09T19:00:00Z")).toISOString(), "2026-10-09T19:00:00.000Z");
  const started = ["2026-10-09T03:00:00Z", "2026-10-09T18:30:00Z", "2026-10-08T18:59:00Z", null];
  assert.equal(rules.startedToday(started, new Date("2026-10-09T18:59:00Z")), 2, "before midnight Tashkent: today's two");
  assert.equal(rules.startedToday(started, new Date("2026-10-09T19:00:00Z")), 0, "at 00:00 Tashkent the counter is back to zero");
  assert.deepEqual(rules.dailyCapView(3, 5), { tone: "normal", note: "2 ta joy bor" });
  assert.deepEqual(rules.dailyCapView(5, 5), { tone: "red", note: "kunlik limit" });
  assert.deepEqual(rules.dailyCapView(7, 5), { tone: "red", note: "kunlik limit" });
  assert.equal(rules.checkTransition("WORKSHOP", "ACCEPTED", "start").ok, true, "the limit never blocks a start");
});

test("WORKSHOP panel payload: no price fields; the panel component never reads prices", async () => {
  const row = { id: "o", number: "#0418", status: "STARTED", queue: null, priceSnapshot: { unitBaseUsd: 4541, totalBaseUsd: 4541, standardBaseUsd: 4123 }, items: [{ id: "i", title: "x", qty: 1, baseUsd: 4541 }] };
  assert.doesNotMatch(JSON.stringify(rules.stripPrices(row, "WORKSHOP")), /4541|4123|price|baseUsd|Usd/i);
  const board = await readFile(new URL("../components/admin/sex/workshop-board.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(board, /formatUsd|baseUsd|BaseUsd|priceSnapshot|\.prices/);
  const page = await readFile(new URL("../app/admin/(sex)/seh/page.tsx", import.meta.url), "utf8");
  assert.match(page, /listOrders\(user, month, view\)/, "rows go through listOrders → stripPrices(role)");
});


const botOrder = (patch = {}) => ({
  id: "abcdefghij12", number: 418, type: "AGREGAT", purpose: "CLIENT", customerName: "Rustam aka", qty: 1, dueDate: new Date("2026-10-12T00:00:00Z"), note: null,
  sellerName: "Abduraxmon", noRequest: false, status: "NEW", startedAt: null, issuedAt: null, issuedByName: null,
  details: ["Resiver: 20 L"], items: [{ title: "BITZER 4NES+20 vazdushniy agregat · FNV200", qty: 1 }], ...patch,
});

test("seh bot: personal message and the one next button per stage; never a price", () => {
  const text = bot.personalMessage(botOrder(), null);
  assert.equal(text, "🔧 Yangi zakaz #0418 · Agregat\nBITZER 4NES+20 vazdushniy agregat · FNV200 ×1\nResiver: 20 L\nKimga: Mijoz — Rustam aka · Sotuvchi: Abduraxmon · Muddat: 12-okt");
  assert.match(bot.personalMessage(botOrder({ status: "ACCEPTED" }), 2), /\n\n📋 Navbatda: 2-o‘rin$/);
  assert.match(bot.personalMessage(botOrder({ status: "STARTED", startedAt: new Date("2026-10-09T04:40:00Z") }), null), /\n\n🔧 Terilmoqda · 09:40 dan$/);
  assert.match(bot.personalMessage(botOrder({ status: "ISSUED", issuedAt: new Date("2026-10-09T10:40:00Z") }), null), /\n\n✅ Chiqib ketdi 15:40$/);
  const zap = bot.personalMessage(botOrder({ type: "ZAPCHAST", note: "Shoshilinch", items: [{ title: "Vibro shlang F28", qty: 10 }, { title: "Glazok 3/8", qty: 2 }] }), null);
  assert.match(zap, /^📦 Yangi zayavka #0418 · Zapchast\nVibro shlang F28 ×10\nGlazok 3\/8 ×2\n/);
  assert.match(zap, /\nIzoh: Shoshilinch$/);
  assert.doesNotMatch(zap + text, /Resiver: 20 L[\s\S]*Resiver/, "agregat details only for agregat");
  for (const message of [text, zap]) assert.doesNotMatch(message, /\$|narx|usd/i);
  const button = status => bot.personalKeyboard("abcdefghij12", status).inline_keyboard[0]?.[0] ?? null;
  assert.deepEqual(["NEW", "ACCEPTED", "STARTED", "ISSUED", "RECEIVED"].map(status => button(status)?.text ?? null), ["✅ Qabul qildim", "🔧 Terishni boshladim", "📦 Chiqib ketdi", null, null]);
  assert.deepEqual(["NEW", "ACCEPTED", "STARTED"].map(status => button(status).callback_data), ["seh:accept:abcdefghij12", "seh:start:abcdefghij12", "seh:issue:abcdefghij12"]);
  assert.equal(bot.limitQuestion(5), "Bugun 5 ta boshlangan. Baribir boshlaysizmi?");
  assert.deepEqual(bot.limitKeyboard("abcdefghij12").inline_keyboard[0].map(item => [item.text, item.callback_data]), [["Ha", "seh:startok:abcdefghij12"], ["Yo‘q", "seh:startno:abcdefghij12"]]);
});

test("seh bot buttons go through the same transition rule as the site (one step, WORKSHOP only)", () => {
  for (const [data, step, from] of [["seh:accept:abcdefghij12", "accept", "NEW"], ["seh:start:abcdefghij12", "start", "ACCEPTED"], ["seh:startok:abcdefghij12", "start", "ACCEPTED"], ["seh:issue:abcdefghij12", "issue", "STARTED"]]) {
    const parsed = bot.parseSehCallback(data);
    assert.equal(parsed.orderId, "abcdefghij12");
    const action = parsed.action === "startok" ? "start" : parsed.action;
    assert.equal(action, step);
    assert.equal(rules.checkTransition("WORKSHOP", from, action).ok, true);
    for (const role of ["SUPER_ADMIN", "ADMIN", "MANAGER", "SELLER"]) assert.equal(rules.checkTransition(role, from, action).ok, false, `${role} via bot`);
  }
  assert.equal(bot.parseSehCallback("seh:receive:abcdefghij12"), null, "krim is never a bot button");
  assert.equal(bot.parseSehCallback("claim:abcdefghij12"), null, "lead buttons are not seh buttons");
  assert.deepEqual(rules.checkTransition("WORKSHOP", "ACCEPTED", "accept"), { ok: false, error: "Bu zakaz allaqachon “Navbatda” holatida." }, "second press");
});

test("seh bot: an unlinked or non-WORKSHOP Telegram account is refused; every bot step is audited as “Telegram orqali”", async () => {
  const handlers = await readFile(new URL("../lib/sex/bot-handlers.ts", import.meta.url), "utf8");
  assert.match(handlers, /findUnique\(\{ where: \{ telegramChatId: String\(telegramUserId\) \} \}\)/);
  assert.match(handlers, /user\.role === "WORKSHOP" && user\.isActive && user\.approvalStatus === "APPROVED"/);
  assert.match(handlers, /if \(!user\) \{ await answer\(DENIED, true\); return true; \}/);
  assert.match(handlers, /transitionOrder\(user, orderId, step, undefined, "telegram"\)/);
  const service = await readFile(new URL("../lib/sex/service.ts", import.meta.url), "utf8");
  assert.match(service, /via === "telegram" \? " \(Telegram orqali\)" : ""/);
  const route = await readFile(new URL("../app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  assert.match(route, /validSecret\(request\.headers\.get\("x-telegram-bot-api-secret-token"\)\)/, "webhook secret_token is checked");
  assert.equal(bot.parseStartPayload("/start seh_0123456789abcdef01234567"), "0123456789abcdef01234567");
  assert.equal(bot.parseStartPayload("/start"), null, "plain /start stays the lead bot's registration");
  assert.equal(bot.parseStartPayload("/start ref_123"), null);
});

test("Seh group gets only the ISSUED report (no buttons, no price)", async () => {
  const report = bot.groupIssuedMessage(botOrder({ status: "ISSUED", issuedAt: new Date("2026-10-09T10:40:00Z"), issuedByName: "Ikromjon" }));
  assert.equal(report, "✅ Sehdan chiqdi #0418\nBITZER 4NES+20 vazdushniy agregat · FNV200 ×1\nKimga: Mijoz — Rustam aka\nZayavka bergan: Abduraxmon\nSeh mas’uli: Ikromjon\nChiqdi: 09-okt 15:40");
  const zap = bot.groupIssuedMessage(botOrder({ status: "ISSUED", type: "ZAPCHAST", noRequest: true, purpose: "SHOP", issuedByName: "Ikromjon", items: [{ title: "Vibro shlang F28", qty: 10, issuedQty: 8 }, { title: "Glazok 3/8", qty: 2 }] }));
  assert.equal(zap, "✅ Sehdan chiqdi #0418\nVibro shlang F28 ×8\nGlazok 3/8 ×2\nKimga: Magazin (vitrina)\nZayavka bergan: Abduraxmon\nSeh mas’uli: Ikromjon\n⚠️ Zayavkasiz chiqim");
  const delivery = await readFile(new URL("../lib/sex/bot.ts", import.meta.url), "utf8");
  assert.match(delivery, /if \(!chatId \|\| order\.status !== "ISSUED"\) return;/, "group report only for ISSUED");
  assert.equal((delivery.match(/telegramWorkshopChatId\(\)/g) ?? []).length, 2, "the group chat is used only by the report and its test");
  assert.doesNotMatch(delivery.slice(delivery.indexOf("async function sendGroupReport"), delivery.indexOf("/** Sends the personal message")), /Keyboard|inline_keyboard/);
});

test("lead bot texts and buttons are unchanged", async () => {
  const messages = await readFile(new URL("../lib/telegram/messages.ts", import.meta.url), "utf8");
  assert.match(messages, /Siz BKLead tizimida faol sotuvchisiz\./);
  const service = await readFile(new URL("../lib/telegram/service.ts", import.meta.url), "utf8");
  assert.match(service, /\{text:"🙋 Mijozni olish",callback_data:`claim:\$\{leadId\}`\}/);
  assert.match(service, /if\(await handleSehCallback\(update\.callback_query\)\)return;if\(await claimLead\(update\.callback_query,metrics\)\)return;await handleCrmCallback\(update\.callback_query\);/);
  const crm = await readFile(new URL("../lib/telegram/crm.ts", import.meta.url), "utf8");
  assert.match(crm, /callback_data: `contact:\$\{leadId\}`/);
  const route = await readFile(new URL("../app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  assert.match(route, /answerCallbackQuery\(update\.callback_query\.id, "So‘rov qabul qilindi\."\)/, "lead buttons are still acknowledged up front");
});


test("Seh group send (mocked Telegram): sends once; on migrate_to_chat_id resends to the new id and logs it; errors become readable", async () => {
  const group = await import("../lib/sex/group-send.ts");
  const calls = [], logs = [];
  const ok = async (chatId, text) => { calls.push([chatId, text]); return { chat: { id: Number(chatId) }, message_id: 77 }; };
  assert.deepEqual(await group.sendToGroup(ok, "-4313815181", "🔧 Test: seh guruhi ulandi", message => logs.push(message)), { ok: true, chatId: "-4313815181", messageId: 77 });
  assert.deepEqual(calls, [["-4313815181", "🔧 Test: seh guruhi ulandi"]]);
  assert.deepEqual(logs, []);

  calls.length = 0;
  const migrating = async (chatId, text) => {
    calls.push([chatId, text]);
    if (chatId === "-4313815181") throw Object.assign(new Error("Telegram sendMessage failed"), { name: "TelegramApiError", description: "Bad Request: group chat was upgraded to a supergroup chat", migrateToChatId: "-1001234567890" });
    return { chat: { id: Number(chatId) }, message_id: 78 };
  };
  const moved = await group.sendToGroup(migrating, "-4313815181", "✅ Sehdan chiqdi #0418", message => logs.push(message));
  assert.deepEqual(moved, { ok: true, chatId: "-1001234567890", messageId: 78, migratedTo: "-1001234567890" });
  assert.deepEqual(calls.map(call => call[0]), ["-4313815181", "-1001234567890"], "resent once with the new id");
  assert.deepEqual(logs, ["Guruh ID o‘zgardi: -1001234567890 — Vercel'da yangilang (TELEGRAM_WORKSHOP_CHAT_ID)"]);

  const failing = description => async () => { throw Object.assign(new Error("Telegram sendMessage failed"), { name: "TelegramApiError", description }); };
  assert.deepEqual(await group.sendToGroup(failing("Bad Request: chat not found"), "-1", "x", () => {}), { ok: false, error: "chat not found — chat ID noto‘g‘ri yoki bot guruhga qo‘shilmagan" });
  assert.match((await group.sendToGroup(failing("Forbidden: bot is not a member of the group chat"), "-1", "x", () => {})).error, /^bot guruhda emas/);
  assert.equal(group.describeTelegramError(Object.assign(new Error("TELEGRAM_BOT_TOKEN is not configured"), { name: "TelegramConfigError" })), "Bot token yoki TELEGRAM_WORKSHOP_CHAT_ID sozlanmagan");
  const delivery = await readFile(new URL("../lib/sex/bot.ts", import.meta.url), "utf8");
  assert.match(delivery, /sendToGroup\(sendMessage, chatId, "🔧 Test: seh guruhi ulandi"\)/);
  assert.doesNotMatch(delivery, /-4313815181/, "the chat id is never hard-coded");
});

test("workflow buttons work only in the linked user's own private chat; the group test is SUPER_ADMIN only; unlinking is audited", async () => {
  const handlers = await readFile(new URL("../lib/sex/bot-handlers.ts", import.meta.url), "utf8");
  assert.match(handlers, /callback\.message\.chat\.type !== "private" \|\| String\(callback\.message\.chat\.id\) !== user\.telegramChatId/);
  const settings = await readFile(new URL("../app/admin/(protected)/settings/actions.ts", import.meta.url), "utf8");
  assert.match(settings, /sendSehGroupTestAction\(\)[^\n]*\r?\n\s*await requireRole\("SUPER_ADMIN"\);\r?\n\s*return sendGroupTest\(\);/);
  const users = await readFile(new URL("../app/admin/(protected)/users/actions.ts", import.meta.url), "utf8");
  assert.match(users, /unlinkUserTelegramAction\(userId:string\)[^\n]*?\{const actor=await requireRole\("SUPER_ADMIN"\)/);
  assert.match(users, /createUserTelegramLinkAction\(userId:string\)[^\n]*?\{const actor=await requireRole\("SUPER_ADMIN"\)/);
  assert.match(users, /if\(!form\.has\("telegramChatId"\)\)return undefined;/, "saving a user row never wipes a bot binding");
});

test("bug #0001: the site button payload for every stage passes validation; ACCEPTED → STARTED → ISSUED → RECEIVED end to end", async () => {
  const validation = await import("../lib/sex/validation.ts");
  // Exactly what the buttons send (orders-board / workshop-board → transitionOrderAction).
  for (const action of ["accept", "start", "issue", "receive"]) {
    const parsed = validation.transitionInputSchema.safeParse({ id: "cm0abcdefghij0001", action });
    assert.equal(parsed.success, true, `${action} must be accepted by the server action`);
  }
  assert.deepEqual([...rules.ORDER_ACTIONS].sort(), Object.keys(rules.TRANSITIONS).sort(), "validation follows TRANSITIONS");
  const unknown = validation.transitionInputSchema.safeParse({ id: "x", action: "finish" });
  assert.equal(unknown.success, false);
  assert.equal(validation.transitionInputError(unknown.error), "Noma’lum amal: finish.", "a readable reason instead of “So‘rov noto‘g‘ri”");
  assert.equal(validation.transitionInputSchema.safeParse({ id: "x", action: "issue", issuedQty: { item: 3 } }).success, true);

  // An old order (created before STARTED existed, no startedAt) walks the whole chain with the WORKSHOP role.
  let order = { id: "cm0abcdefghij0001", status: "ACCEPTED", acceptedAt: new Date("2026-10-05T13:12:00Z"), startedAt: null, issuedAt: null };
  for (const [role, action, next] of [["WORKSHOP", "start", "STARTED"], ["WORKSHOP", "issue", "ISSUED"], ["SUPER_ADMIN", "receive", "RECEIVED"]]) {
    const check = rules.checkTransition(role, order.status, action);
    assert.deepEqual(check, { ok: true, to: next }, `${order.status} --${action}--> ${next}`);
    order = { ...order, status: check.to };
  }
  assert.deepEqual(rules.checkTransition("WORKSHOP", "STARTED", "start"), { ok: false, error: "Bu zakaz allaqachon “Terilmoqda” holatida." });
  assert.equal(rules.checkTransition("SUPER_ADMIN", "ACCEPTED", "start").ok, false, "only WORKSHOP starts");

  // The Telegram "Terishni boshladim" goes through the same transitionOrder (no separate schema to fall behind).
  const handlers = await readFile(new URL("../lib/sex/bot-handlers.ts", import.meta.url), "utf8");
  assert.match(handlers, /const step = action === "startok" \? "start" : action;\s*const result = await transitionOrder\(user, orderId, step, undefined, "telegram"\);/);
  const actions = await readFile(new URL("../app/admin/(sex)/seh/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /transitionInputSchema\.safeParse\(raw\)/);
  assert.doesNotMatch(actions, /z\.enum\(\["accept"/, "no hand-written action list left");
});

test("new order → personal messages to linked WORKSHOP chats, never the group; the group only gets ISSUED", async () => {
  const linked = ["1001", "1002"];
  // Creating an agregat / zapchast order: DMs to every linked seh mas'uli, nothing to the group.
  assert.deepEqual(bot.deliveryPlan({ status: "NEW", noRequest: false }, linked, []), { personal: ["1001", "1002"], group: false });
  assert.deepEqual(bot.deliveryPlan({ status: "NEW", noRequest: false }, [], []), { personal: [], group: false }, "nobody linked: saved on the site only");
  assert.deepEqual(bot.deliveryPlan({ status: "NEW", noRequest: false }, linked, ["1001"]), { personal: ["1002"], group: false }, "no duplicates");
  // Later stages edit what was sent; only ISSUED reaches the group.
  assert.deepEqual(bot.deliveryPlan({ status: "ACCEPTED", noRequest: false }, linked, ["1001"]), { personal: [], group: false });
  assert.deepEqual(bot.deliveryPlan({ status: "STARTED", noRequest: false }, linked, ["1001"], true), { personal: ["1002"], group: false }, "qayta yuborish fills gaps");
  assert.deepEqual(bot.deliveryPlan({ status: "ISSUED", noRequest: false }, linked, ["1001", "1002"]), { personal: [], group: true });
  assert.deepEqual(bot.deliveryPlan({ status: "ISSUED", noRequest: true }, linked, []), { personal: [], group: true }, "zayavkasiz chiqim: only the final report");

  // Mocked delivery following the plan: sendMessage is called for the DMs only.
  const calls = [];
  const send = async chatId => { calls.push(chatId); return { message_id: 1, chat: { id: Number(chatId) } }; };
  const plan = bot.deliveryPlan({ status: "NEW", noRequest: false }, linked, []);
  for (const chatId of plan.personal) await send(chatId);
  if (plan.group) await send("-4313815181");
  assert.deepEqual(calls, ["1001", "1002"]);
  assert.ok(!calls.includes("-4313815181"), "the group is never messaged for a new order");

  const delivery = await readFile(new URL("../lib/sex/bot.ts", import.meta.url), "utf8");
  assert.match(delivery, /if \(plan\.group\) \{ try \{ await sendGroupReport\(order\); \}/, "the group report is sent only when the plan says so");
  const form = await readFile(new URL("../components/admin/sex/new-order.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(form, /guruhiga yuborildi|seh guruhi/i);
  assert.match(form, /✓ \$\{number\} seh mas’uliga yuborildi/);
  assert.match(form, /"✓ Sehga yuborildi"/);
  assert.match(form, /saytda saqlandi, lekin seh mas’uli Telegramga ulanmagan/);
  assert.match(form, /"⚠️ Telegramga yuborilmadi"/);
  assert.match(form, /Telegram · seh mas’uli/);
});


test("double submit: two fast clicks with the same requestId create one order", async () => {
  const { createOnce } = await import("../lib/sex/idempotency.ts");
  const store = [];
  const unique = error => error?.code === "P2002";
  const find = async requestId => store.find(order => order.requestId === requestId) ?? null;
  // Insert with a unique requestId, as the database does; a small delay lets both submits pass the first check.
  const create = requestId => async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    if (store.some(order => order.requestId === requestId)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const order = { id: `o${store.length + 1}`, number: store.length + 2, requestId };
    store.push(order);
    return order;
  };
  const [first, second] = await Promise.all([createOnce("req-1", find, create("req-1"), unique), createOnce("req-1", find, create("req-1"), unique)]);
  assert.equal(store.length, 1, "one order");
  assert.equal(first.value.id, second.value.id);
  assert.deepEqual([first.repeated, second.repeated].sort(), [false, true]);
  const later = await createOnce("req-1", find, create("req-1"), unique);
  assert.equal(later.repeated, true, "a retry of the same submit gets the same order");
  assert.equal(store.length, 1);
  await createOnce("req-2", find, create("req-2"), unique);
  assert.equal(store.length, 2, "a new submit (new requestId) is a new order");
  await assert.rejects(createOnce(null, find, async () => { throw new Error("boom"); }, unique), /boom/, "other errors are not swallowed");

  const form = await readFile(new URL("../components/admin/sex/new-order.tsx", import.meta.url), "utf8");
  assert.match(form, /if \(submittingRef\.current\) return;\s*submittingRef\.current = true;/, "the second click is ignored before React re-renders");
  assert.match(form, /disabled=\{pending \|\| !ready \|\| !!duplicate\} aria-busy=\{pending\}/);
  const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /requestId\s+String\?\s+@unique/);
});

test("the same order again within 10 minutes asks “Baribir yana yuborasizmi?”; after confirmation it is created", () => {
  const now = new Date("2026-10-09T11:55:00Z");
  const base = { sellerId: "s1", type: "AGREGAT", purpose: "CLIENT", customerId: null, customerName: "Rustam aka", qty: 1, items: [{ ref: "p1", title: "BITZER 4NES+20 vazdushniy agregat · FNV200", qty: 1 }] };
  const earlier = { ...base, number: 2, status: "NEW", createdAt: new Date("2026-10-09T11:54:00Z"), customerName: "  rustam   AKA " };
  const found = rules.findDuplicate(base, [earlier], now);
  assert.equal(found?.number, 2, "same seller, goods, customer, quantity (name case/spaces ignored)");
  assert.equal(rules.duplicateWarning(found, now), "⚠️ Bu zakaz 1 daqiqa oldin yuborilgan (#0002). Baribir yana yuborasizmi?");
  assert.equal(rules.findDuplicate(base, [{ ...earlier, createdAt: new Date("2026-10-09T11:44:00Z") }], now), null, "older than 10 minutes");
  assert.equal(rules.findDuplicate({ ...base, qty: 2 }, [earlier], now), null, "different quantity");
  assert.equal(rules.findDuplicate({ ...base, sellerId: "s2" }, [earlier], now), null, "another seller");
  assert.equal(rules.findDuplicate({ ...base, purpose: "SHOP" }, [earlier], now), null, "another recipient");
  assert.equal(rules.findDuplicate(base, [{ ...earlier, status: "CANCELLED" }], now), null, "a cancelled order is no duplicate");
  const zap = { sellerId: "s1", type: "ZAPCHAST", purpose: "SHOP", customerId: null, customerName: null, qty: 1, items: [{ ref: "g", title: "", qty: 2 }, { ref: "v", title: "", qty: 10 }] };
  assert.equal(rules.findDuplicate(zap, [{ ...zap, items: [{ ref: "v", title: "Vibro shlang F28", qty: 10 }, { ref: "g", title: "Glazok 3/8", qty: 2 }], number: 5, status: "ACCEPTED", createdAt: now }], now)?.number, 5, "item order does not matter");
});

test("cancel: seller only their own NEW order; SUPER_ADMIN until it leaves the workshop, with a reason; soft, never deleted", async () => {
  assert.deepEqual(rules.checkCancel("SELLER", "NEW", true, null), { ok: true });
  assert.equal(rules.checkCancel("SELLER", "NEW", false, null).ok, false, "not someone else's order");
  for (const status of ["ACCEPTED", "STARTED", "ISSUED", "RECEIVED"]) assert.equal(rules.checkCancel("SELLER", status, true, null).ok, false, `seller cannot cancel ${status}`);
  for (const status of ["NEW", "ACCEPTED", "STARTED"]) assert.deepEqual(rules.checkCancel("SUPER_ADMIN", status, false, "Mijoz fikridan qaytdi"), { ok: true });
  assert.deepEqual(rules.checkCancel("SUPER_ADMIN", "NEW", false, " "), { ok: false, error: "Bekor qilish sababini yozing." });
  for (const status of ["ISSUED", "RECEIVED"]) assert.equal(rules.checkCancel("SUPER_ADMIN", status, false, "sabab").ok, false, `not after ${status}`);
  for (const role of ["ADMIN", "MANAGER", "WORKSHOP"]) assert.equal(rules.checkCancel(role, "NEW", true, "sabab").ok, false, `${role} cannot cancel`);
  assert.deepEqual(rules.checkCancel("SUPER_ADMIN", "CANCELLED", false, "x"), { ok: false, error: "Bu zakaz allaqachon bekor qilingan." });
  assert.equal(rules.checkTransition("WORKSHOP", "CANCELLED", "accept").ok, false, "a cancelled order cannot move on");
  assert.equal(rules.canCancel("SELLER", "NEW", true), true);
  assert.equal(rules.canCancel("SELLER", "ACCEPTED", true), false);

  // Telegram: the personal message becomes "❌ #0003 bekor qilindi" without buttons; nothing to the group.
  const cancelled = botOrder({ number: 3, status: "CANCELLED", cancelReason: "Mijoz fikridan qaytdi" });
  assert.match(bot.personalMessage(cancelled, null), /\n\n❌ #0003 bekor qilindi · Sabab: Mijoz fikridan qaytdi$/);
  assert.deepEqual(bot.personalKeyboard(cancelled.id, "CANCELLED").inline_keyboard, []);
  assert.deepEqual(bot.deliveryPlan({ status: "CANCELLED", noRequest: false }, ["1001"], ["1001"]), { personal: [], group: false });

  const service = await readFile(new URL("../lib/sex/service.ts", import.meta.url), "utf8");
  assert.match(service, /data: \{ status: "CANCELLED", cancelledById: actor\.id, cancelledAt: new Date\(\), cancelReason: cleanReason \}/);
  assert.doesNotMatch(service, /workshopOrder\.delete/, "no hard delete");
  const queries = await readFile(new URL("../lib/sex/queries.ts", import.meta.url), "utf8");
  assert.match(queries, /status: cancelled \? "CANCELLED" : \{ not: "CANCELLED" \}/, "hidden by default, shown under “Bekor qilingan”");
});

test("plain /start: a chat bound to a profile is never registered as a seller; two /start make one record", async () => {
  const start = await import("../lib/telegram/start-rules.ts");
  assert.deepEqual(start.startDecision({ name: "Vaha", role: "SUPER_ADMIN" }, null), { kind: "menu", profile: { name: "Vaha", role: "SUPER_ADMIN" } });
  assert.equal(start.startDecision({ name: "Vaha", role: "SUPER_ADMIN" }, { isApproved: false, isActive: true }).kind, "menu", "even if an old seller record exists");
  assert.deepEqual(start.startDecision(null, { isApproved: false, isActive: true }), { kind: "agent", approved: false });
  assert.deepEqual(start.startDecision(null, { isApproved: true, isActive: true }), { kind: "agent", approved: true });
  assert.deepEqual(start.startDecision(null, null), { kind: "register" });

  // The webhook flow with an in-memory store (unique telegramUserId, like the database).
  const agents = [], replies = [];
  const profiles = new Map([["777", { name: "Vaha", role: "SUPER_ADMIN" }]]);
  const press = async userId => {
    const decision = start.startDecision(profiles.get(userId) ?? null, agents.find(agent => agent.telegramUserId === userId) ?? null);
    if (decision.kind === "menu") { replies.push([userId, "menu"]); return; }
    if (decision.kind === "agent") { replies.push([userId, decision.approved ? "approved" : "pending"]); return; }
    await new Promise(resolve => setTimeout(resolve, 2));
    if (agents.some(agent => agent.telegramUserId === userId)) return; // P2002 → the other /start already answered
    agents.push({ telegramUserId: userId, isApproved: false, isActive: true });
    replies.push([userId, "registered"]);
  };
  await press("777");
  assert.equal(agents.length, 0, "Super Admin's /start creates no seller record");
  assert.deepEqual(replies, [["777", "menu"]]);
  await Promise.all([press("555"), press("555")]);
  assert.equal(agents.length, 1, "two quick /start → one record");
  assert.deepEqual(replies.filter(reply => reply[0] === "555"), [["555", "registered"]], "and one reply");
  await press("555");
  assert.deepEqual(replies.at(-1), ["555", "pending"], "a later /start says it is waiting, no new record");
  assert.equal(agents.length, 1);

  assert.match(start.profileMenuText({ name: "Ikromjon", role: "WORKSHOP" }, "https://x"), /\/navbat[\s\S]*\/bugun/);
  assert.match(start.profileMenuText({ name: "Vaha", role: "SUPER_ADMIN" }, "https://x"), /Admin menyu:[\s\S]*https:\/\/x\/admin/);
  assert.match(start.profileMenuText({ name: "Ali", role: "SELLER" }, "https://x"), /Sotuvchi menyusi/);
  assert.equal(start.linkedText({ name: "Ikromjon", role: "WORKSHOP" }, null).split("\n")[0], "✅ Ulandingiz: Ikromjon, Seh mas’uli");
  assert.match(start.linkedText({ name: "Ikromjon", role: "WORKSHOP" }, "Test sehdan"), /Bu Telegram avval Test sehdan ga bog‘langan edi, endi Ikromjon ga o‘tkazildi\./);

  const service = await readFile(new URL("../lib/telegram/service.ts", import.meta.url), "utf8");
  assert.match(service, /const decision=startDecision\(profile\?\.isActive\?profile:null,agent\);/);
  assert.match(service, /\(error as \{code\?:string\}\)\.code==="P2002"\)return true;/, "a racing second /start does not reply again");
  assert.doesNotMatch(service, /salesAgent\.upsert/, "no blind upsert on /start");
  const link = await readFile(new URL("../lib/sex/bot.ts", import.meta.url), "utf8");
  assert.match(link, /updateMany\(\{ where: \{ telegramChatId: chatId, NOT: \{ id: user\.id \} \}, data: \{ telegramChatId: null \} \}\)/, "one chat = one profile");
  const users = await readFile(new URL("../app/admin/(protected)/users/actions.ts", import.meta.url), "utf8");
  assert.match(users, /deletePendingAgentAction\(agentId:string\)[^\n]*?\{const actor=await requireRole\("SUPER_ADMIN"\)/, "stray records are deleted only by the Super Admin's click");
});
