import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const c = await import("../lib/instagram/cooler.ts");
const hp = await import("../lib/instagram/heat-pump.ts");
const read = async path => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const KIT = { minTons: 100, maxTons: 100, name: "20 HP komplekt", items: ["Kompressor 20 HP", "Kondensator FN-160"], priceUsd: 4900, isActive: true };
const ALL = c.coolerTexts(null), TEXTS = ALL.uz;
const state = (over = {}) => ({ step: "chambers", tons: 300, chambers: null, region: null, misses: 0, ...over });

test("tonnage from a comment: every spelling", () => {
  for (const text of ["300", "300 tonna", "300t", "300 t", "300 тонна", "300т", "300 тонн", "300 tonnalik", "300 тн", "@ali 300 tonna", "300 kerak", "Menga 300 tonnalik kerak"]) assert.equal(c.extractTons(text), 300, text);
});

test("tonnage: phones, other units, no number → null", () => {
  for (const text of ["+998 90 123 45 67", "901234567", "zo'r 🔥", "150 kv", "5000$", "20 hp", "2", "", null, "100 va 200"]) assert.equal(c.extractTons(text), null, String(text));
});

test("post type: teplonasos “300” is m², xolodilnik “300 tonna” is tonnage; only the global account", () => {
  const heat = { heatPump: true, cooler: false }, cool = { heatPump: false, cooler: true };
  assert.equal(c.coolerTons(heat, "global", "300"), null, "teplonasos post is never xolodilnik");
  assert.deepEqual(hp.heatPumpByKeywords("300"), { kind: "HEAT_PUMP", intent: "calc", m2: 300 });
  assert.equal(c.coolerTons(cool, "global", "300 tonna"), 300);
  assert.equal(c.coolerTons(cool, "eshikmaster1", "300 tonna"), null, "other accounts never");
  assert.equal(c.coolerTons({ heatPump: false, cooler: false }, "global", "300 tonna"), null, "plain price post untouched");
  assert.equal(c.coolerTons(null, "global", "300"), null);
});

test("chambers from a Direct answer", () => {
  assert.deepEqual(c.extractChambers("3"), { count: 3, size: null });
  assert.deepEqual(c.extractChambers("3 ta"), { count: 3, size: null });
  assert.deepEqual(c.extractChambers("3 ta 100 dan"), { count: 3, size: 100 });
  assert.deepEqual(c.extractChambers("2 ta 150 dan"), { count: 2, size: 150 });
  assert.deepEqual(c.extractChambers("100 tadan 3 ta"), { count: 3, size: 100 });
  assert.deepEqual(c.extractChambers("3x100"), { count: 3, size: 100 });
  assert.deepEqual(c.extractChambers("bitta"), { count: 1, size: null });
  assert.deepEqual(c.extractChambers("ikkita 150 lik"), { count: 2, size: 150 });
  assert.deepEqual(c.extractChambers("3 камеры по 100"), { count: 3, size: 100 });
  for (const text of ["bilmayman", "300", "", "qancha turadi"]) assert.equal(c.extractChambers(text), null, text);
});

test("price: Prays base + 10 % rounded up to whole dollars, manual price only as a fallback", () => {
  const product = { basePriceUsd: 4454, priceUsd: 4800, archivedAt: null };
  assert.equal(c.kitPrice({ priceUsd: 1000 }, product, 10), 4900, "4454 × 1.1 = 4899.4 → 4900");
  assert.equal(c.kitPrice({ priceUsd: 1000 }, { ...product, basePriceUsd: null }, 10), 4800, "selling price when no base");
  assert.equal(c.kitPrice({ priceUsd: 1000 }, { ...product, archivedAt: new Date() }, 10), 1000, "archived → fallback");
  assert.equal(c.kitPrice({ priceUsd: 1000 }, null, 10), 1000);
  assert.equal(c.kitPrice({ priceUsd: null }, null, 10), null);
  assert.equal(c.priceText(4900, "12750"), "$4 900 (~62.5 mln so'm)");
  assert.equal(c.priceText(4900, null), "$4 900");
});

