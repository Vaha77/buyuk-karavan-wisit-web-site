import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const c = await import("../lib/sex/categories.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

const CATEGORIES = [
  { id: "k", name: "Bitzer R22", workshopAssembly: true, workshopRole: "COMPRESSOR", workshopIssue: true },
  { id: "x", name: "FN/FNV Xitoy", workshopAssembly: true, workshopRole: "CONDENSER", workshopIssue: false },
  { id: "v", name: "Klapanlar", workshopAssembly: false, workshopRole: null, workshopIssue: true },
  { id: "dd", name: "Xitoy DD/DJ", workshopAssembly: false, workshopRole: null, workshopIssue: false },
];

test("flags: 'Zborkada ishlatiladi' needs a role (Kompressor / Kondensator); both flags may be on", () => {
  assert.deepEqual(c.normalizeFlags({ workshopAssembly: true, workshopRole: "COMPRESSOR", workshopIssue: true }), { ok: true, value: { workshopAssembly: true, workshopRole: "COMPRESSOR", workshopIssue: true } });
  assert.equal(c.normalizeFlags({ workshopAssembly: true, workshopRole: null, workshopIssue: false }).ok, false);
  assert.equal(c.normalizeFlags({ workshopAssembly: true, workshopRole: "OTHER", workshopIssue: false }).ok, false);
  assert.deepEqual(c.normalizeFlags({ workshopAssembly: false, workshopRole: "CONDENSER", workshopIssue: true }).value, { workshopAssembly: false, workshopRole: null, workshopIssue: true }, "no role without the assembly flag");
  assert.equal(c.flagsText({ workshopAssembly: true, workshopRole: "CONDENSER", workshopIssue: true }), "Zborkada ishlatiladi (Kondensator (FN/FNV)) · Sehdan alohida chiqadi");
  assert.equal(c.flagsText({ workshopAssembly: false, workshopRole: null, workshopIssue: false }), "Seh belgisi yo‘q");
  assert.equal(c.isCompressorCategory(CATEGORIES[0]), true);
  assert.equal(c.isCondenserCategory(CATEGORIES[1]), true);
  assert.equal(c.isCompressorCategory({ workshopAssembly: false, workshopRole: "COMPRESSOR" }), false, "a role without the flag does nothing");
});

test("Prays filter: Hammasi / Seh tovarlari / Zborkada / Alohida chiqadi", () => {
  const pick = filter => CATEGORIES.filter(category => c.matchesWorkshopFilter(category, filter)).map(category => category.id);
  assert.deepEqual(pick("all"), ["k", "x", "v", "dd"]);
  assert.deepEqual(pick("workshop"), ["k", "x", "v"]);
  assert.deepEqual(pick("assembly"), ["k", "x"]);
  assert.deepEqual(pick("issue"), ["k", "v"]);
  assert.equal(c.matchesWorkshopFilter(null, "workshop"), false);
  assert.deepEqual(c.WORKSHOP_FILTERS.map(item => item.label), ["Hammasi", "Seh tovarlari", "Zborkada", "Alohida chiqadi"]);
});

test("zapchast zayavkasi: only 'Sehdan alohida chiqadi' goods, grouped by category, with search", () => {
  const products = [
    { id: "p1", name: "Bitzer 2FES-3 kompressor", model: "2FES-3", basePriceUsd: 915, categoryId: "k" },
    { id: "p2", name: "Solenoid klapan", model: "3/8", basePriceUsd: 22, categoryId: "v" },
    { id: "p3", name: "Termo klapan TEX2", model: "", basePriceUsd: 48, categoryId: "v" },
    { id: "p4", name: "FN160", model: "FN160", basePriceUsd: 1228, categoryId: "x" },
    { id: "p5", name: "DD 30 havo sovutgich", model: "DD30", basePriceUsd: 410, categoryId: "dd" },
    { id: "p6", name: "Kategoriyasiz", model: "", basePriceUsd: 1, categoryId: null },
  ];
  const groups = c.issueGroups(products, CATEGORIES);
  assert.deepEqual(groups.map(group => [group.name, group.items.map(item => item.label)]), [["Bitzer R22", ["Bitzer 2FES-3 kompressor"]], ["Klapanlar", ["Solenoid klapan · 3/8", "Termo klapan TEX2"]]]);
  assert.deepEqual(c.searchIssueGroups(groups, "klapan 3/8").map(group => group.items.map(item => item.id)), [["p2"]]);
  assert.deepEqual(c.searchIssueGroups(groups, "bitzer").map(group => group.name), ["Bitzer R22"]);
  assert.deepEqual(c.searchIssueGroups(groups, "klapanlar").flatMap(group => group.items.map(item => item.id)), ["p2", "p3"], "category name matches too");
  assert.equal(c.issueGroups(products, CATEGORIES.map(category => ({ ...category, workshopIssue: false }))).length, 0, "nothing flagged → empty list");
});

test("condensers: 'FN160 · Xitoy' / 'FN160 · UCS' from the condenser categories; the standard one from the setting", () => {
  const categories = [...CATEGORIES, { id: "u", name: "FN/FNV UCS", workshopAssembly: true, workshopRole: "CONDENSER", workshopIssue: false }];
  const list = c.condenserList([
    { id: "a", name: "FN160 kondensator", brand: "X", model: "FN160", basePriceUsd: 1228, categoryId: "x" },
    { id: "b", name: "FN 160 kondensator", brand: "UCS", model: "", basePriceUsd: 1400, categoryId: "u" },
    { id: "d", name: "FNV200", brand: "X", model: "FNV200", basePriceUsd: null, categoryId: "x" },
    { id: "e", name: "DD30", brand: "X", model: "DD30", basePriceUsd: 400, categoryId: "dd" },
  ], categories);
  assert.deepEqual(list.map(item => [item.id, item.label, item.base]), [["b", "FN160 · UCS", 1400], ["a", "FN160 · Xitoy", 1228]], "priced condensers of condenser categories only");
  assert.equal(c.standardCondenser(list, "fn160", "x").id, "a");
  assert.equal(c.standardCondenser(list, "FN160", null), null);
  assert.equal(c.standardCondenser(list, "FN200", "x"), null);
  assert.equal(c.categoryShortName("FN/FNV Xitoy"), "Xitoy");
  assert.equal(c.categoryShortName("FNV UCS"), "UCS");
  assert.equal(c.categoryShortName("Kondensatorlar"), "Kondensatorlar");
});

test("wiring: Prays categories panel (Super Admin), activity history, zayavka from flags, old list archived, additive migration", async () => {
  const board = await read("../components/admin/sex/prays-board.tsx");
  assert.match(board, /Kategoriyalar · \{categories\.length\}/);
  assert.match(board, /Zborkada ishlatiladi/);
  assert.match(board, /Sehdan alohida chiqadi/);
  assert.match(board, /\{category\.productCount\} ta mahsulot/, "product count per row");
  assert.match(board, /Eski ro‘yxat \(arxiv\)/, "the old part list is renamed, not removed");
  assert.match(board, /Standart kondensator kategoriyasi/);
  const actions = await read("../app/admin/(protected)/prays/actions.ts");
  assert.match(actions, /export async function updateCategoryFlagsAction[\s\S]*?requireRole\("SUPER_ADMIN"\)/);
  assert.match(actions, /export async function setStandardCondenserAction[\s\S]*?requireRole\("SUPER_ADMIN"\)/);
  const mutations = await read("../lib/prays/mutations.ts");
  assert.match(mutations, /entityType: "PRODUCT_CATEGORY"[\s\S]*?summary: `Seh belgisi:/, "flag changes go to the activity history");
  assert.doesNotMatch(mutations, /product\.(update|updateMany)\([^)]*workshop/, "products are never changed by the flags");
  const service = await read("../lib/sex/service.ts");
  assert.match(service, /isIssueCategory\(product\.category\)/, "zayavka goods come from the issue flag");
  assert.doesNotMatch(service.slice(service.indexOf("export async function createZapchastOrder")), /sexPart\.findMany/, "the old list is not used for zayavkas");
  assert.match(service, /buildZborkaCatalog\(products, parts, \{ categories, standardCondenserCategoryId \}\)/);
  const newPage = await read("../app/admin/(sex)/seh/new/page.tsx");
  assert.match(newPage, /getIssueGroups/);
  const form = await read("../components/admin/sex/new-order.tsx");
  assert.match(form, /Tarkibi <small>· majburiy<\/small>/);
  assert.match(form, /placeholder="kelishiladi"/);
  assert.match(form, /condenserWarning/);
  const rows = await read("../components/admin/sex/orders-board.tsx");
  assert.match(rows, /<optgroup key=\{group\} label=\{group\}>/, "goods grouped by category");
  assert.match(rows, /Seh mahsulotini qidirish/);
  const css = await read("../components/admin/sex/sex.css");
  assert.match(css, /@media\(max-width:760px\)\{\.sx-cat-row\{grid-template-columns:1fr 1fr\}/, "category rows wrap on phones");
  const migration = await read("../prisma/migrations/20261021090000_add_workshop_category_flags/migration.sql");
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), /\bDROP\b|DELETE FROM|\bTRUNCATE\b|ALTER COLUMN|UPDATE /i);
  assert.match(migration, /DEFAULT false/, "nothing is flagged automatically");
});
