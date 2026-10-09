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
  assert.deepEqual(rules.STATUS_LABEL, { NEW: "Yangi", ACCEPTED: "Navbatda", STARTED: "Terilmoqda", ISSUED: "Chiqib ketdi", RECEIVED: "Krimga olindi" });
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
  assert.match(page, /listOrders\(user, month\)/, "rows go through listOrders → stripPrices(role)");
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
