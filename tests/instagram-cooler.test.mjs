import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const c = await import("../lib/instagram/cooler.ts");

const KIT = { minTons: 100, maxTons: 100, name: "20 HP komplekt", items: ["Kompressor 20 HP", "Kondensator FN-160"], priceUsd: 4500, isActive: true };
const TEXTS = c.coolerTexts(null);
const state = (over = {}) => ({ step: "chambers", tons: 300, chambers: null, region: null, misses: 0, ...over });

test("tonnage from a comment: every spelling", () => {
  for (const text of ["300", "300 tonna", "300t", "300 t", "300 тонна", "300т", "300 tonnalik", "300 тн", "@ali 300 tonna", "300 kerak", "Menga 300 tonnalik kerak"]) assert.equal(c.extractTons(text), 300, text);
});

test("tonnage: phones, other units, no number → null", () => {
  for (const text of ["+998 90 123 45 67", "901234567", "zo'r 🔥", "150 kv", "5000$", "20 hp", "2", "", null, "100 va 200"]) assert.equal(c.extractTons(text), null, String(text));
});

test("chambers from a Direct answer", () => {
  assert.deepEqual(c.extractChambers("3"), { count: 3, size: null });
  assert.deepEqual(c.extractChambers("3 ta"), { count: 3, size: null });
  assert.deepEqual(c.extractChambers("3 ta 100 dan"), { count: 3, size: 100 });
  assert.deepEqual(c.extractChambers("100 tadan 3 ta"), { count: 3, size: 100 });
  assert.deepEqual(c.extractChambers("3x100"), { count: 3, size: 100 });
  assert.deepEqual(c.extractChambers("2 та камера"), { count: 2, size: null });
  for (const text of ["bilmayman", "300", "", "qancha turadi"]) assert.equal(c.extractChambers(text), null, text);
});

test("kit choice and total price = chambers × kit price", () => {
  assert.equal(c.pickKit(100, [KIT]).name, "20 HP komplekt");
  assert.equal(c.pickKit(150, [KIT]), null);
  assert.equal(c.pickKit(100, [{ ...KIT, isActive: false }]), null);
  assert.equal(c.totalUsd(KIT, 3), 13500);
  assert.equal(c.totalUsd({ priceUsd: null }, 3), null);
  const text = c.kitText(TEXTS, KIT, 3);
  assert.match(text, /✅ Kompressor 20 HP/);
  assert.match(text, /Bitta komplekt: \$4 500/);
  assert.match(text, /Jami \(3 ta\): \$13 500/);
  assert.match(text, /faqat elektr kabelini/);
  assert.match(text, /Qaysi viloyatdasiz/);
});

test("no price → seller text, no total line", () => {
  const text = c.kitText(TEXTS, { ...KIT, priceUsd: null }, 3);
  assert.match(text, /Narxni sotuvchimiz aniq aytadi/);
  assert.doesNotMatch(text, /Jami/);
});

test("first DM suggests tons / 100 chambers", () => {
  assert.equal(c.askText(TEXTS, 300), "Assalomu alaykum! 300 tonnalik xolodilnik — zo'r 👍 Kamerani nechta qilmoqchisiz? Masalan: 3 ta 100 tonnalik.");
});

test("conversation: chambers → kit, region, phone → lead", () => {
  const kit = c.coolerTurn(state(), "3 ta 100 dan", [KIT], TEXTS);
  assert.equal(kit.data.step, "contact");
  assert.equal(kit.data.chambers, 3);
  assert.equal(kit.data.kit, "3 × 20 HP komplekt = $13 500");
  const region = c.coolerTurn(state({ step: "contact", chambers: 3 }), "Samarqanddaman", [KIT], TEXTS);
  assert.deepEqual(region, { reply: TEXTS.phone, data: { region: "Samarqand" } });
  const done = c.coolerTurn(state({ step: "contact", chambers: 3, region: "Samarqand" }), "90 123 45 67", [KIT], TEXTS);
  assert.equal(done.lead, true);
  assert.deepEqual(done.data, { step: "done", phone: "+998901234567", region: "Samarqand" });
  assert.equal(c.coolerTurn(state({ step: "done" }), "rahmat", [KIT], TEXTS).reply, null);
});

test("unclear twice / no kit → the seller takes over", () => {
  const first = c.coolerTurn(state(), "bilmayman", [KIT], TEXTS);
  assert.equal(first.handoff, undefined);
  assert.equal(first.data.misses, 1);
  const second = c.coolerTurn(state({ misses: 1 }), "hmm", [KIT], TEXTS);
  assert.equal(second.handoff, true);
  assert.equal(second.reply, "Sotuvchimiz hozir yozadi");
  assert.equal(c.coolerTurn(state(), "2", [KIT], TEXTS).handoff, true, "150 t chamber has no kit");
  assert.equal(c.coolerTurn(state({ step: "handoff" }), "3", [KIT], TEXTS).reply, null);
});

test("duplicate protection: one flow per person per post, inactive post skipped", () => {
  assert.equal(c.coolerAction(null, false, true).type, "cooler");
  assert.equal(c.coolerAction({ isActive: true }, true, true).type, "skip");
  assert.equal(c.coolerAction({ isActive: false }, false, true).type, "skip");
  assert.equal(c.coolerAction(null, false, false).publicReply, false);
});

test("admin texts override defaults, empty keeps the default", () => {
  const texts = c.coolerTexts({ reply: "  Rahmat 🙌 ", ask: "" });
  assert.equal(texts.reply, "Rahmat 🙌");
  assert.equal(texts.ask, c.COOLER_TEXTS.ask);
});
