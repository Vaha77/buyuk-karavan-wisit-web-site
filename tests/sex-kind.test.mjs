import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/sex/rules.ts");

const cat = (slug, name) => ({ category: { slug, name }, partId: null });

test("Agregat categories: compressor on receiver, water / air units and kits", () => {
  for (const [slug, name] of [
    ["bitzer-resiver-bachok-ustida", "Bitzer Resiver bachok ustida"], ["resiver-ustidagi-kompressor-xueying", "Resiver ustidagi kompressor XUEYING"],
    ["bitzer-vadinoy-agregat", "Bitzer Vadinoy Agregat"], ["vazdushniy-agregat-xueying", "Vazdushniy Agregat XUEYING"],
    ["vadinoy-agregat-komplekti-xueying", "Vadinoy Agregat Komplekti XUEYING"], ["briliant-vazdushniy-agregat-komplekt", "Briliant Vazdushniy Agregat Komplekt"],
  ]) assert.equal(rules.isAgregatCategory({ slug, name }), true, slug);
});

test("Zapchast categories: bare compressor, receiver, condenser, evaporator, other parts", () => {
  for (const [slug, name] of [["briliant-kompressor", "Briliant Kompressor"], ["compressors", "Kompressorlar"], ["condensers", "Kondensatorlar"], ["evaporatorlar", "Evaporatorlar"], ["resiver", "Resiver"], ["pipes", "Mis quvurlar"]])
    assert.equal(rules.isAgregatCategory({ slug, name }), false, slug);
  assert.equal(rules.isAgregatCategory(null), false);
});

test("order kind follows the goods, not the form", () => {
  // Ordered through the zborka form, but a bare compressor → Zapchast.
  assert.equal(rules.orderKind({ type: "AGREGAT", items: [cat("briliant-kompressor", "Briliant Kompressor")] }), "ZAPCHAST");
  assert.equal(rules.orderKind({ type: "ZAPCHAST", items: [{ partId: "p1" }, cat("vazdushniy-agregat-xueying", "Vazdushniy Agregat XUEYING")] }), "AGREGAT");
  assert.equal(rules.orderKind({ type: "ZAPCHAST", items: [{ partId: "p1", category: null }] }), "ZAPCHAST");
  // Nothing known (product deleted): the form's type stays.
  assert.equal(rules.orderKind({ type: "AGREGAT", items: [{ partId: null, category: null }] }), "AGREGAT");
});

test("test orders get no queue number and do not shift real ones", () => {
  const positions = rules.queuePositions([
    { id: "a", status: "ACCEPTED", acceptedAt: "2026-10-10T08:00:00Z", isTest: true },
    { id: "b", status: "ACCEPTED", acceptedAt: "2026-10-10T09:00:00Z" },
    { id: "c", status: "ACCEPTED", acceptedAt: "2026-10-10T10:00:00Z", isTest: false },
  ]);
  assert.equal(positions.get("a"), undefined);
  assert.equal(positions.get("b"), 1);
  assert.equal(positions.get("c"), 2);
});

test("only SUPER_ADMIN marks test orders", () => {
  assert.equal(rules.canMarkTest("SUPER_ADMIN"), true);
  for (const role of ["ADMIN", "MANAGER", "SELLER", "WORKSHOP"]) assert.equal(rules.canMarkTest(role), false);
});
