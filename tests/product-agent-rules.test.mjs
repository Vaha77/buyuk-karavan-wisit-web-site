import test from "node:test";
import assert from "node:assert/strict";
import { categoryMatches, directPriceIsValid, findModelHeaderColumns, hasPriceListCommandIntent, moneyEquals, normalizeMoney2, requestedSheetNumber } from "../lib/ai-office/product-agent-rules.ts";

test("unrelated first category never matches vazdushniy synonyms", () => {
  const categories = [{ name: "Kompressor XUEYING", slug: "kompressor-xueying" }, { name: "DD/DJ UCS", slug: "dd-dj-ucs" }];
  assert.equal(categories.find(item => categoryMatches(item, "Vazdushniy agregatlar", ["vazdushniy agregat", "havoli agregat"])), undefined);
  assert.equal(categoryMatches(categories[0], "Kompressor XUEYING", ["xueying kompressor"]), true);
});

test("direct integer price normalizes and compares as decimal", () => {
  assert.equal(normalizeMoney2("1232"), "1232.00");
  assert.equal(moneyEquals("1232", "1232.00"), true);
  assert.equal(moneyEquals("1232.01", "1232.00"), false);
  assert.equal(directPriceIsValid("1232.00", "1232"), true);
});

test("model header columns support List1 B/O and List2 A", () => {
  const list1 = Array(15).fill(""); list1[1] = "Modeli R22"; list1[14] = "Model +3";
  assert.deepEqual(findModelHeaderColumns([list1]), [2, 15]);
  assert.deepEqual(findModelHeaderColumns([["Modeli R22", "Narx"]]), [1]);
  assert.equal(requestedSheetNumber("2-listdan ol"), 2);
  assert.equal(requestedSheetNumber("list-3 narxi"), 3);
});

test("price-list route requires model or bulk intent", () => {
  assert.equal(hasPriceListCommandIntent("BR +5PG vazdushniy"), true);
  assert.equal(hasPriceListCommandIntent("hamma vazdushniy agregatlar"), true);
  assert.equal(hasPriceListCommandIntent("sayt dizaynini o‘zgartir"), false);
  assert.equal(hasPriceListCommandIntent("shu rasmni DD 160 ga qo‘y"), false);
});
