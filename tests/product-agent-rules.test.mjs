import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { categoryMatches, categorySimilarity, chatReplyClaimsWrite, directPriceIsValid, findModelHeaderColumns, hasDirectProductCommandIntent, hasPriceListCommandIntent, moneyEquals, normalizeAgentModel, normalizeMoney2, requestedSheetNumber, unsupportedTechnicalTokens } from "../lib/ai-office/product-agent-rules.ts";

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

test("agent exposes only read and draft tools, strong default model, and ten-step cap", async () => {
  const loop = await readFile(new URL("../lib/ai-office/product-agent-loop.ts", import.meta.url), "utf8");
  assert.match(loop, /const MAX_TOOL_STEPS = 10/);
  assert.match(loop, /const DEFAULT_MODEL = "gpt-4\.1"/);
  for (const name of ["listCategories", "findProducts", "lookupPriceList", "proposeCategory", "buildProductDraft"]) assert.match(loop, new RegExp(`name: "${name}"`));
  assert.doesNotMatch(loop, /name: "(?:createProduct|updateProduct|createCategory)"/);
  assert.doesNotMatch(loop, /PRODUCT_AGENT_REFUSAL/);
});

test("server normalizes model and category aliases", () => {
  assert.equal(normalizeAgentModel("BR +5pg Fn 43"), "BR +5PG");
  assert.equal(normalizeAgentModel("br-8pz"), "BR -8PZ");
  assert.equal(categorySimilarity("Vazdushniy Agregat XUEING", "vazdushniy agregat"), 1);
  assert.ok(categorySimilarity("Kompressor XUEYING", "vazdushniy agregat") < .66);
});

