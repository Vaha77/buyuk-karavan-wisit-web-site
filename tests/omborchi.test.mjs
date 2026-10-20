import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/sex/rules.ts");
const bot = await import("../lib/sex/bot-text.ts");
const access = await import("../lib/auth/seller-access.ts");
const search = await import("../lib/search/plan.ts");
const source = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const request = (method = "GET", action = false) => ({ method, headers: { has: name => action && name === "next-action" } });

test("omborchi permissions: no prices, only /admin/seh, only the store stage and own requests", async () => {
  assert.equal(rules.priceAccess("STOREKEEPER"), "none");
  const row = rules.stripPrices({ id: "o1", priceSnapshot: { unitBaseUsd: 100, totalBaseUsd: 100, standardBaseUsd: null }, items: [{ id: "i1", baseUsd: 100, title: "Glazok" }] }, "STOREKEEPER");
  assert.equal("prices" in row, false);
  assert.equal("priceSnapshot" in row, false);
  assert.equal("baseUsd" in row.items[0], false);
  assert.deepEqual(rules.orderFormParts("STOREKEEPER", [{ id: "p", name: "Glazok", size: "F16", basePriceUsd: 5 }]), [{ id: "p", label: "Glazok F16" }]);

  assert.equal(access.isLimitedRole("STOREKEEPER"), true);
  assert.equal(access.homeFor("STOREKEEPER"), "/admin/seh");
  for (const path of ["/admin/seh", "/admin/seh/request", "/admin/seh/history"]) assert.equal(access.roleAccess("STOREKEEPER", path, request()), "allow", path);
  for (const path of ["/admin", "/admin/dashboard", "/admin/customers", "/admin/prays", "/admin/sales-plan", "/admin/my"]) {
    assert.equal(access.roleAccess("STOREKEEPER", path, request()), "redirect", path);
    assert.equal(access.roleAccess("STOREKEEPER", path, request("POST", true)), "forbid", `${path} action`);
  }
  const plan = search.searchPlan({ id: "u", role: "STOREKEEPER", salesPersonId: null }, "Adham", null);
  assert.deepEqual(Object.values(plan).filter(Boolean), [], "global search finds nothing (no customers, products or prices)");

  assert.deepEqual(rules.orderScope({ id: "k", role: "STOREKEEPER" }), { OR: [{ sellerId: "k" }, { status: { in: ["ISSUED", "RECEIVED_STORE", "CLIENT_LOADED"] }, noRequest: false }] });
  const viewer = { id: "k", role: "STOREKEEPER" };
  assert.equal(rules.canViewOrder(viewer, { sellerId: "s", status: "ISSUED" }), true);
  assert.equal(rules.canViewOrder(viewer, { sellerId: "s", status: "ISSUED", noRequest: true }), false, "Zayavkasiz chiqim went straight to the seller");
  assert.equal(rules.canViewOrder(viewer, { sellerId: "s", status: "NEW" }), false);
  assert.equal(rules.canViewOrder(viewer, { sellerId: "k", status: "NEW" }), true, "own Sehdan so‘rash request");
  assert.equal(rules.canCreateOrders("STOREKEEPER"), false, "no agregat / client order form");

  const actions = await source("app/admin/(sex)/seh/actions.ts");
  assert.match(actions, /storeStepAction[\s\S]*?if \(user\.role !== "STOREKEEPER"\)/);
  assert.match(actions, /storeRequestAction[\s\S]*?if \(user\.role !== "STOREKEEPER"\)[\s\S]*?purpose: "SHOP"/);
  for (const page of ["app/admin/(sex)/seh/request/page.tsx", "app/admin/(sex)/seh/history/page.tsx"]) assert.match(await source(page), /if \(user\.role !== "STOREKEEPER"\) redirect\("\/admin\/seh"\);/, page);
  assert.match(await source("lib/auth/session.ts"), /session\.user\.role !== "STOREKEEPER"/, "/api/admin routes refuse the omborchi");
  assert.doesNotMatch(await source("components/admin/sex/store-board.tsx"), /\.prices|baseUsd|priceSnapshot/, "the omborchi board never touches a price");
});

