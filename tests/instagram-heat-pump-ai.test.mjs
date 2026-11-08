import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const ai = await import("../lib/instagram/ai.ts");
const hp = await import("../lib/instagram/heat-pump.ts");
const read = async path => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const MODELS = [
  { brand: "Aire", hp: 3, nominalKw: 10, winterKw: 6.6, voltage: 220, priceUsd: 1300, bufferIncluded: false, isActive: true },
  { brand: "Aire", hp: 6, nominalKw: 19, winterKw: 12.5, voltage: 220, priceUsd: 2650, bufferIncluded: true, isActive: true },
  { brand: "Aire", hp: 8, nominalKw: 24, winterKw: 15.8, voltage: 220, priceUsd: 3250, bufferIncluded: true, isActive: true },
  { brand: "Aire", hp: 12, nominalKw: 36, winterKw: 23.7, voltage: 380, priceUsd: 4100, bufferIncluded: true, isActive: true },
];
const BUFFER = { usd: 145, liters: 60 }, RATE = "12750";
const AI = (over = {}) => ({ intent: "QUESTION", m2: null, kw: null, topic: null, lang: "uz", public_reply: "", dm_extra: "", ...over });
const mock = answer => { const calls = []; return { calls, responses: { parse: async (request, options) => { calls.push({ request, options }); if (answer instanceof Error) throw answer; return { output_parsed: answer, usage: { input_tokens: 500, output_tokens: 80 } }; } } }; };

test("BANTER: a warm joke, no call-center", async () => {
  const client = mock(AI({ intent: "BANTER", public_reply: "😂 Sheva har xil, issiqlik bir xil! 🔥" }));
  const understood = await ai.understandHeatPumpComment("Qayli bu bola shevasi voxaliga oshqaydiye bila😂", [], client);
  const mapped = hp.heatPumpFromAiReply(understood.ai);
  assert.deepEqual(mapped.result, { kind: "POSITIVE" });
  assert.equal(mapped.reply, "😂 Sheva har xil, issiqlik bir xil! 🔥");
  assert.doesNotMatch(mapped.reply, /637 77 77|call-center/);
  assert.equal(mapped.tag, "AI:BANTER");
  assert.match(client.calls[0].request.model, /mini/, "cheap fast model");
  assert.ok(client.calls[0].request.max_output_tokens <= 250);
});

test("“180KW 🙌” → POWER_KW → big project (≈273 kW nominal, ≈91 HP, no price) + “180 kW uchun hisobni…”", () => {
  assert.equal(hp.extractKw("180KW 🙌"), 180, "the parser alone too");
  for (const text of ["180 квт", "180 kvt", "180 kW"]) assert.equal(hp.extractKw(text), 180, text);
  assert.equal(hp.extractM2("180KW"), null, "kW is never m²");
  const mapped = hp.heatPumpFromAiReply(AI({ intent: "POWER_KW", kw: 180 }));
  assert.deepEqual(mapped.result, { kind: "HEAT_PUMP", intent: "kw", m2: null, kw: 180 });
  const calc = hp.calcKwMessage(180, MODELS, RATE, BUFFER);
  assert.equal(calc.big, true);
  assert.equal(calc.priceUsd, null);
  assert.match(calc.text, /180 kW issiqlik uchun taxminan 91 HP · 273 kW nominal/);
  assert.match(calc.text, /\+998 99 520 99 99/);
  assert.match(calc.text, /necha m² va qayerda/);
  assert.doesNotMatch(calc.text, /\$|yo'q emas|bizda yo'q/);
  assert.equal(hp.heatPumpOutgoing("kw", { kw: 180, calc: calc.text }).reply, "180 kW uchun hisobni Direct'ga yubordik 📩");
});

