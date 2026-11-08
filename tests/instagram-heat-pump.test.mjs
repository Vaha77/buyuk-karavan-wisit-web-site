import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const hp = await import("../lib/instagram/heat-pump.ts");
const read = async path => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

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
  assert.match(bot, /data: \{ phone \} \}\);\n\s*await saveLead\(thread, account\);\n\s*await sendHeatPumpTelegram/);
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
  assert.match(service, /const heatPost = !!rule\?\.heatPump && isHeatPumpAccount\(account\.id\), heatPump = kind === "HEAT_PUMP" && heatPost;\n[^\n]*\n\s*if \(kind === "HEAT_PUMP" && !heatPump\) \{ await finish\("SKIPPED"/, "action: account check");
  assert.match(service, /if \(isHeatPumpAccount\(result\.account\.id\) && result\.events\.length\) await handleHeatPumpDirect/, "Direct: account check");
  assert.match(await read("../app/admin/(protected)/instagram/actions.ts"), /if \(value\.heatPump && !isHeatPumpAccount\(value\.accountId\)\) return \{ ok: false/, "the post type cannot be saved for another account");
  assert.match(await read("../lib/instagram/queries.ts"), /const heatPump = isHeatPumpAccount\(account\?\.id\) \?/, "table / post type hidden for other accounts");
  const board = await read("../components/admin/instagram/instagram-board.tsx");
  assert.match(board, /\{board\.heatPump && <HeatPumpTable/);
  assert.match(board, /\{heatPumpEnabled && <><option value="cooler">Xolodilnik \(tonna\)<\/option><option value="heat">Teplonasos/);
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

test("reply-comments: queued only on teplonasos posts of the global account; our own comments are always ignored", async () => {
  const rules = await import("../lib/instagram/rules.ts");
  const { ingestWebhook } = await import("../lib/instagram/ingest.ts");
  const account = { igUserId: "1784100", username: "buyuk_karavan" }, now = new Date("2026-11-07T10:00:00Z");
  const reply = { fromId: "9001", username: "mijoz", parentId: "c-parent", time: now };
  assert.equal(rules.decideIngest(reply, account, now).action, "skip", "default: replies are not answered");
  assert.equal(rules.decideIngest(reply, account, now, true).action, "queue", "teplonasos post");
  assert.equal(rules.decideIngest({ ...reply, fromId: account.igUserId }, account, now, true).action, "ignore", "our own reply");
  assert.equal(rules.decideIngest({ ...reply, username: "Buyuk_Karavan" }, account, now, true).action, "ignore");

  const payload = (mediaId, id) => ({ object: "instagram", entry: [{ id: account.igUserId, time: Math.floor(now.getTime() / 1000), changes: [{ field: "comments", value: { id, text: "150 kv", parent_id: "c-parent", from: { id: "9001", username: "mijoz" }, media: { id: mediaId } } }] }] });
  const rows = [];
  const store = allows => ({ insertComment: async row => { rows.push(row); return true; }, ...(allows ? { allowsReply: async mediaId => mediaId === "m-heat" } : {}) });
  assert.deepEqual((await ingestWebhook(payload("m-heat", "r1"), account, store(true), now)).queued, ["r1"]);
  assert.deepEqual((await ingestWebhook(payload("m-price", "r2"), account, store(true), now)).queued, [], "another post type: reply rule unchanged");
  assert.deepEqual((await ingestWebhook(payload("m-heat", "r3"), account, store(false), now)).queued, [], "a store without allowsReply (@eshikmaster): unchanged");
  assert.equal(rows.find(row => row.commentId === "r2").reason, "Javob-komment (reply) — javob berilmaydi");

  const service = await read("../lib/instagram/service.ts");
  assert.match(service, /\.\.\.\(isHeatPumpAccount\(accountId\) \? \{ allowsReply: async \(mediaId: string\) => !!await getDb\(\)\.instagramMediaRule\.findFirst\(\{ where: \{ mediaId, accountId, OR: \[\{ heatPump: true \}, \{ cooler: true \}\] \}/);
  assert.match(service, /if \(comment\.parentId && kind !== "COOLER" && !heatPumpReplyAnswered\(kind, comment\.heatPumpIntent, !!rule\?\.heatPump && isHeatPumpAccount\(account\.id\)\)\) \{ await finish\("SKIPPED", "Javob-komment \(reply\) — javob berilmaydi"\)/);
});

test("reply-comment is answered only with m², a price ask or a teplonasos question", () => {
  for (const intent of ["calc", "ask", "question"]) assert.equal(hp.heatPumpReplyAnswered("HEAT_PUMP", intent, true), true, intent);
  assert.equal(hp.heatPumpReplyAnswered("HEAT_PUMP", "other", true), false, "off-topic reply: nothing");
  for (const kind of ["POSITIVE", "NEGATIVE", "SPAM", "UNKNOWN", "PRICE"]) assert.equal(hp.heatPumpReplyAnswered(kind, null, true), false, kind);
  assert.equal(hp.heatPumpReplyAnswered("HEAT_PUMP", "calc", false), false, "not a teplonasos post");
  assert.equal(hp.heatPumpOutgoing("calc", { m2: 150, calc: "HISOB" }).reply, "150 m² uchun hisobni Direct'ga yubordik 📩");
});

test("several calculations per person per post: each new m² gets one, a repeated m² is silent, the 6th → specialist", async () => {
  const rule = { isActive: true }, sent = [];
  const step = (m2, today = sent.length) => hp.heatPumpAction(rule, sent.length > 0, true, { m2, previous: sent, today });
  assert.deepEqual(step(450), { type: "heatpump", publicReply: true }, "450 → calculation");
  sent.push(450);
  assert.deepEqual(step(200), { type: "heatpump", publicReply: true }, "then 200 → calculation");
  sent.push(200);
  assert.deepEqual(step(450), { type: "skip", reason: "Takroriy m² — javobsiz" }, "450 again → silent");
  sent.push(100, 120, 130);
  assert.deepEqual(step(300), { type: "heatpump", publicReply: true, limit: true }, "6th new m² in 24 h → specialist line only");
  assert.equal(step(300, 4).limit, undefined, "older calculations do not count for the 24 h limit");
  assert.equal(hp.heatPumpAction(rule, true, false, { m2: 300, previous: sent, today: 5 }).type, "skip", "limit + no public reply left → silent");
  assert.equal(hp.texts("uz").calcLimit, "Ko'proq hisob uchun mutaxassisga qo'ng'iroq qiling: +998 99 520 99 99");
  assert.equal(hp.heatPumpOutgoing("calc", { m2: 200, calc: "HISOB" }).reply, "200 m² uchun hisobni Direct'ga yubordik 📩");
  // heatPumpAction alone still skips an answered person; teplonasos posts pass 0 and use heatPumpGate instead.
  assert.equal(hp.heatPumpAction(rule, true, true).type, "skip");
  assert.equal(hp.heatPumpAction({ isActive: false }, false, true, { m2: 450, previous: [], today: 0 }).type, "skip", "inactive post");
  const service = await read("../lib/instagram/service.ts");
  assert.match(service, /heatPumpIntent: \{ in: \["calc", "kw"\] \}, dmSentAt: \{ not: null \} \}, select: \{ heatPumpM2: true, heatPumpKw: true, heatPumpIntent: true, dmSentAt: true \} \}\) : \[\],/);
  assert.match(service, /heatPumpAction\(rule, answered > 0, repliesToday < account\.dailyReplyLimit, calc\)/);
  assert.match(service, /if \(action\.type === "heatpump" && "limit" in action\) heatReply = texts\(heatLang\)\.calcLimit;/);
});

test("every new m² is added to the one lead (450, 200), never a second lead", async () => {
  assert.equal(hp.m2List(null, 450), "450 m²");
  assert.equal(hp.m2List("450 m²", 200), "450, 200 m²");
  assert.equal(hp.m2List("450, 200 m²", 450), "450, 200 m²", "repeated m² not duplicated");
  assert.equal(hp.m2List(null, null), null);
  assert.equal(hp.extractM2("onamga 200 kerak"), 200, "a new m² inside the Direct chat");
  const bot = await read("../lib/instagram/heat-pump-bot.ts");
  assert.match(bot, /const dimensions = m2List\(existing\?\.dimensions, thread\.m2\);/);
});

test("saving a teplonasos post skips the product / price text / DM template checks", async () => {
  const actions = await read("../app/admin/(protected)/instagram/actions.ts");
  assert.match(actions, /if \(!value\.heatPump && !value\.cooler\) \{\n[^\n]*DM matni bo‘sh bo‘lmasin[^\n]*\n\s*\/\/ Free text; \{narx_som\} \/ \{mahsulot\} \/ \{havola\} need a product\.\n\s*if \(\/\\{\(mahsulot\|narx_som\|havola\)\\}\/\.test\(value\.dmTemplate\)/);
  assert.match(actions, /if \(!value\.heatPump && !value\.cooler\) \{[\s\S]*?Narx matnida[\s\S]*?\n  \}\n/, "price text check inside the block");
});

test("reply to another person: leading @mentions are dropped before classifying", () => {
  assert.equal(hp.stripMentions("@____abdulvohid__ 60 kvd qancha"), "60 kvd qancha");
  assert.equal(hp.stripMentions("@a.b @c_d, 150"), "150");
  assert.equal(hp.stripMentions("narx @shop"), "narx @shop", "only at the start");

  const first = hp.heatPumpByKeywords("@____abdulvohid__ 60 kvd qancha");
  assert.deepEqual(first, { kind: "HEAT_PUMP", intent: "calc", m2: 60 });
  const three = hp.calcMessage(first.m2, MODELS, RATE, BUFFER);
  assert.match(three.text, /🔥 Aire 3 HP · 10 kW — 60 m² uyingizni isitadi/);
  assert.equal(hp.heatPumpOutgoing("calc", { m2: 60, calc: three.text }).reply, "60 m² uchun hisobni Direct'ga yubordik 📩");

  const second = hp.heatPumpByKeywords("@qobiljonnasimjanov 260");
  assert.deepEqual(second, { kind: "HEAT_PUMP", intent: "calc", m2: 260 });
  assert.match(hp.calcMessage(260, MODELS, RATE, BUFFER).text, /🔥 Aire 12 HP · 36 kW — 260 m²/);

  assert.deepEqual(hp.heatPumpByKeywords("@user narxi qancha"), { kind: "HEAT_PUMP", intent: "ask", m2: null });
  assert.equal(hp.heatPumpReplyAnswered("HEAT_PUMP", "calc", false), false, "the same reply on another post type → no answer");
});

test("m² units: kvd, kv., kvm, kvadrat metr, м², кв.м", () => {
  for (const text of ["60 kvd", "60kvd", "60 kv.", "60 kvm", "60 kvadrat metr", "60 м²", "60 кв.м", "60кв.м"]) assert.equal(hp.extractM2(text), 60, text);
});

test("saving a teplonasos post: the price post's DM template is not required", async () => {
  const actions = await read("../app/admin/(protected)/instagram/actions.ts");
  assert.match(actions, /dmTemplate: z\.string\(\)\.trim\(\)\.max\(900, "DM matni 900 belgidan oshmasin\."\),/, "no min(5) in the schema");
  assert.match(actions, /if \(!value\.heatPump && !value\.cooler\) \{\n\s*if \(value\.dmTemplate\.length < 5\) return \{ ok: false, error: "DM matni bo‘sh bo‘lmasin\." \};/);
});

test("m² parser: км typo, units in any case, and a lone 20–1000 number as the fallback", () => {
  for (const [text, m2] of [["67км🔥", 67], ["90 kvd", 90], ["240m2", 240], ["120 кв.м", 120], ["150", 150], ["60 KV.M", 60], ["60 Кв М", 60], ["60 KVM", 60], ["60 Kvadrat", 60], ["60 КВАДРАТ", 60], ["60 М2", 60], ["60 км", 60], ["uyim 85 kvm atrofida", 85]]) {
    assert.equal(hp.extractM2(text), m2, text);
    assert.deepEqual(hp.heatPumpByKeywords(text), { kind: "HEAT_PUMP", intent: "calc", m2 }, `${text} gets the calculation`);
  }
  for (const text of ["10 ta 🔥", "1500 tadan ko'p", "100% zo'r", "2 ta 300 lik", "zo'r🔥", "67 sotix", "67 sotix 🔥", "5 HP", "25 HP", "50 ga", "200 kg", "30 tonna", "100 litr", "24 kVt", "36 kW", "50 ot kuchi", "300 so'm", "500 sum", "40$"]) assert.equal(hp.extractM2(text), null, text);
  assert.deepEqual(hp.heatPumpByKeywords("zo'r🔥"), { kind: "POSITIVE" }, "praise: a friendly reply, not the m² one");
});

test("an unanswered comment logs why (parse_failed / skipped / failed)", async () => {
  assert.match(await read("../lib/instagram/service.ts"), /console\.info\("Instagram comment unanswered", \{ commentId, code: comment\?\.kind === "UNKNOWN" \? "parse_failed" : status\.toLowerCase\(\), reason \}\)/);
});

test("no comment on a teplonasos post stays silent: parse / calc / Direct errors → the friendly reply, logged", async () => {
  assert.equal(hp.texts("uz").friendly, "Rahmat! 🙌 Savollaringiz bo'lsa, Direct'ga yozing.");
  assert.equal(hp.texts("ru").friendly, "Спасибо! 🙌 Если есть вопросы, пишите в Direct.");
  const service = await read("../lib/instagram/service.ts");
  assert.match(service, /await classifyHeatPump\(comment\.text, history, aiFirst\)\.catch\(error => \{\n\s*console\.error\("Instagram heat pump parse failed"[^\n]*\n\s*return \{ result: null, by: "PARSE_FAILED"/, "parse error → logged");
  assert.match(service, /return \{ kind: result\?\.kind \?\? "POSITIVE", by, usage,/, "not understood → friendly reply, not UNKNOWN");
  assert.match(service, /chooseAction\(kind, heatPost \? \{ \.\.\.account, positiveEnabled: true \} : account,/, "the friendly reply is not switched off on a teplonasos post");
  assert.match(service, /if \(!written\?\.reply && !friendly\) \{[^\n]*\n\s*positive = written\?\.reply \|\| friendly;/, "AI reply failed → fixed friendly text");
  assert.match(service, /\} catch \(error\) \{\n\s*console\.error\("Instagram heat pump calc failed"[^\n]*\n\s*heatReply = friendly;/, "calc error → friendly reply");
  assert.match(service, /if \(action\.type !== "heatpump" \|\| !publicReply\) \{ await finish\("FAILED"[^\n]*\n\s*dmFailed = errorReason\(info\);\n[^\n]*\n\s*publicReply = friendly;\n\s*dm = null;/, "Direct failed → friendly public reply, no lead");
});

test("catch-up every 10 minutes: latest 5 posts, a known comment id is never answered twice, our own comments ignored", async () => {
  const { ingestFetchedComments } = await import("../lib/instagram/ingest.ts");
  const account = { igUserId: "1784100", username: "buyuk_karavan" }, now = new Date("2026-11-07T10:00:00Z");
  const seen = new Set();
  const store = { insertComment: async row => seen.has(row.commentId) ? false : (seen.add(row.commentId), true) };
  const media = [{ mediaId: "m1", comments: [
    { id: "c1", text: "67км🔥", timestamp: "2026-11-07T09:50:00+0000", from: { id: "9001", username: "mijoz" } },
    { id: "c2", text: "Hisob Direct'da", timestamp: "2026-11-07T09:51:00+0000", from: { id: account.igUserId, username: "buyuk_karavan" } },
    { id: "c3", text: "rahmat", timestamp: "2026-11-07T09:52:00+0000", from: { id: account.igUserId, username: "buyuk_karavan" }, parent_id: "c1" },
  ] }];
  const first = await ingestFetchedComments(media, account, store, { now });
  assert.deepEqual(first.queued, ["c1"], "our comment and our reply are ignored");
  const second = await ingestFetchedComments(media, account, store, { now });
  assert.deepEqual(second.queued, [], "next run: already in the journal → no second reply");
  assert.equal(second.duplicates, 1);
  const route = await read("../app/api/cron/instagram-queue/route.ts");
  assert.match(route, /catchUp: await syncAllMissedComments\(\{ mediaLimit: 5 \}\)/);
  assert.match(await read("../.github/workflows/instagram-queue-cron.yml"), /\*\/10 \* \* \* \*/, "every 10 minutes (Vercel Hobby allows only daily crons)");
});

test("“67км🔥” gets the public reply and the calculation in Direct", () => {
  const parsed = hp.heatPumpByKeywords("67км🔥");
  assert.deepEqual(parsed, { kind: "HEAT_PUMP", intent: "calc", m2: 67 });
  assert.deepEqual(hp.heatPumpAction({ isActive: true }, false, true), { type: "heatpump", publicReply: true });
  const calc = hp.calcMessage(parsed.m2, MODELS, RATE, BUFFER, hp.langOf("67км🔥"));
  const out = hp.heatPumpOutgoing(parsed.intent, { m2: parsed.m2, calc: calc.text }, hp.langOf("67км🔥"));
  assert.equal(out.reply, "67 m² uchun hisobni Direct'ga yubordik 📩", "a unit typo does not switch to Russian");
  assert.equal(hp.langOf("120 кв.м"), "uz");
  assert.equal(hp.langOf("дом 150 кв"), "ru");
  assert.match(out.dm, /Aire 3 HP · 10 kW/);
  assert.match(out.dm, /\$1 300/);
});

test("Telegram: a teplonasos lead goes only to the private chat (with 3 retries), never the group; others to the group", async () => {
  assert.equal(hp.isHeatPumpLead({ submissionKey: "ighp:9001" }), true);
  for (const key of ["ig:9001:p1", "igdm:9001", null, undefined]) assert.equal(hp.isHeatPumpLead({ submissionKey: key }), false, String(key));

  const sends = [], logs = [];
  const log = (message, details) => logs.push({ message, details });
  const ok = await hp.deliverPrivate("555", async chatId => { sends.push(chatId); return { chat: { id: 555 }, message_id: 1 }; }, log, async () => {});
  assert.deepEqual(sends, ["555"], "the private chat only");
  assert.equal(ok.message_id, 1);

  let tries = 0;
  const failed = await hp.deliverPrivate("555", async chatId => { tries++; assert.equal(chatId, "555", "never another chat"); throw new Error("Forbidden"); }, log, async () => {});
  assert.equal(failed, null);
  assert.equal(tries, 4, "first try + 3 retries");
  assert.equal(logs.filter(item => item.message === "Teplonasos Telegram yuborilmadi").length, 4, "each failure logged");

  const telegram = await read("../lib/telegram/service.ts");
  assert.match(telegram, /if\(isHeatPumpLead\(row\)\)\{const message=await sendHeatPumpTelegram\(newLeadGroupText\(lead\)\);[^\n]*return !!message;\}\n\s*\/\/ Xolodilnik leads/, "returns before any group send, also on failure");
  assert.match(telegram, /sendMessage\(telegramGroupChatId\(\),newLeadGroupText\(lead\),claimKeyboard\(lead\.id\)\)/, "other leads: the group, as before");
  const bot = await read("../lib/instagram/heat-pump-bot.ts");
  assert.match(bot, /deliverPrivate\(await heatPumpChatId\(\), chatId => sendMessage\(chatId, text, keyboard\)\)/);
  assert.doesNotMatch(bot, /telegramGroupChatId|directChatId|notifyDirectRecipients/, "the teplonasos sender never knows a group");
  const direct = await read("../lib/instagram/direct.ts");
  assert.match(direct, /const people = account && !heat \? await recipients\(account\) : \[\];/, "a teplonasos Direct card: no group recipients");
  assert.match(direct, /if \(await isHeatThread\(row\)\) await sendHeatPumpTelegram\(text,/, "reminders too");
  assert.match(await read("../lib/instagram/service.ts"), /const sent = heatPost \? \(await sendHeatPumpTelegram\(negativeText\(/, "a negative comment on a teplonasos post too");
});

test("Telegram: no chat_id → logged, nothing sent anywhere", async () => {
  const logs = [];
  let sent = false;
  assert.equal(await hp.deliverPrivate(null, async () => { sent = true; }, (message, details) => logs.push({ message, details })), null);
  assert.equal(sent, false);
  assert.equal(logs.length, 1);
  assert.match(logs[0].message, /chat_id yo‘q/);
});

test("Telegram binding: only the own contact of +998 91 637 77 77 is accepted", async () => {
  assert.equal(hp.isHeatPumpContact({ phone_number: "+998916377777", user_id: 42 }, 42), true);
  assert.equal(hp.isHeatPumpContact({ phone_number: "998 91 637 77 77", user_id: 42 }, 42), true);
  assert.equal(hp.isHeatPumpContact({ phone_number: "+998916377777", user_id: 7 }, 42), false, "someone else's contact card");
  assert.equal(hp.isHeatPumpContact({ phone_number: "+998901234567", user_id: 42 }, 42), false, "another number");
  assert.equal(hp.isHeatPumpContact(undefined, 42), false);
  const bot = await read("../lib/instagram/heat-pump-bot.ts");
  assert.match(bot, /process\.env\.HEATPUMP_TELEGRAM_CHAT_ID/);
  assert.match(bot, /request_contact: true/);
  const sql = (await read("../prisma/migrations/20261110090000_heatpump_telegram/migration.sql")).replace(/^--.*$/gm, "");
  assert.doesNotMatch(sql, /DROP|DELETE|ALTER/i, "additive");
});

test("backlog: leads not sent while no chat was linked go in one message right after linking", async () => {
  const leads = [{ customerName: "@ali", dimensions: "150 m²", product: "Aire 6 HP · 19 kW — $2 650", phone: "+998901234567" }, { customerName: "@vali", dimensions: null, product: null, phone: null }];
  const text = hp.backlogText(leads);
  assert.match(text, /^📬 Ulanmagan paytdagi 2 ta xabar \(teplonasos\):\n\n1\. @ali · 150 m² · Aire 6 HP · 19 kW — \$2 650 · 📞 \+998901234567\n2\. @vali$/);
  const many = hp.backlogText(Array.from({ length: 200 }, (_, index) => ({ customerName: `@user_${index}_${"x".repeat(30)}`, dimensions: "150 m²", product: "Aire 6 HP · 19 kW — $2 650", phone: "+998901234567" })));
  assert.ok(many.length <= 4096, `Telegram limit: ${many.length}`);
  assert.match(many, /^📬 Ulanmagan paytdagi 200 ta xabar[\s\S]*… va yana \d+ ta \(Mijoz so‘rovlarida\)$/);
  const bot = await read("../lib/instagram/heat-pump-bot.ts");
  assert.match(bot, /"✅ Teplonasos lidlari endi shu chatga keladi\.", \{ remove_keyboard: true \}\);\n\s*await flushHeatPumpBacklog\(\)/, "sent as soon as the chat is linked");
  assert.match(bot, /where: \{ submissionKey: \{ startsWith: "ighp:" \}, telegramNotificationStatus: "FAILED" \}/, "only teplonasos leads that were not sent");
  assert.match(bot, /const message = await sendHeatPumpTelegram\(backlogText\(leads\)\);\n\s*if \(message\) await db\.lead\.updateMany/, "one message; marked sent only when it went out");
});

test("20:00 report: teplonasos conversations leave the group list and go to the private chat as a short list", async () => {
  assert.equal(hp.heatWaitingText("2026-11-07", [{ label: "@ali", waited: "2 soat" }]), "🔥 Teplonasos Direct · 2026-11-07 — javob kutayotganlar: 1\n1. @ali — 2 soat");
  const direct = await read("../lib/instagram/direct.ts");
  assert.match(direct, /waiting: waiting\.filter\(row => !heatIds\.has\(row\.igsid\)\)\.map/, "the group list without teplonasos");
  assert.match(direct, /if \(heatWaiting\.length\) await sendHeatPumpTelegram\(heatWaitingText\(today,/);
});
