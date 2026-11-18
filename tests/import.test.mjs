import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/import/rules.ts");
const access = await import("../lib/auth/seller-access.ts");
const { normalize } = await import("../scripts/seed-import-alisa.mjs");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("import seed: 559 products, unique codes (the repeated UN40-15P gets -2), re-run updates instead of duplicating", async () => {
  const rows = JSON.parse(await read("../scripts/data/alisa_tovarlar.json"));
  if (rows) {
    const products = normalize(rows);
    assert.equal(products.length, 559);
    assert.equal(new Set(products.map(p => p.code)).size, 559);
    assert.ok(products.some(p => p.code === "ALISA-CK-043-UN40-15P-2"));
  }
  assert.deepEqual(normalize([{ kod: "A" }, { kod: "A" }, { kod: "B" }, { kod: "A" }]).map(p => p.code), ["A", "A-2", "B", "A-3"]);
  assert.equal(normalize([{ kod: "A", type: "nimadir" }])[0].type, "boshqa");
  const seed = await read("../scripts/seed-import-alisa.mjs");
  assert.match(seed, /ON CONFLICT \(code\) DO UPDATE/);
  assert.doesNotMatch(seed.slice(seed.indexOf("ON CONFLICT (code)")), /"priceAmount"|moq|active =/, "admin-set price / MOQ / active are never overwritten");
  assert.match(seed, /COALESCE\(EXCLUDED\."imageUrl", "ImportProduct"\."imageUrl"\)/);
  assert.match(seed, /if \(opts\.dryRun\) \{[^}]*return; \}/, "--dry-run writes nothing");
});

test("import: a seller gets neither price nor flag (keys absent); the approver gets price, admins the flag", async () => {
  const row = { id: "p", code: "C", catalogId: "k", groupEn: "G", nameEn: "E", nameUz: "U", model: "M", type: "gaz", specs: [{ en: "Power", value: "1kW", uz: "Quvvat", value_uz: "1kW" }], imageUrl: null, catPage: "001", flag: "tekshir", priceAmount: "123.50", priceCurrency: "USD", moq: 2 };
  const seller = rules.productView(row, { price: false, flag: false });
  assert.ok(!("price" in seller) && !("priceCurrency" in seller) && !("priceAmount" in seller) && !("flag" in seller));
  assert.doesNotMatch(JSON.stringify(seller), /123|tekshir/);
  assert.equal(rules.productView(row, { price: true, flag: false }).price, 123.5);
  assert.equal(rules.productView(row, { price: false, flag: true }).flag, "tekshir");
  assert.equal(rules.canSeeFlag("ADMIN"), true);
  assert.equal(rules.canSeeFlag("SELLER"), false);
  const service = await read("../lib/import/service.ts");
  assert.match(service, /productView\(row, \{ price: rights\.approve, flag: rights\.flag \}\)/, "the page/API list goes through productView");
  assert.match(service, /export async function myOrders[\s\S]*?priceAmount: false, priceCurrency: false/, "seller's own orders drop product prices");
});

test("import cart: add, ±, typed quantity, 0 removes, junk storage is ignored", () => {
  const line = { code: "C1", name: "Fritoz", model: "E6L" };
  let cart = rules.cartStep({}, "p1", 1, line);
  assert.deepEqual(cart, { p1: { ...line, qty: 1 } });
  cart = rules.cartStep(cart, "p1", 1);
  assert.equal(cart.p1.qty, 2);
  cart = rules.cartSet(cart, "p1", "10");
  assert.equal(cart.p1.qty, 10);
  cart = rules.cartSet(cart, "p2", 3, { code: "C2", name: "Gril", model: "G1" });
  assert.equal(rules.cartTotal(cart), 13);
  assert.ok(!("p1" in rules.cartSet(cart, "p1", 0)));
  assert.ok(!("p1" in rules.cartSet(cart, "p1", "abc")));
  assert.ok(!("p1" in rules.cartStep(rules.cartSet({}, "p1", 1, line), "p1", -1)));
  assert.equal(rules.cartSet({}, "p1", 1e9, line).p1.qty, rules.MAX_QTY);
  assert.deepEqual(rules.cartStep({}, "x", 1), {}, "unknown product without line data is not added");
  assert.deepEqual(rules.parseCart("not json"), {});
  assert.deepEqual(rules.parseCart('{"p":{"qty":-1,"code":"C"},"q":{"qty":2,"code":"D","name":"n","model":"m"}}'), { q: { qty: 2, code: "D", name: "n", model: "m" } });
});