test("store stage: ISSUED → RECEIVED_STORE (Magazinga ends) → CLIENT_LOADED (Mijozga ends), only the omborchi", () => {
  assert.deepEqual(rules.checkTransition("STOREKEEPER", "ISSUED", "store", "SHOP"), { ok: true, to: "RECEIVED_STORE" });
  assert.deepEqual(rules.checkTransition("STOREKEEPER", "RECEIVED_STORE", "load", "CLIENT"), { ok: true, to: "CLIENT_LOADED" });
  assert.equal(rules.checkTransition("STOREKEEPER", "RECEIVED_STORE", "load", "SHOP").ok, false, "a shop order is finished in the store");
  for (const role of ["SUPER_ADMIN", "ADMIN", "MANAGER", "SELLER", "WORKSHOP"]) {
    assert.deepEqual(rules.checkTransition(role, "ISSUED", "store", "SHOP"), { ok: false, error: "Bu tugma faqat omborchi uchun." }, role);
    assert.equal(rules.checkTransition(role, "RECEIVED_STORE", "load", "CLIENT").ok, false, role);
  }
  for (const status of ["NEW", "ACCEPTED", "STARTED", "RECEIVED", "CLIENT_LOADED", "CANCELLED"]) assert.equal(rules.checkTransition("STOREKEEPER", status, "store", "CLIENT").ok, false, status);
  for (const [action, from] of [["accept", "NEW"], ["start", "ACCEPTED"], ["issue", "STARTED"], ["receive", "ISSUED"]]) assert.equal(rules.checkTransition("STOREKEEPER", from, action).ok, false, `omborchi cannot ${action}`);
  assert.equal(rules.actionFor("STOREKEEPER", "ISSUED"), "store");
  assert.equal(rules.checkTransition("SUPER_ADMIN", "ISSUED", "receive").ok, true, "the old Krimga oldim stays");
});

