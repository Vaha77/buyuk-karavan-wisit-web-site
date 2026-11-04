import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/sex/rules.ts");
const bot = await import("../lib/sex/bot-text.ts");
const zborka = await import("../lib/sex/zborka.ts");
const { formatUsd } = await import("../lib/prays/rules.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("sotuvchi nomidan: WORKSHOP only for a chosen seller; everyone else orders as themselves", () => {
  assert.deepEqual(rules.orderSellerFor("WORKSHOP", null), { ok: false, error: "“Kim uchun?” — sotuvchini tanlang." });
  assert.equal(rules.orderSellerFor("WORKSHOP", "").ok, false);
  assert.deepEqual(rules.orderSellerFor("WORKSHOP", "s1"), { ok: true, sellerId: "s1" });
  // A seller's own order: a sent sellerId is ignored, the flow is unchanged.
  assert.deepEqual(rules.orderSellerFor("SELLER", "other"), { ok: true, sellerId: null });
  assert.deepEqual(rules.orderSellerFor("SUPER_ADMIN", null), { ok: true, sellerId: null });
  assert.equal(rules.orderSellerFor("STOREKEEPER", "s1").ok, false);
  assert.equal(rules.canCreateOrders("WORKSHOP"), false, "canCreateOrders is unchanged");
});

