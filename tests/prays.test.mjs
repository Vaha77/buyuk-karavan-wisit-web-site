import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { register } from "node:module";
import ExcelJS from "exceljs";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/prays/rules.ts");
const excel = await import("../lib/prays/excel.ts");
const imp = await import("../lib/prays/import.ts");

test("basePrice backfill: smallest whole x with ceil(x × 1.10) = current price", () => {
  assert.equal(rules.inferBasePrice(968), 880); // BR +20PG
  assert.equal(rules.inferBasePrice(1007), 915); // BITZER 2FES+3
  assert.equal(rules.inferBasePrice(528), 480); // BRILIANT YBF4FC+5G
  for (const base of [1, 9, 99, 480, 880, 915, 4123, 12405]) assert.equal(rules.inferBasePrice(rules.sellPrice(base, 10)), base, `round trip ${base}`);
  assert.equal(rules.inferBasePrice(12), null, "no whole x gives 12 with +10 %");
  assert.equal(rules.inferBasePrice(968.5), null);
  assert.equal(rules.inferBasePrice(0), null);
});

test("the migration backfill uses the same formula and only adds", async () => {
  const dir = new URL("../prisma/migrations/", import.meta.url);
  const name = (await readdir(dir)).find(item => item.endsWith("_add_prays"));
  const sql = await readFile(new URL(`${name}/migration.sql`, dir), "utf8");
  assert.match(sql, /floor\(\("priceUsd" - 1\) \* 100 \/ 110\) \+ 1/);
  assert.match(sql, /ceil\(c\.x \* 110 \/ 100\.0\) = p\."priceUsd"/);
  assert.doesNotMatch(sql, /\bDROP\b|DELETE\s+FROM|\bTRUNCATE\b/i);
  // SQL floor((p-1)*100/110)+1 mirrors inferBasePrice for every whole price.
  for (let price = 1; price <= 20000; price++) {
    const x = Math.floor(((price - 1) * 100) / 110) + 1;
    assert.equal(Math.ceil((x * 110) / 100) === price ? x : null, rules.inferBasePrice(price), `price ${price}`);
  }
});

test("markup recompute: ceil(base × (100 + X) / 100), whole dollars", () => {
  assert.equal(rules.sellPrice(880, 10), 968);
  assert.equal(rules.sellPrice(880, 15), 1012);
  assert.equal(rules.sellPrice(915, 1), 925); // 924.15 → 925
  assert.equal(rules.sellPrice(915, 20), 1098);
  assert.equal(rules.sellPrice(12.5, 10), 14); // 13.75 → 14
  assert.equal(rules.clampMarkup(0), null);
  assert.equal(rules.clampMarkup(21), null);
  assert.equal(rules.clampMarkup(20), 20);
  assert.equal(rules.applyPercent(915, 5), 961); // design: 2FES+3 $915 → $961
});

const bitzerProducts = [
  { id: "k", name: "BITZER 2FES+3 kompressor", brand: "Bitzer", model: "2FES+3", categoryName: "Yarim germetik kompressorlar", basePriceUsd: 900 },
  { id: "rb", name: "BITZER 2FES+3 kompressor resiver ustida (8л)", brand: "BITZER", model: "2FES+3", categoryName: "Kompressorlar", basePriceUsd: null },
  { id: "rb20", name: "BITZER 2FES+3 kompressor resiver ustida (20L)", brand: "BITZER", model: "2FES+3", categoryName: "Kompressorlar", basePriceUsd: 1200 },
  { id: "vz", name: "BITZER 4NES+20 vazdushniy agregat FN160", brand: "BITZER", model: "4NES+20", categoryName: "Agregatlar", basePriceUsd: 4123 },
  { id: "vd", name: "BITZER 4GE-23 vadinoy agregat (30HP kondensator)", brand: "BITZER", model: "4GE-23", categoryName: "Agregatlar", basePriceUsd: 5100 },
  { id: "kit", name: "BITZER 4NES+20 vazdushniy agregat komplekti FN160 DD160", brand: "BITZER", model: "4NES+20", categoryName: "Komplektlar", basePriceUsd: null },
  { id: "x", name: "XUEYING BR +20PG kompressor", brand: "XUEYING", model: "BR +20PG", categoryName: "Kompressorlar", basePriceUsd: 880 },
];