test("import order: submit → PENDING, sequential IMP numbers, date check", async () => {
  assert.equal(rules.importNumber(1), "IMP-0001");
  assert.equal(rules.importNumber(142), "IMP-0142");
  assert.equal(rules.importNumber(12345), "IMP-12345");
  const schema = await read("../prisma/schema.prisma");
  assert.match(schema, /number\s+Int\s+@unique @default\(autoincrement\(\)\)/, "numbers come from a DB sequence (no race)");
  assert.match(schema, /status\s+ImportOrderStatus @default\(PENDING\)/);
  assert.match(schema, /requestId\s+String\?\s+@unique/, "double press: one order per client request");
  const service = await read("../lib/import/service.ts");
  assert.match(service, /=== "P2002" \? await repeated\(\)/);
  assert.match(await read("../components/admin/import/catalog-board.tsx"), /requestId, items:/);
  assert.equal(rules.parseNeededBy(""), null);
  assert.equal(rules.parseNeededBy("2026-12-20").toISOString(), "2026-12-20T00:00:00.000Z");
  assert.equal(rules.parseNeededBy("2026-02-30"), undefined);
  assert.equal(rules.parseNeededBy("20-dek"), undefined);
  const migration = await read("../prisma/migrations/20261114090000_import_catalog/migration.sql");
  assert.doesNotMatch(migration, /DROP|ALTER TABLE "(?!SiteSettings|Import)[A-Za-z]+" (?!ADD CONSTRAINT)/, "additive only");
});