test("12 kW → the table model with its price; ≤ 23.7 kW is never a big project", () => {
  const calc = hp.calcKwMessage(12, MODELS, RATE, BUFFER);
  assert.equal(calc.big, false);
  assert.equal(calc.priceUsd, 2650);
  assert.match(calc.text, /Aire 6 HP · 19 kW — qishda \(−12°C\) 12\.5 kW/);
  assert.match(calc.text, /\$2 650 \(~33\.8 mln so'm/);
  assert.equal(hp.calcKwMessage(23.7, MODELS, RATE, BUFFER).priceUsd, 4100);
});

test("“1000 kvadiratka ustana o'rtatib bera oladimi” → calculation + the montaj answer in the DM", () => {
  const mapped = hp.heatPumpFromAiReply(AI({ intent: "AREA_M2", m2: 1000, topic: "montaj", dm_extra: "Montajni mutaxassisimiz aniq aytadi: +998 99 520 99 99" }));
  assert.deepEqual(mapped.result, { kind: "HEAT_PUMP", intent: "calc", m2: 1000 });
  const calc = hp.calcMessage(1000, MODELS, RATE, BUFFER);
  const out = hp.heatPumpOutgoing("calc", { m2: 1000, calc: calc.text, extra: mapped.extra });
  assert.ok(out.dm.startsWith(calc.text));
  assert.match(out.dm, /Montajni mutaxassisimiz aniq aytadi: \+998 99 520 99 99$/);
  assert.ok(out.dm.length <= 1000);
  assert.equal(out.reply, "1000 m² uchun hisobni Direct'ga yubordik 📩");
});

test("several calculations: 450 → calc, 200 → calc, 450 again → silent; 180 kW twice → silent; m² and kW share the 5-a-day limit", () => {
  const rule = { isActive: true };
  assert.equal(hp.heatPumpAction(rule, false, true, { m2: 450, previous: [], today: 0 }).type, "heatpump");
  assert.equal(hp.heatPumpAction(rule, true, true, { m2: 200, previous: [450], today: 1 }).type, "heatpump");
  assert.deepEqual(hp.heatPumpAction(rule, true, true, { m2: 450, previous: [450, 200], today: 2 }), { type: "skip", reason: "Takroriy m² — javobsiz" });
  assert.equal(hp.heatPumpAction(rule, true, true, { m2: 180, previous: [], today: 2, unit: "kW" }).type, "heatpump");
  assert.deepEqual(hp.heatPumpAction(rule, true, true, { m2: 180, previous: [180], today: 3, unit: "kW" }), { type: "skip", reason: "Takroriy kW — javobsiz" });
  assert.equal(hp.heatPumpAction(rule, true, true, { m2: 20, previous: [180], today: 5, unit: "kW" }).limit, true);
});

test("PRAISE → thanks or emoji only; OTHER_PRODUCT → call-center; SPAM_INSULT → no reply", () => {
  const praise = hp.heatPumpFromAiReply(AI({ intent: "PRAISE", public_reply: "🙌🔥" }));
  assert.deepEqual(praise.result, { kind: "POSITIVE" });
  assert.equal(praise.reply, "🙌🔥", "emoji-only praise reply is fine");
  const other = hp.heatPumpFromAiReply(AI({ intent: "OTHER_PRODUCT", topic: "konditsioner" }));
  assert.deepEqual(other.result, { kind: "HEAT_PUMP", intent: "other", m2: null });
  assert.deepEqual(hp.heatPumpOutgoing("other", {}), { reply: "Bu savol bo'yicha call-centerimizga murojaat qiling: +998 91 637 77 77", dm: null });
  assert.deepEqual(hp.heatPumpFromAiReply(AI({ intent: "SPAM_INSULT", public_reply: "…" })).result, { kind: "SPAM" });
});

test("AI never invents numbers, never says “AI”, ≤ 2 emoji in a comment", () => {
  assert.equal(hp.safeAiText("Narxi $2000 dan 😂", 150, true), "", "invented price");
  assert.equal(hp.safeAiText("Montaj 300$ turadi", 400), "", "invented montaj price in the DM");
  assert.equal(hp.safeAiText("Men AI yordamchiman 🙂", 150, true), "");
  assert.equal(hp.safeAiText("😂😂😂 zo'r", 150, true), "", "3 emoji");
  assert.equal(hp.safeAiText("Kafolatni mutaxassis aytadi: +998 99 520 99 99", 400), "Kafolatni mutaxassis aytadi: +998 99 520 99 99", "our phones are allowed in the DM");
  assert.equal(hp.heatPumpFromAiReply(AI({ intent: "BANTER", public_reply: "Bizda 50% chegirma 😂" })).reply, "", "rejected → the usual positive reply path");
  assert.equal(hp.heatPumpFromAiReply(AI({ intent: "AREA_M2", m2: 5 })).result.intent, "question", "an out-of-range m² is not calculated");
});

test("AI error / timeout → null, the keyword parser answers (nothing stays unanswered)", async () => {
  assert.equal(await ai.understandHeatPumpComment("450", [], mock(new Error("timeout"))), null);
  assert.deepEqual(hp.heatPumpByKeywords("450"), { kind: "HEAT_PUMP", intent: "calc", m2: 450 });
  assert.deepEqual(hp.heatPumpByKeywords("12 kW"), { kind: "HEAT_PUMP", intent: "kw", m2: null, kw: 12 });
  assert.equal(await ai.understandHeatPumpComment("450", [], null), null, "no key");
});

test("the AI gets the person's earlier comments on the post", async () => {
  const client = mock(AI({ intent: "AREA_M2", m2: 200 }));
  await ai.understandHeatPumpComment("onamga 200", ["450"], client);
  assert.match(client.calls[0].request.input[1].content, /oldingi kommentlari: \["450"\]\nKomment: "onamga 200"/);
});

test("Direct: last ~10 messages as context, real time (one try, 6 s), hot water yes / rassrochka no from the knowledge base", async () => {
  const client = mock({ reply: "Ha, issiq suvni ham isitadi 🙂", m2: null, kw: null, hp: null, specialist: false });
  const history = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `m${i}` }));
  const answer = await ai.heatPumpChat("issiq suvga ham bo'ladimi?", history, client);
  assert.equal(answer.reply, "Ha, issiq suvni ham isitadi 🙂");
  const { request, options } = client.calls[0];
  assert.equal(request.input.length, 12, "system + last 10 + the message");
  assert.equal(request.input[1].content, "m4");
  assert.deepEqual(options, { timeout: 6000, maxRetries: 0 });
  assert.match(ai.HEAT_PUMP_PROMPT, /Issiq suv: ha/);
  assert.match(ai.HEAT_PUMP_PROMPT, /rassrochka\): yo'q/);
});