test("Excel import: the Bitzer R22 file is recognised and matched to existing products only", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../docs/design/sex/bitzer-r22-15.07.26.xlsx", import.meta.url)));
  const [sheet] = await excel.readPriceWorkbook(bytes);
  assert.equal(sheet.kind, "price-list");
  assert.equal(sheet.brand, "BITZER");
  assert.equal(sheet.freon, "R22");
  assert.equal(sheet.listDate.toISOString().slice(0, 10), "2026-07-15");
  assert.equal(sheet.rows.length, 19);
  assert.deepEqual([sheet.rows[0].model, sheet.rows[0].compressorPrice, sheet.rows[0].receiverLiters, sheet.rows[0].receiverPrice, sheet.rows[0].waterCondenser, sheet.rows[0].waterPrice, sheet.rows[0].airCondenser, sheet.rows[0].airPrice], ["2 FES+3", "915", "8л", "1091", "3HP", "1269", "FN22", "1341"]);
  const rows = imp.matchPriceList(sheet, bitzerProducts);
  const byId = Object.fromEntries(rows.filter(row => row.entityId).map(row => [row.entityId, row]));
  assert.deepEqual([byId.k.newBase, byId.k.status], [915, "UP"]);
  assert.deepEqual([byId.rb.newBase, byId.rb.status], [1091, "NEW"]);
  assert.equal(byId.rb20, undefined, "a 20 L receiver is not the 8 L standard row");
  assert.deepEqual([byId.vz.newBase, byId.vz.status], [4123, "SAME"]);
  assert.deepEqual([byId.vd.newBase, byId.vd.status], [5000, "DOWN"]);
  assert.deepEqual([byId.kit.newBase, byId.kit.status], [6165, "NEW"]);
  assert.equal(byId.x, undefined, "other brands are never touched");
  const missing = rows.filter(row => row.status === "NOT_FOUND");
  assert.ok(missing.length > 50);
  assert.ok(missing.every(row => row.entityId === null), "nothing is created for unmatched rows");
  assert.ok(missing.some(row => row.name === "BITZER 6FE+50 vazdushniy agregat · FNV350"));
});

test("Excel import: our own export reads back by ID; workshop parts by name + size, new ones are created", async () => {
  const workbook = new ExcelJS.Workbook();
  const ready = workbook.addWorksheet("Tayyor mahsulotlar");
  ready.addRow(["ID", "Nomi", "Brend", "Model", "Prays narxi", "Sotuv narxi (+10%)"]);
  ready.addRow(["x", "XUEYING BR +20PG kompressor", "XUEYING", "BR +20PG", 920, 1012]);
  ready.addRow(["gone", "Old", "X", "Y", 10, 11]);
  const sex = workbook.addWorksheet("Sex zapchastlari");
  sex.addRow(["ID", "Nomi", "O‘lcham", "Guruh", "Birlik", "Prays narxi"]);
  sex.addRow(["", "Glazok", "3/8", "Glazok", "dona", 9]);
  sex.addRow(["", "Resiver bachok", "20 L", "Resiver", "dona", 300]);
  const sheets = await excel.readPriceWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(sheets.map(sheet => sheet.kind), ["products-table", "parts-table"]);
  const products = imp.matchProductTable(sheets[0].rows, bitzerProducts);
  assert.deepEqual(products.map(row => [row.entityId, row.status]), [["x", "UP"], [null, "NOT_FOUND"]]);
  const parts = imp.matchPartsTable(sheets[1].rows, [{ id: "g", name: "Glazok", size: "3/8", group: "Glazok", unit: "dona", basePriceUsd: 8 }]);
  assert.deepEqual(parts.map(row => [row.entityId, row.status, row.newBase]), [["g", "UP", 9], [null, "NEW", 300]]);
  assert.deepEqual(parts[1].create, { name: "Resiver bachok", size: "20 L", group: "Resiver", unit: "dona" });
});

test("percent change preview skips prices that are not entered", () => {
  const rows = imp.percentPreview([{ id: "a", name: "A", basePriceUsd: 915, entityType: "PRODUCT" }, { id: "b", name: "B", basePriceUsd: null, entityType: "PRODUCT" }], 5);
  assert.deepEqual(rows.map(row => [row.entityId, row.oldBase, row.newBase, row.status, row.percent]), [["a", 915, 961, "UP", 5]]);
});
