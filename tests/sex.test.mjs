import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
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

test("status machine: only NEW→ACCEPTED→ISSUED→RECEIVED, each step by its one role", () => {
  const ok = (role, status, action) => rules.checkTransition(role, status, action).ok;
  assert.deepEqual(rules.checkTransition("WORKSHOP", "NEW", "accept"), { ok: true, to: "ACCEPTED" });
  assert.deepEqual(rules.checkTransition("WORKSHOP", "ACCEPTED", "issue"), { ok: true, to: "ISSUED" });
  assert.deepEqual(rules.checkTransition("SUPER_ADMIN", "ISSUED", "receive"), { ok: true, to: "RECEIVED" });
  assert.equal(ok("WORKSHOP", "ISSUED", "receive"), false, "WORKSHOP cannot receive (krim)");
  for (const role of ["SUPER_ADMIN", "ADMIN", "MANAGER", "SELLER"]) {
    assert.equal(ok(role, "NEW", "accept"), false, `${role} cannot accept`);
    assert.equal(ok(role, "ACCEPTED", "issue"), false, `${role} cannot issue`);
  }
  for (const role of ["ADMIN", "MANAGER", "SELLER", "WORKSHOP"]) assert.equal(ok(role, "ISSUED", "receive"), false, `${role} cannot receive`);
  assert.equal(ok("WORKSHOP", "NEW", "issue"), false, "no skipping ACCEPTED");
  assert.equal(ok("WORKSHOP", "ACCEPTED", "accept"), false, "no repeat");
  assert.equal(ok("SUPER_ADMIN", "ACCEPTED", "receive"), false, "krim only after Chiqib ketdi");
  assert.equal(ok("SUPER_ADMIN", "RECEIVED", "receive"), false);
  assert.equal(rules.actionFor("SUPER_ADMIN", "ISSUED"), "receive");
  assert.equal(rules.actionFor("SUPER_ADMIN", "NEW"), null, "SUPER_ADMIN has no workshop buttons");
  assert.equal(rules.actionFor("WORKSHOP", "NEW"), "accept");
  assert.equal(rules.actionFor("WORKSHOP", "ISSUED"), null);
  assert.equal(rules.actionFor("SELLER", "NEW"), null);
});