test("Direct “8 HP necha pul?” → the table price in $ and so‘m (from the code)", () => {
  assert.equal(hp.hpPriceLine(8, MODELS, RATE), "🔥 Aire 8 HP · 24 kW — $3 250 (~41.4 mln so'm, MB kursi bo'yicha) — bufer bak bilan");
  assert.equal(hp.hpPriceLine(10, MODELS, RATE), null, "not in the table → specialist");
});

test("Direct “fankoil necha pul?” / “montaj qancha?” → smooth exit, nothing invented, Telegram “Mutaxassis javobi kerak”", () => {
  assert.equal(hp.specialistReply("Fankoil 200$ turadi"), "Bu savolga mutaxassisimiz aniq javob beradi — ozgina kuting 🙏 Tezroq bo'lishi uchun qo'ng'iroq qilsangiz ham bo'ladi: +998 99 520 99 99", "an invented price → the fixed text");
  const own = "Buni ustamiz aniq aytadi, biroz kuting 🙏 Shoshilinch bo'lsa: +998 99 520 99 99";
  assert.equal(hp.specialistReply(own), own, "the AI's own words when safe (different each time)");
  assert.match(hp.specialistReply(null, "ru"), /^На этот вопрос точно ответит наш специалист/);
  const notice = hp.specialistNotice({ username: "ali", igsid: "1", question: "fankoil necha pul?", calc: "Aire 6 HP · 19 kW — $2 650", link: "https://ig.me/m/ali" });
  assert.match(notice, /^🧑‍🔧 Mutaxassis javobi kerak/);
  assert.match(notice, /@ali\nSavol: «fankoil necha pul\?»\nOxirgi hisob: Aire 6 HP · 19 kW — \$2 650\nSuhbat: https:\/\/ig\.me\/m\/ali/);
});

test("Direct: after an admin writes, the bot is silent (24 h)", () => {
  assert.equal(hp.directBotStep({ botReplies: 1, mutedUntil: new Date(Date.now() + 3_600_000) }), "silent");
  assert.deepEqual(hp.directValues("onamga 200 kerak", null), { m2: 200, kw: null });
  assert.deepEqual(hp.directValues("…", { m2: null, kw: 180 }), { m2: null, kw: 180 });
});

test("wiring: AI-first only on teplonasos posts of the global account, real-time Direct, admin switch", async () => {
  const [service, bot, board, migration] = await Promise.all([read("../lib/instagram/service.ts"), read("../lib/instagram/heat-pump-bot.ts"), read("../components/admin/instagram/instagram-board.tsx"), read("../prisma/migrations/20261112090000_heatpump_ai/migration.sql")]);
  assert.match(service, /if \(rule\?\.heatPump && isHeatPumpAccount\(account\.id\)\) \{\n[^\n]*\n\s*const aiFirst = await heatPumpAiEnabled\(\);/, "only teplonasos posts of @buyuk_karavan");
  assert.match(service, /if \(isEshikmaster\(account\)\) \{\n\s*const ai = await classifyEshikmaster\(comment\.text\);/, "@eshikmaster untouched");
  assert.match(bot, /for \(const action of \["mark_seen", "typing_on"\] as const\) await sendSenderAction/);
  assert.match(bot, /await sleep\(Math\.max\(0, 2_000 \+ Math\.random\(\) \* 2_000 - \(Date\.now\(\) - started\)\)\);/, "2–4 s, not 8–25 s");
  assert.match(bot, /reply = specialistReply\(ai\.reply, lang\);\n\s*await needSpecialist\(thread, account, text\);/);
  assert.match(bot, /cooler \? await coolerReply\(thread, text, step, lang, account\)/, "xolodilnik flow kept");
  assert.match(board, /AI javob — komment va Direct avval AI bilan tushuniladi/);
  assert.doesNotMatch(migration, /DROP |DELETE FROM|RENAME /i, "additive");
});
