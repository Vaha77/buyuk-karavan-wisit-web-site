import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { categoryMatches, chatReplyClaimsWrite, directPriceIsValid, findModelHeaderColumns, hasDirectProductCommandIntent, hasPriceListCommandIntent, moneyEquals, normalizeMoney2, requestedSheetNumber, unsupportedTechnicalTokens } from "../lib/ai-office/product-agent-rules.ts";

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

test("no-price-list direct command enters structured preview path", () => {
  const command = "vazdushniy agregat kategorya och va u yerga BR +5pg Fn 43 narx 1232 qo'sh seo ga agregat deyish kerak";
  assert.equal(hasDirectProductCommandIntent(command), true);
  assert.equal(hasPriceListCommandIntent(command), true);
});

test("ordinary chat write claims are blocked", () => {
  assert.equal(chatReplyClaimsWrite("Mahsulot yaratildi. Product ID: abc"), true);
  assert.equal(chatReplyClaimsWrite("Siz uchun tavsif yozib beraman."), false);
  assert.equal(chatReplyClaimsWrite("Description maydonini o‘zim to‘ldiraman."), false);
});

test("technical numbers must be present in the user or deterministic lookup source", () => {
  assert.deepEqual(unsupportedTechnicalTokens([{ value: "Fn 43" }, { value: "R22" }], "BR +5PG Fn 43; lookup: R22"), []);
  assert.deepEqual(unsupportedTechnicalTokens([{ value: "380V" }], "BR +5PG Fn 43"), ["380v"]);
});

test("primary route uses the tool-calling loop instead of regex interpreters", async () => {
  const route = await readFile(new URL("../app/api/admin/ai-office/product-agent/route.ts", import.meta.url), "utf8");
  assert.match(route, /runProductAgentLoop/);
  assert.doesNotMatch(route, /interpretDirectProductCommand|interpretPriceListCommand|hasDirectProductCommandIntent|hasPriceListCommandIntent/);
});

test("agent exposes only read and draft tools, strong default model, and six-step cap", async () => {
  const loop = await readFile(new URL("../lib/ai-office/product-agent-loop.ts", import.meta.url), "utf8");
  assert.match(loop, /const MAX_TOOL_STEPS = 6/);
  assert.match(loop, /const DEFAULT_MODEL = "gpt-4\.1"/);
  for (const name of ["listCategories", "findProducts", "lookupPriceList", "proposeCategory", "buildProductDraft"]) assert.match(loop, new RegExp(`name: "${name}"`));
  assert.doesNotMatch(loop, /name: "(?:createProduct|updateProduct|createCategory)"/);
  assert.doesNotMatch(loop, /PRODUCT_AGENT_REFUSAL/);
});

test("agent prompt owns descriptions and limits questions to missing price", async () => {
  const loop = await readFile(new URL("../lib/ai-office/product-agent-loop.ts", import.meta.url), "utf8");
  assert.match(loop, /Barcha mahsulot maydonlarini O'ZING to'ldir/);
  assert.match(loop, /Savol faqat narx umuman topilmasa/);
  assert.match(loop, /Tavsifni o'zing yoz/);
  assert.match(loop, /"Yaratildi", ID yoki DB natijasini hech qachon o'ylab topma/);
});