test("import decisions: only the approver or SUPER_ADMIN, same press twice is a no-op, return needs a note", async () => {
  assert.equal(rules.canApprove({ id: "a", role: "SELLER" }, "a"), true);
  assert.equal(rules.canApprove({ id: "b", role: "ADMIN" }, "a"), false);
  assert.equal(rules.canApprove({ id: "b", role: "ADMIN" }, null), false);
  assert.equal(rules.canApprove({ id: "s", role: "SUPER_ADMIN" }, "a"), true);
  assert.deepEqual(rules.decisionStep("PENDING", "approve"), { ok: true, to: "APPROVED", already: false });
  assert.deepEqual(rules.decisionStep("APPROVED", "approve"), { ok: true, to: "APPROVED", already: true });
  assert.deepEqual(rules.decisionStep("RETURNED", "return"), { ok: true, to: "RETURNED", already: true });
  assert.equal(rules.decisionStep("APPROVED", "reject").ok, false);
  assert.equal(rules.decisionStep("SENT", "approve").ok, false);
  const service = await read("../lib/import/service.ts");
  assert.match(service, /if \(!canApprove\(user, await importApproverId\(\)\)\) return \{ ok: false/);
  assert.match(service, /if \(decision === "return" && !note\) return \{ ok: false/);
  assert.match(service, /updateMany\(\{ where: \{ id: orderId, status: "PENDING" \}/, "conditional update: a parallel second press changes nothing");
  assert.match(service, /status: "RETURNED" \}, data: \{ status: "PENDING"/, "only the seller's own RETURNED order is resubmitted");
  assert.match(service, /decisionNote: note/, "the return note is stored for the seller");
});

test("import access: sellers reach /admin/import, workshop / store keeper do not", () => {
  const page = { method: "GET", headers: { has: () => false } };
  assert.equal(access.roleAccess("SELLER", "/admin/import", page), "allow");
  assert.equal(access.roleAccess("SELLER", "/admin/import/tasdiq", page), "allow");
  assert.equal(access.roleAccess("WORKSHOP", "/admin/import", page), "redirect");
  assert.equal(rules.canUseImport("STOREKEEPER"), false);
  assert.equal(rules.canUseImport("MANAGER"), true);
});

test("import summary: catalog groups use approved quantities, unpriced lines counted, factory lines merged", () => {
  const catalog = { id: "k", title: "Cookunique 2025", code: "CK", agent: { name: "ALISA", country: "Xitoy", currency: "USD" } };
  const product = (code, price) => ({ code, model: code, nameEn: `${code} en`, nameUz: `${code} uz`, priceAmount: price, priceCurrency: price == null ? null : "USD", catalog });
  const orders = [
    { id: "o1", number: 1, client: "Ali", seller: { name: "Abror" }, items: [{ qty: 10, approvedQty: 8, product: product("A", "2.50") }, { qty: 1, approvedQty: null, product: product("B", null) }] },
    { id: "o2", number: 2, client: null, seller: { name: "Bek" }, items: [{ qty: 2, approvedQty: null, product: product("A", "2.50") }] },
  ];
  const [group] = rules.summarize(orders);
  assert.equal(group.qty, 11);
  assert.equal(group.amount, 25);
  assert.equal(group.unpriced, 1);
  assert.equal(group.orders, 2);
  assert.equal(group.positions, 2);
  assert.deepEqual(rules.factoryLines(group).map(line => [line.code, line.qty]), [["A", 10], ["B", 1]]);
});

test("import Excel: sheets = Umumiy + (catalog + zavodga) per catalog, totals right, factory sheet without seller/client", async () => {
  const { buildImportWorkbook } = await import("../lib/import/excel.ts");
  const agent = { name: "ALISA", country: "Xitoy", currency: "USD" };
  const product = (code, price, catalog) => ({ code, model: `M-${code}`, nameEn: `${code} en`, nameUz: `${code} uz`, priceAmount: price, priceCurrency: "USD", catalog });
  const ck = { id: "k1", title: "Cookunique 2025", code: "CK", agent }, bk = { id: "k2", title: "Bakery", code: "BK", agent };
  const groups = rules.summarize([
    { id: "o1", number: 1, client: "Ali", seller: { name: "Abror" }, items: [{ qty: 4, approvedQty: null, product: product("A", "10", ck) }, { qty: 1, approvedQty: null, product: product("B", "5", bk) }] },
    { id: "o2", number: 2, client: null, seller: { name: "Bek" }, items: [{ qty: 6, approvedQty: null, product: product("A", "10", ck) }] },
  ]);
  const workbook = buildImportWorkbook(groups, "Test");
  assert.equal(workbook.worksheets.length, 1 + 2 * groups.length);
  assert.equal(workbook.worksheets[0].name, "Umumiy");
  const texts = sheet => { const out = []; sheet.eachRow(row => row.eachCell(cell => out.push(cell.value && typeof cell.value === "object" && "result" in cell.value ? cell.value.result : cell.value))); return out; };
  const ckSheet = workbook.getWorksheet("CK"), factory = workbook.getWorksheet("CK zavodga");
  assert.ok(texts(ckSheet).includes("Abror") && texts(ckSheet).includes(100), "catalog sheet: sellers and total 100");
  const factoryCells = texts(factory);
  assert.ok(!factoryCells.includes("Abror") && !factoryCells.includes("Ali"), "factory sheet has no seller / client");
  assert.ok(factoryCells.includes(10) && factoryCells.includes(100), "A merged to 10 pcs, 100 USD");
  assert.ok(texts(workbook.getWorksheet("Umumiy")).includes(105), "grand total 100 + 5");
  assert.ok((await workbook.xlsx.writeBuffer()).byteLength > 1000);
});