test("visibility: a seller sees only their own orders, the workshop only open tasks", () => {
  assert.deepEqual(rules.orderScope({ id: "s1", role: "SELLER" }), { sellerId: "s1" });
  assert.deepEqual(rules.orderScope({ id: "w", role: "WORKSHOP" }), { status: { in: ["NEW", "ACCEPTED"] } });
  assert.deepEqual(rules.orderScope({ id: "a", role: "SUPER_ADMIN" }), {});
  assert.equal(rules.canViewOrder({ id: "s1", role: "SELLER" }, { sellerId: "s2", status: "NEW" }), false);
  assert.equal(rules.canViewOrder({ id: "s1", role: "SELLER" }, { sellerId: "s1", status: "RECEIVED" }), true);
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
  for (const file of ["../lib/sex/service.ts", "../app/admin/(sex)/sex/new/page.tsx", "../components/admin/sex/new-order.tsx", "../components/admin/sex/orders-board.tsx", "../app/admin/(sex)/sex/export/route.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /sellPrice|getMarkupPercent|Sotuv narxi|SaleUsd/, file);
  }
});

test("workshop Telegram message: changes from standard, quantity, due date, recipient — never a price", () => {
  const text = rules.workshopMessage({ number: 413, type: "AGREGAT", purpose: "CLIENT", customerName: "Rustam aka", qty: 1, dueDate: new Date("2026-10-08T00:00:00Z"), note: null, sellerName: "Abduraxmon", status: "NEW", items: [{ title: "BITZER 4NES+20 vazdushniy agregat · FNV200", qty: 1, changes: ["Kondensator: FNV200 (standart FN160 o‘rniga), rama bilan"] }] });
  assert.match(text, /^🔧 Yangi zakaz #0413 — Abduraxmon/);
  assert.match(text, /• Kondensator: FNV200 \(standart FN160 o‘rniga\), rama bilan/);
  assert.match(text, /Soni: 1 · Muddat: 08\.10\.2026/);
  assert.match(text, /Kimga: Mijoz — Rustam aka/);
  assert.doesNotMatch(text, /\$|narx|usd/i);
  const accepted = rules.workshopMessage({ number: 127, type: "ZAPCHAST", purpose: "SHOP", customerName: null, qty: 1, dueDate: null, note: null, sellerName: "Atxamaka", status: "ACCEPTED", acceptedByName: "Ikromjon", acceptedAt: new Date(), items: [{ title: "Vibro shlang F28", qty: 10 }] });
  assert.match(accepted, /📦 Yangi zayavka #0127 — Atxamaka\n• Vibro shlang F28 — 10\nKimga: Magazinga/);
  assert.match(accepted, /✅ Qabul qildi: Ikromjon/);
  assert.deepEqual(rules.workshopKeyboard("abcdefghij", "NEW").inline_keyboard[0][0].callback_data, "ws:accept:abcdefghij");
  assert.deepEqual(rules.workshopKeyboard("abcdefghij", "ISSUED").inline_keyboard, []);
  assert.deepEqual(rules.parseWorkshopCallback("ws:issue:abcdefghij"), { action: "issue", orderId: "abcdefghij" });
  assert.equal(rules.parseWorkshopCallback("ws:receive:abcdefghij"), null, "krim is never a Telegram button");
});

test("process steps and the 24 h overdue mark", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const issued = { status: "ISSUED", acceptedAt: new Date("2026-10-04T05:00:00Z"), issuedAt: new Date("2026-10-04T06:00:00Z"), receivedAt: null, acceptedBy: { name: "Ikromjon" }, issuedBy: { name: "Ikromjon" } };
  assert.deepEqual(rules.processSteps(issued, now).map(step => step.state), ["done", "done", "wait"]);
  assert.equal(rules.processSteps(issued, now)[0].text, "Ikromjon · 04-okt 10:00");
  assert.equal(rules.isReceiveOverdue(issued, now), true);
  assert.equal(rules.isReceiveOverdue({ ...issued, issuedAt: new Date("2026-10-05T01:00:00Z") }, now), false);
  assert.deepEqual(rules.processSteps({ status: "NEW", acceptedAt: null, issuedAt: null, receivedAt: null }, now).map(step => step.state), ["wait", "later", "later"]);
  assert.equal(rules.orderNumber(7), "#0007");
});

test("every Sex action starts with a role guard; WORKSHOP-only and SELLER-only actions check the role", async () => {
  const source = await readFile(new URL("../app/admin/(sex)/sex/actions.ts", import.meta.url), "utf8");
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

test("“Sexda ishlanmoqda” timer text and the overdue mark", async () => {
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
  const expected = { "app/admin/(sex)/sex/loading.tsx": "SexListSkeleton", "app/admin/(sex)/sex/new/loading.tsx": "SexNewSkeleton", "app/admin/(protected)/loading.tsx": "GenericSkeleton", "app/admin/(protected)/prays/loading.tsx": "PraysSkeleton", "app/admin/(protected)/customers/loading.tsx": "CustomersSkeleton", "app/admin/(protected)/sales-plan/loading.tsx": "SalesPlanSkeleton", "app/admin/(seller)/my/loading.tsx": "MySkeleton", "app/admin/loading.tsx": "ShellSkeleton" };
  for (const [file, component] of Object.entries(expected)) assert.match(await readFile(new URL(`../${file}`, import.meta.url), "utf8"), new RegExp(`<${component}/>`), file);
  const css = await readFile(new URL("../components/admin/feedback.css", import.meta.url), "utf8");
  assert.match(css, /\.admin-nav-progress\{position:fixed;top:0;left:0;z-index:1000;height:3px;width:0;background:#1E4E8C/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.sk::after,\.admin-nav-progress\{animation:none/);
});