test("kit choice and total = chambers × kit price, in $ and so‘m", () => {
  assert.equal(c.pickKit(100, [KIT]).name, "20 HP komplekt");
  assert.equal(c.pickKit(150, [KIT]), null);
  assert.equal(c.pickKit(100, [{ ...KIT, isActive: false }]), null);
  assert.equal(c.totalUsd(KIT, 3), 14700);
  assert.equal(c.totalUsd({ priceUsd: null }, 3), null);
  const text = c.kitText(TEXTS, KIT, 3, "12750");
  assert.match(text, /✅ Kompressor 20 HP/);
  assert.match(text, /Bitta komplekt: \$4 900 \(~62\.5 mln so'm\)/);
  assert.match(text, /Jami \(3 ta\): \$14 700 \(~187\.4 mln so'm\)/);
  assert.match(text, /faqat elektr kabelini/);
  assert.match(text, /Qaysi viloyatdasiz/);
  assert.match(c.kitText(ALL.ru, KIT, 3, "12750", "ru"), /Итого \(3 шт\): \$14 700 \(~187\.4 млн сум\)/);
});

test("no price → seller text, no total line", () => {
  const text = c.kitText(TEXTS, { ...KIT, priceUsd: null }, 3);
  assert.match(text, /Narxni sotuvchimiz aniq aytadi/);
  assert.doesNotMatch(text, /Jami/);
});

test("first DM suggests tons / 100 chambers, in Uzbek and Russian", () => {
  assert.equal(c.askText(TEXTS, 300), "Assalomu alaykum! 300 tonnalik xolodilnik — zo'r 👍 Kamerani nechta qilmoqchisiz? Masalan: 3 ta 100 tonnalik.");
  assert.match(c.askText(ALL.ru, 300), /^Здравствуйте! Холодильник на 300 тонн/);
});

test("conversation: chambers → kit, region, phone → lead", () => {
  const kit = c.coolerTurn(state(), "3 ta 100 dan", [KIT], TEXTS);
  assert.equal(kit.data.step, "contact");
  assert.equal(kit.data.chambers, 3);
  assert.equal(kit.data.model, "3 × 20 HP komplekt = $14 700");
  assert.equal(kit.lead, undefined);
  const region = c.coolerTurn(state({ step: "contact", chambers: 3 }), "Samarqanddaman", [KIT], TEXTS);
  assert.deepEqual(region, { reply: TEXTS.phone, data: { region: "Samarqand" } });
  const done = c.coolerTurn(state({ step: "contact", chambers: 3, region: "Samarqand" }), "90 123 45 67", [KIT], TEXTS);
  assert.equal(done.lead, true);
  assert.deepEqual(done.data, { step: "done", phone: "+998901234567", region: "Samarqand" });
  assert.equal(c.coolerTurn(state({ step: "done" }), "rahmat", [KIT], TEXTS).reply, null);
});

test("a chamber size not in the table (150 t, 30 t): no price, “the seller calculates” + lead", () => {
  for (const [text, size] of [["2 ta 150 dan", 150], ["10 ta 30 dan", 30], ["2", 150]]) {
    const turn = c.coolerTurn(state(), text, [KIT], TEXTS);
    assert.equal(turn.lead, true, text);
    assert.equal(turn.data.step, "contact");
    assert.match(turn.reply, new RegExp(`${size} tonnalik kamera uchun narxni sotuvchimiz aniq hisoblaydi`));
    assert.doesNotMatch(turn.reply, /\$/);
  }
});

test("unclear twice → the seller takes over (with a lead)", () => {
  const first = c.coolerTurn(state(), "bilmayman", [KIT], TEXTS);
  assert.equal(first.handoff, undefined);
  assert.equal(first.data.misses, 1);
  const second = c.coolerTurn(state({ misses: 1 }), "hmm", [KIT], TEXTS);
  assert.equal(second.handoff, true);
  assert.equal(second.lead, true);
  assert.equal(second.reply, "Sotuvchimiz hozir yozadi");
  assert.equal(c.coolerTurn(state({ step: "handoff" }), "3", [KIT], TEXTS).reply, null);
});

test("duplicate protection: one flow per person per post, inactive post skipped", () => {
  assert.equal(c.coolerAction(null, false, true).type, "cooler");
  assert.equal(c.coolerAction({ isActive: true }, true, true).type, "skip");
  assert.equal(c.coolerAction({ isActive: false }, false, true).type, "skip");
  assert.equal(c.coolerAction(null, false, false).publicReply, false);
});

test("admin texts override defaults per language, empty keeps the default", () => {
  const texts = c.coolerTexts({ uz: { reply: "  Rahmat 🙌 ", ask: "" } });
  assert.equal(texts.uz.reply, "Rahmat 🙌");
  assert.equal(texts.uz.ask, c.COOLER_TEXTS.uz.ask);
  assert.equal(texts.ru.reply, c.COOLER_TEXTS.ru.reply);
});

test("wiring: the teplonasos thread / Direct handler is reused, leads go to the Instagram admins", async () => {
  const [bot, service, direct, telegram, migration] = await Promise.all([read("../lib/instagram/heat-pump-bot.ts"), read("../lib/instagram/service.ts"), read("../lib/instagram/direct.ts"), read("../lib/telegram/service.ts"), read("../prisma/migrations/20261111090000_ig_cooler/migration.sql")]);
  assert.match(bot, /cooler = thread\.flow === "cooler"/, "same answer(): mute, 5-reply limit, claim");
  assert.match(service, /openThread\(\{[^}]*tons: tons \?\? undefined \}\)/, "same thread + recipient_id binding");
  assert.match(service, /OR: \[\{ heatPump: true \}, \{ cooler: true \}\]/, "reply-comments on xolodilnik posts");
  assert.match(direct, /flow: "heat"/, "xolodilnik Direct cards are not the teplonasos private chat");
  assert.match(telegram, /if\(isCoolerLead\(row\)\)[^\n]*notifyInstagramAdmins/);
  assert.doesNotMatch(migration, /DROP |DELETE FROM|RENAME /i, "additive");
});
