import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/ai-office/photo-agent-rules.ts");
const { assessProcessedImage } = await import("../lib/ai-office/photo-agent-quality.ts");

const candidate = (id, name, category, hasMainImage = false) => ({ id, name, model: "BR +20PG", category, hasMainImage, mainImage: hasMainImage ? "https://x/1.png" : null });
const brFamily = [
  candidate("c1", "XUEYING BR +20PG yarim germetik kompressor", "Kompressor XUEYING"),
  candidate("c2", "XUEYING BR +20PG vazdushniy agregat FN43", "Vazdushniy Agregat XUEYING", true),
  candidate("c3", "XUEYING BR +20PG vazdushniy agregat komplekti FN43 DD160", "Vazdushniy agregat komplektlari"),
];

test("model query normalization: br +20pg = BR +20PG = br20pg", () => {
  assert.equal(rules.normalizePhotoQuery("br +20pg"), "br20pg");
  assert.equal(rules.normalizePhotoQuery("BR +20PG"), "br20pg");
  assert.equal(rules.normalizePhotoQuery("br20pg"), "br20pg");
});

test("off-domain requests are refused on the server; image attach wording is not", () => {
  for (const message of ["mahsulot narxini o'zgartir", "narxi 1200 qil", "tavsifini yoz", "yangi mahsulot qo‘sh", "mahsulot qo'sh BR +5PG", "kategoriyasini almashtir", "SEO title yoz"]) assert.equal(rules.isPhotoAgentOffDomain(message), true, message);
  for (const message of ["br +20pg", "BR +20PG vazdushniy agregat", "br +20pg asosiy qil", "rasmni BR +20PG mahsulotiga qo'sh", "shu rasmni mahsulotiga qo‘shib qo‘y br +20pg", ""]) assert.equal(rules.isPhotoAgentOffDomain(message), false, message);
});

test("search text keeps the model and kind, drops placement words", () => {
  assert.equal(rules.photoSearchText("br +20pg asosiy qil"), "br +20pg");
  assert.equal(rules.photoSearchText("rasmni BR +20PG mahsulotiga qo'sh"), "BR +20PG");
  assert.equal(rules.wantsMainPlacement("br +20pg asosiy qil"), true);
  assert.equal(rules.wantsMainPlacement("br +20pg"), false);
});

test("several matches → one question; kind in the message → no question", () => {
  assert.equal(rules.narrowPhotoCandidates(brFamily, "br +20pg").length, 3);
  assert.deepEqual(rules.narrowPhotoCandidates(brFamily, "BR +20PG vazdushniy agregat").map(item => item.id), ["c2"]);
  assert.deepEqual(rules.narrowPhotoCandidates(brFamily, "br20pg kompressor").map(item => item.id), ["c1"]);
  assert.deepEqual(rules.narrowPhotoCandidates(brFamily, "BR +20PG komplekt vazdushniy").map(item => item.id), ["c3"]);
  assert.deepEqual(rules.narrowPhotoCandidates(brFamily, "BR +5PG"), []);
});

test("the image recommendation becomes the first choice", () => {
  assert.deepEqual(rules.orderChoices(brFamily, "c2").map(item => item.id), ["c2", "c1", "c3"]);
  assert.deepEqual(rules.orderChoices(brFamily, null).map(item => item.id), ["c1", "c2", "c3"]);
  assert.deepEqual(rules.orderChoices(brFamily, "unknown").map(item => item.id), ["c1", "c2", "c3"]);
});

test("placement: no main → first is main; main exists → gallery; 'asosiy qil' → main (old one moves to gallery)", () => {
  assert.deepEqual(rules.planPlacements(3, false, false), ["main", "gallery", "gallery"]);
  assert.deepEqual(rules.planPlacements(2, true, false), ["gallery", "gallery"]);
  assert.deepEqual(rules.planPlacements(2, true, true), ["main", "gallery"]);
});

async function canvas(size, rect) {
  const base = sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } });
  if (!rect) return base.png().toBuffer();
  const box = await sharp({ create: { width: rect.w, height: rect.h, channels: 3, background: "#1f3b57" } }).png().toBuffer();
  return base.composite([{ input: box, left: rect.x, top: rect.y }]).png().toBuffer();
}

test("quality check: centered product passes; empty, small, tiny and cropped results fail", async () => {
  assert.deepEqual(await assessProcessedImage(await canvas(1500, { x: 400, y: 450, w: 700, h: 600 })), { ok: true });
  assert.deepEqual(await assessProcessedImage(await canvas(1500)), { ok: false, reason: "empty" });
  assert.deepEqual(await assessProcessedImage(new Uint8Array()), { ok: false, reason: "empty" });
  assert.deepEqual(await assessProcessedImage(await canvas(800, { x: 200, y: 200, w: 400, h: 400 })), { ok: false, reason: "too-small" });
  assert.deepEqual(await assessProcessedImage(await canvas(1500, { x: 700, y: 700, w: 150, h: 150 })), { ok: false, reason: "tiny-subject" });
  assert.deepEqual(await assessProcessedImage(await canvas(1500, { x: 0, y: 300, w: 900, h: 700 })), { ok: false, reason: "cropped" });
});

test("preview writes nothing; confirm is signed, keyed, idempotent and reuses the Foto Studio save path", async () => {
  const lib = await readFile(new URL("../lib/ai-office/photo-agent.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/admin/ai-office/photo-agent/route.ts", import.meta.url), "utf8");
  const confirm = await readFile(new URL("../app/api/admin/ai-office/photo-agent/confirm/route.ts", import.meta.url), "utf8");
  assert.match(lib, /"findProducts", "processPhoto", "buildPhotoPreview"/);
  assert.doesNotMatch(lib, /createProduct|updateProduct|priceUsd|attachGeneratedProductImage/);
  assert.doesNotMatch(route, /saveApprovedPhotoStudioImageAction|writeAudit|recordPhotoStudioCreation/);
  assert.match(lib, /mode: "card"/); assert.match(lib, /protectProduct: true/);
  assert.match(lib, /key: string; sha256: string/);
  assert.match(confirm, /verifyPhotoPreview/); assert.match(confirm, /saveApprovedPhotoStudioImageAction/);
  assert.match(confirm, /isPhotoPreviewConfirmed\(payload\)\) return Response\.json\(\{ success: true, skipped: true/);
  const mutations = await readFile(new URL("../lib/products/mutations.ts", import.meta.url), "utf8");
  assert.match(mutations, /\[url, \.\.\.previous\.images\]/);
});

test("sitemap does not publish the missing /projects index", async () => {
  const source = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /`\$\{SITE_URL\}\/projects`/);
  assert.match(source, /\/projects\/\$\{encodeURIComponent/);
});