test("first press wins: the second press (site or another omborchi) gets “allaqachon”, every copy names who received", async () => {
  // The database step is a conditional update on the old status; a second press finds the new status.
  assert.deepEqual(rules.checkTransition("STOREKEEPER", "RECEIVED_STORE", "store", "SHOP"), { ok: false, error: "Bu zakaz allaqachon “Omborga qabul qilindi” holatida." });
  const service = await source("lib/sex/service.ts");
  assert.match(service, /updateMany\(\{ where: \{ id, status: order\.status \}/);
  assert.match(service, /if \(action !== "accept" && action !== "start"\) await notifyStore\(id\);/);
  const handlers = await source("lib/sex/bot-handlers.ts");
  assert.match(handlers, /transitionOrder\(user, parsed\.orderId, parsed\.action, undefined, "telegram"\)/, "Telegram buttons go through the same transition");
  assert.match(await source("lib/sex/bot.ts"), /workshopOrderMessage\.findMany\(\{ where: \{ orderId, store: false \} \}\)/, "workshop copies never overwrite omborchi copies");

  const order = { id: "cm0abcdefghij0001", number: "10-07", type: "ZAPCHAST", purpose: "CLIENT", customerName: "Davlatbek", qty: 1, dueDate: null, note: null, sellerName: "Huseyin", noRequest: false, status: "ISSUED", startedAt: null, issuedAt: new Date("2026-10-07T09:20:00Z"), issuedByName: "Ikromjon", details: [], items: [{ title: "Glazok F16", qty: 10, issuedQty: null }] };
  assert.match(bot.storeMessage(order), /^📦 10-07 sehdan chiqdi — qabul qiling\nGlazok F16 ×10\nKimga: Mijoz — Davlatbek · Sotuvchi: Huseyin\nSeh: Ikromjon · 07-okt 14:20$/);
  assert.deepEqual(bot.storeKeyboard(order).inline_keyboard[0].map(button => [button.text, button.callback_data]), [["✓ Qabul qildim", "omb:store:cm0abcdefghij0001"], ["Kamchilik bor", "omb:diff:cm0abcdefghij0001"]]);
  const received = { ...order, status: "RECEIVED_STORE", receivedByName: "Jasur", receivedAt: new Date("2026-10-07T09:40:00Z") };
  assert.match(bot.storeMessage(received), /\n\n✓ Jasur qabul qildi · 14:40$/);
  assert.deepEqual(bot.storeKeyboard(received).inline_keyboard, [[{ text: "🚚 Mijozga yuklandi", callback_data: "omb:load:cm0abcdefghij0001" }]]);
  assert.deepEqual(bot.storeKeyboard({ ...received, purpose: "SHOP" }).inline_keyboard, [], "Magazinga: nothing left to press");
  const loaded = { ...received, status: "CLIENT_LOADED", loadedByName: "Jasur", loadedAt: new Date("2026-10-08T05:00:00Z") };
  assert.match(bot.storeMessage(loaded), /🚚 Jasur mijozga yukladi · 10:00$/);
  assert.deepEqual(bot.storeKeyboard(loaded).inline_keyboard, []);
  assert.deepEqual(bot.parseStoreCallback("omb:load:cm0abcdefghij0001"), { action: "load", orderId: "cm0abcdefghij0001" });
  assert.equal(bot.parseStoreCallback("omb:drop:cm0abcdefghij0001"), null);
  assert.equal(bot.statusLine({ status: "RECEIVED_STORE" }, null), "📥 Omborga qabul qilindi", "the workshop copy follows too");
});

test("Kamchilik bor / Soni boshqa: real count + reason required, the difference goes to Super Admin", async () => {
  assert.deepEqual(rules.storeExtra("store", {}), { ok: true, data: {} }, "plain ✓ Qabul qildim");
  assert.deepEqual(rules.storeExtra("store", { receivedQty: 8, note: "" }), { ok: false, error: "Sababni yozing (majburiy)." });
  assert.deepEqual(rules.storeExtra("store", { receivedQty: 8, note: "  ok " }), { ok: false, error: "Sababni yozing (majburiy)." });
  assert.deepEqual(rules.storeExtra("store", { receivedQty: Number.NaN, note: "2 tasi singan" }), { ok: false, error: "Kelgan sonni to‘g‘ri kiriting." });
  assert.deepEqual(rules.storeExtra("store", { receivedQty: -1, note: "2 tasi singan" }).ok, false);
  assert.deepEqual(rules.storeExtra("store", { receivedQty: 8, note: " 2 tasi singan keldi " }), { ok: true, data: { receivedQty: 8, receivedNote: "2 tasi singan keldi" } });
  assert.deepEqual(rules.storeExtra("load", { car: " 01 A 123 BC ", photoUrl: null }), { ok: true, data: { loadedCar: "01 A 123 BC", loadedPhotoUrl: null } });
  assert.equal(rules.storeDiffText("10-07", "Glazok F16 ×10", 10, 8, "2 tasi singan keldi", "Jasur"), "⚠️ 10-07 Glazok F16 ×10: omborga kamchilik bilan qabul qilindi\nSeh chiqardi: 10 ta · Keldi: 8 ta (-2)\nSabab: 2 tasi singan keldi\nOmborchi: Jasur");
  assert.match(rules.storeDiffText("10-06", "Briliant 20 HP", 1, 1, "korpus chizilgan", "Jasur"), /Keldi: 1 ta\n/, "same count, defect only");
  const service = await source("lib/sex/service.ts");
  assert.match(service, /if \(diff\) await notifySuperAdmins\(storeDiffText\(/);
  assert.match(await source("lib/admin/shell-data.ts"), /receivedNote: \{ not: null \}, receivedCheckedAt: null/, "counted in the Tasdiqlash kerak badge");
  assert.match(await source("app/admin/(protected)/customers/purchases/page.tsx"), /<StoreDiffButton /);
  assert.match(service, /checkStoreDiff[\s\S]*?if \(actor\.role !== "SUPER_ADMIN"\)/);
});

test("month close: a Mijozga order not yet loaded is unfinished and carried; Magazinga ends in the store", async () => {
  const cases = [["NEW", "SHOP", true], ["STARTED", "CLIENT", true], ["ISSUED", "CLIENT", true], ["RECEIVED_STORE", "CLIENT", true], ["CLIENT_LOADED", "CLIENT", false],
    ["ISSUED", "SHOP", false], ["RECEIVED_STORE", "SHOP", false], ["RECEIVED", "CLIENT", false], ["CANCELLED", "CLIENT", false]];
  for (const [status, purpose, open] of cases) assert.equal(rules.isUnfinished({ status, purpose }), open, `${purpose} ${status}`);
  assert.deepEqual(rules.UNFINISHED_WHERE, { OR: [{ status: { in: ["NEW", "ACCEPTED", "STARTED"] } }, { purpose: "CLIENT", status: { in: ["ISSUED", "RECEIVED_STORE"] } }] });
  const month = await source("lib/sex/month.ts");
  assert.equal([...month.matchAll(/monthKey: \{ lt: monthKey \}, \.\.\.UNFINISHED_WHERE \}/g)].length, 2, "the carry and its quick check use the same filter");
  // Numbering is unchanged: carried orders come first in their old order.
  assert.deepEqual(rules.carryPlan([{ id: "b", monthKey: "2026-10", monthNo: 4 }, { id: "a", monthKey: "2026-10", monthNo: 2 }], "2026-11", 0), [{ id: "a", monthNo: 1, carriedFrom: "10-02" }, { id: "b", monthNo: 2, carriedFrom: "10-04" }]);
});

test("path on the seller / admin card: Seh chiqardi → Omborga qabul qilindi → Mijozga yuklandi", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const base = { purpose: "CLIENT", acceptedAt: "2026-10-07T04:00:00Z", startedAt: "2026-10-07T05:00:00Z", issuedAt: "2026-10-07T09:20:00Z", receivedAt: null, loadedAt: null, acceptedBy: { name: "Ikromjon" }, startedBy: { name: "Ikromjon" }, issuedBy: { name: "Ikromjon" } };
  assert.deepEqual(rules.processSteps({ ...base, status: "ISSUED" }, now).slice(3).map(step => [step.label, step.state, step.text]), [["Omborga qabul qildi", "wait", "omborchi kutilmoqda"], ["Mijozga yukladi", "later", "—"]]);
  const loaded = rules.processSteps({ ...base, status: "CLIENT_LOADED", receivedAt: "2026-10-07T09:40:00Z", receivedBy: { name: "Jasur" }, loadedAt: "2026-10-08T05:00:00Z", loadedBy: { name: "Jasur" }, loadedCar: "01A123BC" }, now);
  assert.deepEqual(loaded.slice(2).map(step => [step.label, step.text]), [["Chiqarib yubordi", "Ikromjon · kecha 14:20"], ["Omborga qabul qildi", "Jasur · kecha 14:40"], ["Mijozga yukladi", "Jasur · bugun 10:00 · 01A123BC"]]);
  assert.equal(rules.processSteps({ ...base, purpose: "SHOP", status: "RECEIVED_STORE", receivedAt: "2026-10-07T09:40:00Z" }, now).length, 4, "Magazinga: no loading step");
  assert.equal(rules.processSteps({ ...base, status: "RECEIVED", receivedAt: "2026-10-07T09:40:00Z" }, now).at(-1).label, "Krimga oldi", "old orders keep their path");
  assert.equal(rules.daysInStore("2026-10-07T09:40:00Z", now), 1);
});

test("24 h reminder: issued, not taken into the store → one Telegram to Super Admin per order (daily cron)", async () => {
  const issued = { status: "ISSUED", issuedAt: new Date("2026-10-07T09:00:00Z") };
  assert.equal(rules.isReceiveOverdue(issued, new Date("2026-10-08T09:01:00Z")), true);
  assert.equal(rules.isReceiveOverdue(issued, new Date("2026-10-08T08:59:00Z")), false);
  assert.equal(rules.isReceiveOverdue({ ...issued, status: "RECEIVED_STORE" }, new Date("2026-10-09T09:00:00Z")), false);
  assert.equal(rules.receiveReminderText(["10-05 Briliant R22 ×2", "10-07 Glazok F16 ×10"]), "⏰ Sehdan chiqqan, 24 soatda omborga qabul qilinmagan:\n10-05 Briliant R22 ×2\n10-07 Glazok F16 ×10");
  const service = await source("lib/sex/service.ts");
  assert.match(service, /status: "ISSUED", noRequest: false, isTest: false, issuedAt: \{ lt: new Date\(now\.getTime\(\) - RECEIVE_OVERDUE_MS\) \}, receiveRemindedAt: null/);
  assert.match(service, /data: \{ receiveRemindedAt: now \}/, "never reminded twice");
  assert.match(await source("app/api/cron/seller-reminders/route.ts"), /await remindUnreceived\(\)/);
});

test("additive migration: new enum values and nullable columns only, nothing dropped", async () => {
  const sql = await source("prisma/migrations/20261031090000_storekeeper/migration.sql");
  assert.doesNotMatch(sql, /^\s*(DROP|DELETE|UPDATE)\b|RENAME|ALTER COLUMN/im);
  for (const value of ["'STOREKEEPER'", "'RECEIVED_STORE'", "'CLIENT_LOADED'"]) assert.match(sql, new RegExp(`ADD VALUE ${value}`));
});

test("part picker search: every word, model numbers without dashes, category too", () => {
  const part = { label: "BITZER 4NES-14 kompressor", group: "Bitzer Kompressor" };
  for (const query of ["4nes", "4NES-14", "4nes14", "bitzer 14", "kompressor"]) assert.equal(rules.partMatches(part, query), true, query);
  for (const query of ["4nes20", "glazok"]) assert.equal(rules.partMatches(part, query), false, query);
});
