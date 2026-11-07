import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const hp = await import("../lib/instagram/heat-pump.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

const MODELS = [
  { brand: "Aire", hp: 3, nominalKw: 10, winterKw: 6.6, voltage: 220, priceUsd: 1300, bufferIncluded: false, isActive: true },
  { brand: "Aire", hp: 6, nominalKw: 19, winterKw: 12.5, voltage: 220, priceUsd: 2650, bufferIncluded: true, isActive: true },
  { brand: "Aire", hp: 8, nominalKw: 24, winterKw: 15.8, voltage: 220, priceUsd: 3250, bufferIncluded: true, isActive: true },
  { brand: "Aire", hp: 12, nominalKw: 36, winterKw: 23.7, voltage: 380, priceUsd: 4100, bufferIncluded: true, isActive: true },
];
const BUFFER = { usd: 145, liters: 60 };
const RATE = "12750";

test("m² from a comment: every format", () => {
  for (const text of ["150", "150 kv", "150kv", "150 kvadrat", "150 m2", "150m²", "150 metr", "150 кв", "уй 150", "Uyim 150 kv narxi qancha?"]) assert.equal(hp.extractM2(text), 150, text);
  assert.equal(hp.extractM2("10x12"), 120);
  assert.equal(hp.extractM2("10х12"), 120, "Cyrillic х");
  assert.equal(hp.extractM2("10*12"), 120);
  assert.equal(hp.extractM2("2 qavat 100 dan"), 200);
  assert.equal(hp.extractM2("2 этаж по 100"), 200);
});

test("m²: phones, years, prices, emoji and out-of-range numbers are not areas", () => {
  for (const text of ["+998 90 123 45 67", "90 123 45 67", "901234567", "2024", "1300$", "$1300", "5 mln so'm", "🔥", "🔥🔥🔥", "narxi qancha", "5", "5000 kv", "", null]) assert.equal(hp.extractM2(text), null, String(text));
});

test("model choice: insulated need picks the model, the uninsulated line names a bigger one", () => {
  const pick = m2 => hp.pickHeatPump(m2, MODELS);
  const label = model => model && hp.modelLabel(model);
  const cases = { 60: ["Aire 3 HP · 10 kW", "Aire 6 HP · 19 kW"], 80: ["Aire 3 HP · 10 kW", "Aire 6 HP · 19 kW"], 150: ["Aire 6 HP · 19 kW", "Aire 12 HP · 36 kW"], 155: ["Aire 6 HP · 19 kW", "Aire 12 HP · 36 kW"], 160: ["Aire 8 HP · 24 kW", "Aire 12 HP · 36 kW"], 200: ["Aire 12 HP · 36 kW", null], 290: ["Aire 12 HP · 36 kW", null] };
  for (const [m2, [model, bigger]] of Object.entries(cases)) {
    const result = pick(Number(m2));
    assert.equal(result.big, false, m2);
    assert.equal(label(result.model), model, `${m2} model`);
    assert.equal(label(result.bigger), bigger, `${m2} bigger`);
  }
  assert.deepEqual(pick(300), { big: true, hp: 12, kw: 36 });
  assert.deepEqual(pick(500), { big: true, hp: 20, kw: 61 });
  assert.equal(label(hp.pickHeatPump(60, MODELS.map(item => item.hp === 3 ? { ...item, isActive: false } : item)).model), "Aire 6 HP · 19 kW", "inactive models are skipped");
});

test("HISOB XABARI: price as is (no markup), so‘m from the rate, buffer / 380V / fankoyl / AI note / both phones", () => {
  const six = hp.calcMessage(150, MODELS, RATE, BUFFER).text;
  assert.match(six, /^Assalomu alaykum! 150 m² uyingiz uchun mos teplonasos:/);
  assert.match(six, /💵 Narxi: \$2 650 \(~33\.8 mln so'm, MB kursi bo'yicha\) — bufer bak bilan/);
  assert.match(six, /Uteplitsiz bo'lsa, quvvat yetmay qolishi mumkin — unda Aire 12 HP · 36 kW kerak bo'ladi\./);
  assert.doesNotMatch(six, /Bufer bak narxga kirmaydi|380V/);
  for (const line of ["Xonalarga fankoyl (ichki blok) o'rnatish qo'shimcha", "AI tomonidan", "+998 99 520 99 99", "+998 91 637 77 77", "📞 Telefon raqamingizni qoldiring"]) assert.ok(six.includes(line), line);

  const three = hp.calcMessage(60, MODELS, RATE, BUFFER);
  assert.match(three.text, /⚠️ Bufer bak narxga kirmaydi — 60 L, \$145 \(~1\.8 mln so'm\)\./);
  assert.doesNotMatch(three.text, /— bufer bak bilan/);
  assert.ok(three.text.length <= 1000, `Instagram limit: ${three.text.length}`);

  const twelve = hp.calcMessage(200, MODELS, RATE, BUFFER).text;
  assert.match(twelve, /⚡ Bu model 380V \(3 faza\) tokda ishlaydi\./);
  assert.match(twelve, /\$4 100 \(~52\.3 mln so'm/);
  assert.doesNotMatch(twelve, /Uteplitsiz bo'lsa/, "no bigger model → no line");
  assert.match(hp.calcMessage(160, MODELS, RATE, BUFFER).text, /\$3 250 \(~41\.4 mln so'm/);
});

test("big project: HP / kW only, no price, never “yo'q”", () => {
  for (const [m2, hpValue, kw] of [[300, 12, 36], [500, 20, 61]]) {
    const calc = hp.calcMessage(m2, MODELS, RATE, BUFFER);
    assert.equal(calc.big, true);
    assert.equal(calc.priceUsd, null);
    assert.match(calc.text, new RegExp(`^Assalomu alaykum! ${m2} m² uyingizni isitish uchun taxminan ${hpValue} HP · ${kw} kW quvvatli teplonasos kerak`));
    assert.doesNotMatch(calc.text, /\$|mln so'm|yo'q|йўқ|нет/);
    for (const line of ["AI tomonidan", "+998 99 520 99 99", "+998 91 637 77 77", "📞 Telefon raqamingizni qoldiring"]) assert.ok(calc.text.includes(line), line);
  }
});

test("comment flow: price ask → m² question, m² → calc, off-topic → call-center without Direct", () => {
  for (const text of ["narx", "narxi qancha", "+", "цена", "сколько"]) assert.deepEqual(hp.heatPumpByKeywords(text), { kind: "HEAT_PUMP", intent: "ask", m2: null }, text);
  assert.deepEqual(hp.heatPumpByKeywords("150 kv narxi qancha?"), { kind: "HEAT_PUMP", intent: "calc", m2: 150 });
  assert.deepEqual(hp.heatPumpByKeywords("🔥🔥"), { kind: "POSITIVE" });
  assert.equal(hp.heatPumpByKeywords("qimmat ekan").kind, "NEGATIVE");
  assert.equal(hp.heatPumpByKeywords("issiq suv ham beradimi"), null, "unclear → AI");

  const ask = hp.heatPumpOutgoing("ask", {});
  assert.equal(ask.reply, "Uyingiz necha m²? Direct'ga yozdik 📩");
  assert.equal(ask.dm, "Assalomu alaykum! Mos teplonasos va narxini aytishimiz uchun uyingiz necha m²?");
  assert.deepEqual(hp.heatPumpOutgoing("calc", { m2: 150, calc: "HISOB" }), { reply: "150 m² uchun hisobni Direct'ga yubordik 📩", dm: "HISOB" });
  const question = hp.heatPumpOutgoing("question", { answer: "Ha, suv isitadi." });
  assert.equal(question.reply, "Javobni Direct'ga yozdik 📩");
  assert.match(question.dm, /Ha, suv isitadi\.\n\nMos teplonasos va narxini aytishimiz uchun uyingiz necha m²\?$/);
  assert.deepEqual(hp.heatPumpOutgoing("other", {}), { reply: "Bu savol bo'yicha call-centerimizga murojaat qiling: +998 91 637 77 77", dm: null });

  assert.deepEqual(hp.heatPumpFromAi({ m2: null, topic: "other" }), { kind: "HEAT_PUMP", intent: "other", m2: null });
  assert.deepEqual(hp.heatPumpFromAi({ m2: 120, topic: "heatpump" }), { kind: "HEAT_PUMP", intent: "calc", m2: 120 });
  assert.deepEqual(hp.heatPumpFromAi({ m2: 5000, topic: "praise" }), { kind: "POSITIVE" }, "AI m² out of range is ignored");
  assert.deepEqual(hp.heatPumpFromAi({ m2: null, topic: "spam" }), { kind: "SPAM" });
});

test("one public reply and one Direct per person per post", () => {
  assert.deepEqual(hp.heatPumpAction({ isActive: true }, false, true), { type: "heatpump", publicReply: true });
  assert.equal(hp.heatPumpAction({ isActive: true }, true, true).type, "skip", "second comment of the same person → no reply");
  assert.equal(hp.heatPumpAction({ isActive: false }, false, true).type, "skip");
  assert.deepEqual(hp.heatPumpAction({ isActive: true }, false, false), { type: "heatpump", publicReply: false }, "over the daily limit: Direct only");
});

test("Direct chat: 5 answers, then the call line once, then silence; a person's message mutes it for 24 h", () => {
  const now = new Date("2026-11-07T10:00:00Z");
  for (let count = 0; count < 5; count++) assert.equal(hp.directBotStep({ botReplies: count, mutedUntil: null }, now), "reply");
  assert.equal(hp.directBotStep({ botReplies: 5, mutedUntil: null }, now), "limit");
  assert.equal(hp.texts("uz").limit, "Batafsil gaplashish uchun qo'ng'iroq qiling: +998 99 520 99 99");
  assert.equal(hp.directBotStep({ botReplies: 6, mutedUntil: null }, now), "silent");
  assert.equal(hp.directBotStep({ botReplies: 1, mutedUntil: new Date(now.getTime() + 1000) }, now), "silent");
  assert.equal(hp.directBotStep({ botReplies: 1, mutedUntil: new Date(now.getTime() - 1000) }, now), "reply", "after 24 h the bot talks again");
  assert.equal(hp.HUMAN_MUTE_MS, 24 * 3_600_000);
  const thread = { lastBotMid: "m1", lastBotText: "Salom", lastBotAt: now };
  assert.equal(hp.isBotEcho({ mid: "m1", text: "x", time: now }, thread), true);
  assert.equal(hp.isBotEcho({ mid: "m2", text: "Salom", time: now }, thread), true);
  assert.equal(hp.isBotEcho({ mid: "m3", text: "Assalomu alaykum, men mutaxassisman", time: now }, thread), false, "a person wrote → mute");
});

test("Direct chat wiring: only teplonasos threads, phone → lead + Telegram + thanks, bot echoes are automatic", async () => {
  const bot = await read("../lib/instagram/heat-pump-bot.ts");
  assert.match(bot, /if \(!isHeatPumpAccount\(account\.id\) \|\| !token\) return;/);
  assert.match(bot, /heatPumpThread\.findUnique[^\n]*\n\s*if \(!thread\) continue;/, "no thread → no answer");
  assert.match(bot, /mutedUntil: new Date\(event\.time\.getTime\(\) \+ HUMAN_MUTE_MS\)/);
  assert.match(bot, /data: \{ phone \} \}\);\n\s*await saveLead\(thread, account\);\n\s*await notifyDirectRecipients/);
  assert.match(bot, /phone \? t\.thanks/);
  assert.match(bot, /phone: thread\.phone/, "the phone is written to the lead");
  const direct = await read("../lib/instagram/direct.ts");
  assert.match(direct, /bots\.filter\(row => row\.lastBotText\)/, "bot echoes do not mark a conversation answered");
  assert.equal(hp.texts("uz").thanks, "Rahmat, mutaxassis tez orada qo'ng'iroq qiladi");
});

test("@eshikmaster never enters the teplonasos flow (m² / price comments included)", async () => {
  const { ESHIKMASTER_PRESET } = await import("../lib/instagram/constants.ts");
  assert.equal(hp.isHeatPumpAccount("global"), true);
  for (const id of ["cm_eshikmaster", "", null, undefined]) assert.equal(hp.isHeatPumpAccount(id), false);
  assert.doesNotMatch(JSON.stringify(ESHIKMASTER_PRESET), /teplonasos|heat/i, "preset unchanged");
  const service = await read("../lib/instagram/service.ts");
  assert.match(service, /if \(rule\?\.heatPump && isHeatPumpAccount\(account\.id\)\) \{/, "classification: account check");
  assert.match(service, /const heatPump = kind === "HEAT_PUMP" && !!rule\?\.heatPump && isHeatPumpAccount\(account\.id\);\n\s*if \(kind === "HEAT_PUMP" && !heatPump\) \{ await finish\("SKIPPED"/, "action: account check");
  assert.match(service, /if \(isHeatPumpAccount\(result\.account\.id\) && result\.events\.length\) await handleHeatPumpDirect/, "Direct: account check");
  assert.match(await read("../app/admin/(protected)/instagram/actions.ts"), /if \(value\.heatPump && !isHeatPumpAccount\(value\.accountId\)\) return \{ ok: false/, "the post type cannot be saved for another account");
  assert.match(await read("../lib/instagram/queries.ts"), /const heatPump = isHeatPumpAccount\(account\?\.id\) \?/, "table / post type hidden for other accounts");
  const board = await read("../components/admin/instagram/instagram-board.tsx");
  assert.match(board, /\{board\.heatPump && <HeatPumpTable/);
  assert.match(board, /\{heatPumpEnabled && <label className="bk-field"><span>Post turi/);
  // An eshikmaster m² / price comment is classified by the old rules (not HEAT_PUMP).
  const rules = await import("../lib/instagram/rules.ts");
  assert.equal(rules.classifyByKeywords("150 kv narxi qancha", [], { contact: true, asks: true }).definite, "PRICE");
});

test("migration is additive and seeds the table without markup", async () => {
  const sql = (await read("../prisma/migrations/20261109090000_ig_heat_pump/migration.sql")).replace(/^--.*$/gm, "");
  assert.doesNotMatch(sql, /DROP|DELETE|TRUNCATE|ALTER COLUMN|RENAME/i);
  assert.match(sql, /ADD VALUE 'HEAT_PUMP'/);
  for (const row of ["'3 HP', 3, 10, 6.6, 220, 1300, false", "'6 HP', 6, 19, 12.5, 220, 2650, true", "'8 HP', 8, 24, 15.8, 220, 3250, true", "'12 HP', 12, 36, 23.7, 380, 4100, true"]) assert.ok(sql.includes(row), row);
  assert.match(sql, /"heatPumpBufferUsd" DECIMAL\(10,2\) NOT NULL DEFAULT 145, ADD COLUMN "heatPumpBufferLiters" INTEGER NOT NULL DEFAULT 60/);
});

test("Direct thread: bound to the Private Reply's recipient_id; the comment author id only as a fallback", async () => {
  assert.equal(hp.threadIgsid("9001", { recipient_id: "1784XYZ", message_id: "m1" }), "1784XYZ");
  assert.equal(hp.threadIgsid("9001", { message_id: "m1" }), "9001", "no recipient_id → the comment author");
  assert.equal(hp.threadIgsid("9001", { recipient_id: " " }), "9001");
  assert.equal(hp.threadIgsid("9001", null), "9001");
  const service = await read("../lib/instagram/service.ts");
  assert.match(service, /const sent = await sendPrivateReply\(context\.token, account\.igUserId, commentId, dm\);\n[^\n]*\n\s*if \(thread\) thread = await bindThread\(thread\.id, account\.id, comment\.fromId, sent\)/, "bound right after the Private Reply");
  assert.match(service, /const saved = thread && await getDb\(\)\.heatPumpThread\.findUnique\(\{ where: \{ id: thread\.id \} \}\)/, "the lead uses the bound thread");
  const bot = await read("../lib/instagram/heat-pump-bot.ts");
  assert.match(bot, /const db = getDb\(\), igsid = threadIgsid\(fromId, sent\);/);
  assert.match(bot, /if \(!other\) return db\.heatPumpThread\.update\(\{ where: \{ id: threadId \}, data: \{ igsid, \.\.\.mid \} \}\);/);
});

test("Russian: Cyrillic comment → calculation, big project and m² ask in Russian; Uzbek Cyrillic stays Uzbek", () => {
  assert.equal(hp.langOf("сколько стоит для дома 150 кв?"), "ru");
  assert.equal(hp.langOf("цена"), "ru");
  assert.equal(hp.langOf("narxi qancha"), "uz");
  assert.equal(hp.langOf("уйим 150 кв, нархи қанча"), "uz", "Uzbek-only letters");
  assert.equal(hp.langOf("150", "Здравствуйте! Какая площадь"), "ru", "no letters → the previous message's language");
  assert.equal(hp.langOf("150"), "uz");

  const six = hp.calcMessage(150, MODELS, RATE, BUFFER, "ru").text;
  assert.match(six, /^Здравствуйте! Подходящий тепловой насос для вашего дома 150 м²:/);
  assert.match(six, /💵 Цена: \$2 650 \(~33\.8 млн сум, по курсу ЦБ\) — с буферным баком/);
  assert.match(six, /тогда понадобится Aire 12 HP · 36 kW/);
  for (const line of ["фанкойлов", "ИИ", "+998 99 520 99 99", "+998 91 637 77 77", "📞 Оставьте номер телефона"]) assert.ok(six.includes(line), line);
  assert.doesNotMatch(six, /Assalomu|narx|uyingiz/i);
  const three = hp.calcMessage(60, MODELS, RATE, BUFFER, "ru").text;
  assert.match(three, /⚠️ Буферный бак не входит в цену — 60 л, \$145 \(~1\.8 млн сум\)\./);
  assert.ok(three.length <= 1000, `Instagram limit: ${three.length}`);
  assert.match(hp.calcMessage(200, MODELS, RATE, BUFFER, "ru").text, /⚡ Эта модель работает от сети 380V \(3 фазы\)\./);

  const big = hp.calcMessage(500, MODELS, RATE, BUFFER, "ru");
  assert.match(big.text, /^Здравствуйте! Для обогрева дома 500 м² нужен тепловой насос мощностью примерно 20 HP · 61 kW/);
  assert.doesNotMatch(big.text, /\$|млн сум|нет в наличии|yo'q/);

  const ask = hp.heatPumpOutgoing("ask", {}, "ru");
  assert.equal(ask.dm, "Здравствуйте! Чтобы подобрать тепловой насос и назвать цену, подскажите, какая площадь вашего дома в м²?");
  assert.match(ask.reply, /м²\? Написали вам в Direct/);
  assert.match(hp.heatPumpOutgoing("question", { answer: "Да, греет воду." }, "ru").dm, /^Здравствуйте! Да, греет воду\.\n\nЧтобы подобрать/);
  assert.equal(hp.heatPumpOutgoing("ask", {}).dm, "Assalomu alaykum! Mos teplonasos va narxini aytishimiz uchun uyingiz necha m²?", "Uzbek stays the default");
  assert.equal(hp.texts("ru").limit, "Чтобы обсудить подробнее, позвоните: +998 99 520 99 99");
});