test("sotuvchi nomidan: the server takes only an active SELLER (same list as the picker), customers are that seller's", async () => {
  assert.deepEqual(rules.ACTIVE_SELLER, { role: "SELLER", isActive: true, approvalStatus: "APPROVED" });
  const service = await read("../lib/sex/service.ts"), queries = await read("../lib/sex/queries.ts"), actions = await read("../app/admin/(sex)/seh/actions.ts");
  assert.match(service, /where: \{ id: forSellerId, \.\.\.ACTIVE_SELLER \}/);
  assert.match(queries, /findMany\(\{ where: ACTIVE_SELLER,/, "sellerOptions uses the same where");
  assert.match(service, /resolveCustomer\(owner\.seller, input\)/, "customers resolved as the chosen seller (their own only)");
  assert.equal((actions.match(/orderSellerFor\(user\.role, parsed\.data\.sellerId\)/g) ?? []).length, 2, "agregat and zapchast actions");
  assert.match(service, /sellerId: owner\.seller\.id, createdById: actor\.id, \.\.\.\(owner\.onBehalf \? \{ sellerConfirm: "PENDING" as const \}/, "agregat: seller = chosen, entered by the workshop, PENDING");
  assert.match(service, /sellerId, createdById: actor\.id, \.\.\.\(owner\.onBehalf \? \{ sellerConfirm: "PENDING" as const \}/, "zapchast: PENDING too");
  // "Zayavkasiz chiqim" keeps its own path and its seller check.
  assert.match(service, /noRequestFor \? \{ ok: true, seller: actor, onBehalf: false \} : await orderOwner/);
  assert.match(actions, /createZapchastOrder\(user, parsed\.data, parsed\.data\.sellerId, \{ requestId: parsed\.data\.requestId, confirmDuplicate: true \}\)/);
});

test("sotuvchi nomidan: WORKSHOP form gets no price (catalog zeroed, parts without price), the quote still works", async () => {
  const priced = { k: { id: "p", name: "4NES-20", base: 4123 }, rb: { id: "r", name: "rb", base: 4300 }, vd: null, vz: { id: "v", name: "vz", base: 5351 } };
  const catalog = { groups: [{ key: "bitzer|R22", label: "Bitzer R22", brand: "BITZER", hpTable: { "5": 310 }, models: [{ key: "4NES+20", model: "4NES-20", ...priced, liters: "20", hp: null, fn: "FN160" }] }], receivers: { "20": 95, "40": 180 }, condensers: [{ id: "c", code: "FN160", label: "FN160 · Xitoy", source: "Xitoy", categoryId: "x", base: 1228 }], standardCondenserCategoryId: "x", notice: null };
  const free = zborka.withoutPrices(catalog);
  assert.doesNotMatch(JSON.stringify(free), /4123|4300|5351|310|95|180|1228/);
  const group = free.groups[0], model = group.models[0];
  const quote = zborka.quoteZborka(model, group, free, { assembly: "rb", liters: "40" });
  assert.equal(quote.ok, true);
  assert.equal(quote.base, 0);
  assert.equal(catalog.receivers["20"], 95, "the original catalog is not changed");
  assert.doesNotMatch(JSON.stringify(rules.orderFormParts("WORKSHOP", [{ id: "a", name: "Glazok", size: null, basePriceUsd: 9 }])), /price|Usd|9/);
  const page = await read("../app/admin/(sex)/seh/new/page.tsx");
  assert.match(page, /catalog=\{withPrices \? catalog : withoutPrices\(catalog\)\}/);
  assert.match(page, /\.\.\.\(withPrices \? \{ basePriceUsd: item\.basePriceUsd \} : \{\}\)/);
  assert.match(page, /hidePrices=\{!withPrices\}/);
  // The create result carries number / id / telegram only.
  assert.match(await read("../lib/sex/service.ts"), /export type CreateResult = \{ ok: true; id: string; number: string; telegram: DeliveryStatus; repeated\?: boolean \}/);
});

test("sotuvchi nomidan: the answer — same answer twice is a no-op, the other answer after one is refused", () => {
  assert.deepEqual(rules.sellerConfirmStep("PENDING", "ok"), { ok: true, to: "CONFIRMED", already: false });
  assert.deepEqual(rules.sellerConfirmStep("PENDING", "no"), { ok: true, to: "REJECTED", already: false });
  assert.deepEqual(rules.sellerConfirmStep("CONFIRMED", "ok"), { ok: true, to: "CONFIRMED", already: true });
  assert.deepEqual(rules.sellerConfirmStep("REJECTED", "no"), { ok: true, to: "REJECTED", already: true });
  assert.equal(rules.sellerConfirmStep("CONFIRMED", "no").ok, false);
  assert.equal(rules.sellerConfirmStep("REJECTED", "ok").ok, false);
  assert.equal(rules.sellerConfirmStep(null, "ok").ok, false, "a seller's own order needs no confirmation");
  assert.equal(rules.SELLER_CONFIRM_LABEL.PENDING, "🛠 seh kiritdi · ⏳ tasdiq kutilmoqda");
  assert.equal(rules.SELLER_CONFIRM_LABEL.CONFIRMED, "🛠 seh kiritdi · ✓ tasdiqlandi");
  assert.equal(rules.SELLER_CONFIRM_LABEL.REJECTED, "✕ sotuvchi: meniki emas");
});

test("sotuvchi nomidan: bot and site run one function, only that seller, race-safe", async () => {
  const service = await read("../lib/sex/service.ts"), handlers = await read("../lib/sex/bot-handlers.ts"), actions = await read("../app/admin/(sex)/seh/actions.ts");
  assert.match(handlers, /answerSellerConfirm\(user, parsed\.orderId, parsed\.answer, null, "telegram"\)/);
  assert.match(actions, /answerSellerConfirm\(user, parsed\.data\.id, parsed\.data\.answer, parsed\.data\.reason\)/);
  assert.match(service, /actor\.role !== "SELLER" \|\| order\.sellerId !== actor\.id\) return \{ ok: false, error: "Faqat shu zakaz sotuvchisi tasdiqlaydi\." \}/);
  assert.match(service, /where: \{ id, sellerId: actor\.id, sellerConfirm: "PENDING" \}/, "only a PENDING order changes (first press wins)");
  assert.match(service, /closeSellerMessage\(order, rejected \? `❌ \$\{number\} rad etildi/, "the bot message is edited from both paths");
  assert.deepEqual(bot.parseSellerConfirmCallback("sc:ok:cmabc1234567"), { answer: "ok", orderId: "cmabc1234567" });
  assert.deepEqual(bot.parseSellerConfirmCallback("sc:no:cmabc1234567"), { answer: "no", orderId: "cmabc1234567" });
  assert.equal(bot.parseSellerConfirmCallback("seh:accept:cmabc1234567"), null);
  assert.deepEqual(bot.sellerConfirmKeyboard("cmabc1234567").inline_keyboard[0].map(button => button.text), ["✓ To‘g‘ri", "✕ Meniki emas"]);
  assert.match(await read("../app/api/telegram/webhook/route.ts"), /\^\(\?:seh\|ws\|omb\|sc\|/, "sc: buttons answer themselves");
});

test("sotuvchi nomidan: the seller's message — number, goods, customer, due date, prays price (qty × price; chiller kelishiladi), note", () => {
  const order = { id: "o", number: "11-23", type: "AGREGAT", qty: 2, items: [{ title: "BR+15G vazdushniy · FN120", qty: 2 }], purpose: "CLIENT", customerName: "Nodirbek, Pop", dueDate: "2026-11-06", note: "Telefonda aytdi", enteredByName: "Ikromjon", prices: { unitBaseUsd: 2156, totalBaseUsd: 4312 } };
  assert.equal(bot.sellerConfirmText(order), `🛠 Ikromjon sizning nomingizdan zakaz kiritdi\n11-23 · BR+15G vazdushniy · FN120 ×2\nKimga: Mijoz — Nodirbek, Pop · Muddat: 06-noy\nPrays narxi: ${formatUsd(2156)} × 2 = ${formatUsd(4312)}\nIzoh: Telefonda aytdi`);
  assert.match(bot.sellerConfirmText({ ...order, qty: 1, prices: { unitBaseUsd: 0, totalBaseUsd: 0, negotiated: true } }), /Prays narxi: kelishiladi/);
  assert.match(bot.sellerConfirmText(order, true), /^⏰ Eslatma/);
  // The workshop's own message still has no price.
  assert.doesNotMatch(bot.personalMessage({ ...order, sellerName: "Atham", noRequest: false, status: "NEW", startedAt: null, issuedAt: null, issuedByName: null, details: [] }, null), /\$|narx/i);
});

test("sotuvchi nomidan: “Meniki emas” stops the order, goes to Tasdiqlash kerak, leaves accounting; reassign resumes it", async () => {
  const service = await read("../lib/sex/service.ts"), queries = await read("../lib/sex/queries.ts");
  assert.match(service, /stop = rejected && CANCELLABLE\.includes\(order\.status\)/);
  assert.match(service, /status: "CANCELLED" as const, cancelledById: actor\.id, cancelledAt: now, cancelReason: rejectCancelReason\(cleanReason\)/, "the existing CANCELLED, no new status");
  assert.match(service, /if \(stop\) await notifyCancelled\(id\);\r?\n    await notifyStopped\(id, cleanReason\);/);
  assert.equal(rules.rejectCancelReason("bu mijoz meniki emas"), "Sotuvchi: meniki emas · bu mijoz meniki emas");
  assert.equal(rules.rejectCancelReason(null), "Sotuvchi: meniki emas");
  assert.equal(rules.resumedStatus({ acceptedAt: null, startedAt: null }), "NEW");
  assert.equal(rules.resumedStatus({ acceptedAt: new Date(), startedAt: null }), "ACCEPTED");
  assert.equal(rules.resumedStatus({ acceptedAt: new Date(), startedAt: new Date() }), "STARTED");
  assert.match(await read("../app/admin/(protected)/customers/purchases/page.tsx"), /where: \{ sellerConfirm: "REJECTED", sellerRejectResolvedAt: null \}/);
  assert.match(queries, /NOT_REJECTED: Prisma\.WorkshopOrderWhereInput = \{ OR: \[\{ sellerConfirm: null \}, \{ sellerConfirm: \{ not: "REJECTED" \} \}\] \}/, "null (own orders) stays in");
  assert.match(queries, /where: \{ monthKey: range\.key, isTest: false, \.\.\.NOT_REJECTED \}/, "Excel export");
  assert.match(queries, /real = \{ isTest: false, \.\.\.NOT_REJECTED \}/, "closed-month figures");
  assert.match(await read("../lib/dashboard/workshop-queries.ts"), /o\."sellerConfirm" IS DISTINCT FROM 'REJECTED'/, "dashboard sums");
  const exporter = await read("../app/admin/(sex)/seh/export/route.ts");
  assert.match(exporter, /\{ header: "Tasdiqsiz", key: "unconfirmed"/);
  assert.match(exporter, /unconfirmed: order\.sellerConfirm === "PENDING" \? "tasdiqsiz" : ""/);
});

test("sotuvchi nomidan: the 24 h reminder goes out once (claimed before sending), from the daily cron, logged", async () => {
  assert.equal(rules.SELLER_CONFIRM_REMIND_MS, 24 * 60 * 60 * 1000);
  const service = await read("../lib/sex/service.ts");
  const body = service.slice(service.indexOf("export async function remindSellerConfirm"));
  assert.match(body, /where: \{ sellerConfirm: "PENDING", sellerRemindedAt: null, createdAt: \{ lt:/);
  assert.ok(body.indexOf("data: { sellerRemindedAt: now }") < body.indexOf("notifySellerConfirm(order.id, true)"), "claimed first: a second run finds nothing");
  assert.match(body, /if \(claimed\.count !== 1\) continue;/);
  assert.match(body, /writeAudit\(/);
  assert.match(await read("../app/api/cron/seller-reminders/route.ts"), /remindSellerConfirm\(\)/);
  const migration = await read("../prisma/migrations/20261106090000_seh_seller_confirm/migration.sql");
  assert.doesNotMatch(migration, /DROP|DELETE|UPDATE|NOT NULL/i, "additive only");
});

test("sotuvchi nomidan: screens — workshop button, picker, price note, seller buttons first, admin chips", async () => {
  const workshop = await read("../components/admin/sex/workshop-board.tsx"), form = await read("../components/admin/sex/new-order.tsx"), board = await read("../components/admin/sex/orders-board.tsx");
  assert.match(workshop, /href="\/admin\/seh\/new\?type=agregat&for=seller">＋ Sotuvchi nomidan zakaz/);
  assert.match(workshop, /＋ Zayavkasiz chiqim/);
  assert.match(form, /Kim uchun\? \*/);
  assert.match(form, /Narxlar sehga ko‘rinmaydi — prays narxi sotuvchiga chiqadi/);
  assert.match(form, /item\.ownerId === forSeller\.salesPersonId/, "customers of the chosen seller");
  assert.match(board, /sort\(\(a, b\) => Number\(b\.sellerConfirm === "PENDING"\) - Number\(a\.sellerConfirm === "PENDING"\)\)/);
  assert.match(board, /✓ To‘g‘ri/);
  assert.match(board, /✕ Meniki emas/);
  assert.match(board, /"🛠 Seh kiritgan" : "⏳ Tasdiqsiz"/);
});