test("route returns payload under preview and loop accumulates rows", async () => {
  const route = await readFile(new URL("../app/api/admin/ai-office/product-agent/route.ts", import.meta.url), "utf8");
  const loop = await readFile(new URL("../lib/ai-office/product-agent-loop.ts", import.meta.url), "utf8");
  assert.match(route, /preview: response\.payload/);
  assert.match(loop, /rows\.push\(row\)/);
  assert.match(loop, /rows: found/);
  assert.match(loop, /calculateFinalPrice\(evidence\.price, markup/);
  assert.match(loop, /tool_choice: toolChoice/);
});

test("draft repair replaces model copy with factual server templates", async () => {
  const loop = await readFile(new URL("../lib/ai-office/product-agent-loop.ts", import.meta.url), "utf8");
  for (const name of ["resolveAgentModel", "resolveAgentBrand", "buildAgentProductName", "buildAgentProductCopy", "buildAgentProductTags"]) assert.match(loop, new RegExp(`${name}\\(`));
  assert.match(loop, /shortDescription: copy\.shortDescription, description: copy\.description/);
  assert.doesNotMatch(loop, /args\.draft\.(?:shortDescription|description|seoTitle|seoDescription|tags|name)\b/);
  const preview = await readFile(new URL("../lib/ai-office/product-agent-preview.ts", import.meta.url), "utf8");
  assert.match(preview, /containsForbiddenClaim\(/);
  assert.match(preview, /findReusableCategory\(row\.newCategoryName\)/);
});

test("agent prompt owns descriptions and limits questions to missing price", async () => {
  const loop = await readFile(new URL("../lib/ai-office/product-agent-loop.ts", import.meta.url), "utf8");
  assert.match(loop, /Barcha mahsulot maydonlarini O'ZING to'ldir/);
  assert.match(loop, /Savol faqat narx foydalanuvchida ham, price-listda ham umuman topilmasa/);
  assert.match(loop, /Tavsifni o'zing yoz/);
  assert.match(loop, /"Yaratildi", ID yoki DB natijasini o'ylab topma/);
});

test("P0 regression: server derives brand, model, name, copy and tags for the Vaha command", async () => {
  const r = await import("../lib/ai-office/product-agent-rules.ts");
  const message = "vazdushniy agregat kategorya och va u yerga BR +5pg Fn 43 narx 1232 qo'sh seo ga agregat deyish kerak";
  const categoryName = "Vazdushniy Agregat XUEYING";
  // The LLM returned brand "BR" and model "+5pg Fn 43" in the real test.
  const model = r.resolveAgentModel({ draftModel: "+5pg Fn 43", draftBrand: "BR", message });
  assert.equal(model, "BR +5PG");
  const brand = r.resolveAgentBrand({ model, existingBrands: [], draftBrand: "BR" });
  assert.equal(brand, "XUEYING");
  assert.equal(r.resolveAgentBrand({ model, existingBrands: ["XUEING"], draftBrand: "" }), "XUEYING");
  const kind = r.detectAgentProductKind({ categoryName, message });
  assert.equal(kind, "air");
  const condenser = r.extractCondenserCode(message), evaporator = r.extractEvaporatorCode(message);
  assert.equal(condenser, "FN43"); assert.equal(evaporator, "");
  assert.equal(r.extractDirectPrice(message), "1232.00");
  const terms = r.extractSeoTerms(message);
  assert.deepEqual(terms, ["agregat"]);
  const name = r.buildAgentProductName({ brand, model, kind, categoryName, condenser, evaporator });
  assert.equal(name, "XUEYING BR +5PG vazdushniy agregat FN43");
  const copy = r.buildAgentProductCopy({ name, brand, model, kind, categoryName, condenser, evaporator, requiredTerms: terms });
  assert.equal(r.containsForbiddenClaim(Object.values(copy).join(" ")), false);
  assert.ok(copy.seoTitle.length >= 20 && copy.seoTitle.length <= 160);
  assert.ok(copy.seoDescription.length >= 80);
  assert.match(copy.description, /Kondensator: FN43/);
  assert.match(copy.seoTitle.toLowerCase(), /agregat/);
  assert.deepEqual(r.buildAgentProductTags({ brand, model, kind, condenser, evaporator, requiredTerms: terms }), ["XUEYING", "BR +5PG", "FN43", "agregat", "vazdushniy agregat", "havoli agregat", "sovutish agregati"]);
});

test("model extraction follows (BR|BF)±digits+letters and keeps FN/DD codes separate", async () => {
  const r = await import("../lib/ai-office/product-agent-rules.ts");
  assert.deepEqual(r.extractProductModels("br +20pg, BF-8PZ va br20pg"), ["BR +20PG", "BF -8PZ", "BR 20PG"]);
  assert.deepEqual(r.extractProductModels("BR 5 FN43"), ["BR 5"]);
  assert.equal(r.extractEvaporatorCode("komplekt dd 160"), "DD160");
  assert.equal(r.extractCondenserCode("FNV-30"), "FNV30");
  assert.equal(r.compactModel("BR +20PG"), r.compactModel("br20pg"));
});

test("name templates per product kind, without repeated words", async () => {
  const r = await import("../lib/ai-office/product-agent-rules.ts");
  const base = { brand: "XUEYING", model: "BR +5PG", condenser: "", evaporator: "" };
  assert.equal(r.buildAgentProductName({ ...base, kind: "compressor", categoryName: "Kompressor XUEYING" }), "XUEYING BR +5PG yarim germetik kompressor");
  assert.equal(r.buildAgentProductName({ ...base, kind: "water", categoryName: "Vadinoy agregatlar", facts: { waterCondenser: "5HP" } }), "XUEYING BR +5PG vadinoy agregat (5HP kondensator)");
  assert.equal(r.buildAgentProductName({ ...base, kind: "air-kit", categoryName: "", condenser: "FN43", evaporator: "DD160" }), "XUEYING BR +5PG vazdushniy agregat komplekti FN43 DD160");
  assert.equal(r.buildAgentProductName({ ...base, brand: "XUEYING", kind: "other", categoryName: "XUEYING qismlar" }), "XUEYING BR +5PG qismlar");
});

test("forbidden marketing words are matched as whole words only", async () => {
  const r = await import("../lib/ai-office/product-agent-rules.ts");
  for (const word of ["samarali", "samaradorlik", "chidamli", "zamonaviy", "yuqori", "sifatli", "ishonchli", "tejamkor", "eng", "maishiy"]) assert.equal(r.containsForbiddenClaim(`Bu ${word} mahsulot`), true, word);
  assert.equal(r.containsForbiddenClaim("engil ramka, Brend: XUEYING"), false);
});

test("category matching: canonical equality or kind-compatible similarity, never substring", async () => {
  const r = await import("../lib/ai-office/product-agent-rules.ts");
  assert.equal(r.categorySimilarity("Vazdushniy Agregat XUEYING", "vazdushniy agregat"), 1);
  assert.equal(r.categorySimilarity("Havoli agregatlar", "Vazdushniy agregat"), 1);
  assert.equal(r.categorySimilarity("Vazdushniy agregat komplektlari", "vazdushniy agregat"), 0);
  assert.equal(r.categorySimilarity("Vadinoy agregatlar", "vazdushniy agregat"), 0);
  assert.equal(r.categoryMatches({ name: "Vazdushniy agregat komplektlari", slug: "x" }, "Vazdushniy agregatlar", ["havoli agregat"]), false);
});
