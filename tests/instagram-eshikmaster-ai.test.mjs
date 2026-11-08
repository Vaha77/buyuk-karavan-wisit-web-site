import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const ai = await import("../lib/instagram/ai.ts");
const rules = await import("../lib/instagram/rules.ts");
const { isEshikmaster } = await import("../lib/instagram/constants.ts");
const read = async path => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

// What a good model answers for the examples (the AI itself is mocked; the mapping and guards are what is tested).
const EXPECTED = {
  "Necplga qberasla": ["price", "PRICE"], "nchpl": ["price", "PRICE"], "qanchaga qilasiz": ["price", "PRICE"], "Narxi qancha isuzuga": ["price", "PRICE"],
  "manzl qatta": ["address", "ADDRESS"], "qayda turasiz": ["address", "ADDRESS"], "nomer tashavoring": ["phone", "PHONE"],
  "soat nechigacha ishlaysiz": ["hours", "HOURS"], "damasniyam qilasizmi": ["question", "QUESTION"],
  "🔥🔥": ["positive", "POSITIVE"], "zor ish": ["positive", "POSITIVE"], "Miyyani qaydan topkansz": ["positive", "POSITIVE"],
  "aldoqchilar": ["negative", "NEGATIVE"], "sahifamga obuna bo'ling": ["spam", "SPAM"],
};

function mock(answer) {
  const calls = [];
  return { calls, responses: { parse: async request => { calls.push(request); const comment = JSON.parse(request.input[1].content.slice("Komment: ".length)); return { output_parsed: answer(comment), usage: { input_tokens: 1000, output_tokens: 200 } }; } } };
}

test("@eshikmaster: every example is understood through the AI (gpt-4.1, not mini), with its cost", async () => {
  const client = mock(comment => ({ intent: EXPECTED[comment][0], reply: EXPECTED[comment][0] === "positive" ? "Rahmat, aka! 🔥" : EXPECTED[comment][0] === "question" ? "Ha, Direct'ga yozing 🙂" : "" }));
  for (const [comment, [, kind]] of Object.entries(EXPECTED)) {
    const result = await ai.classifyEshikmaster(comment, client);
    assert.equal(result.kind, kind, comment);
    assert.equal(result.usage.tokens, 1200);
    assert.equal(result.usage.costUsd, 0.0036, "gpt-4.1: $2 / $8 per 1M tokens");
    if (kind === "POSITIVE") assert.equal(result.reply, "Rahmat, aka! 🔥");
    if (!["POSITIVE", "QUESTION"].includes(kind)) assert.equal(result.reply, "", `${kind}: the DM template / no reply, not the AI text`);
  }
  const request = client.calls[0];
  assert.equal(request.model, "gpt-4.1");
  assert.doesNotMatch(request.model, /mini|nano/);
  const prompt = request.input[0].content;
  assert.match(prompt, /^Komment avto eshik ustasi sahifasida\. Mijozlar shoshib, xato, qisqartirib, lotin\/kirill aralash, sheva bilan yozadi\. Ma'noni tushun\./);
  assert.match(prompt, /\{"intent":"price\|address\|phone\|hours\|question\|positive\|negative\|spam", "reply": "\.\.\."\}/);
  assert.match(prompt, /Savol yoki iltimos ohangidagi komment HECH QACHON positive emas/);
  assert.match(prompt, /oddiy va samimiy, balandparvoz emas\. Masalan: "Rahmat, aka! 🔥", "Rahmat, xursandmiz 🙌"/);
  for (const example of ["Necplga qberasla", "nchpl", "qanchaga qilasiz", "Narxi qancha isuzuga", "manzl qatta", "qayda turasiz", "nomer tashavoring", "damasniyam qilasizmi", "🔥🔥", "zor ish", "Miyyani qaydan topkansz"]) assert.ok(prompt.includes(`"${example}" → ${EXPECTED[example][0]}`), example);
  assert.ok(ai.ESHIKMASTER_EXAMPLES.length >= 15 && ai.ESHIKMASTER_EXAMPLES.length <= 20, "15–20 examples");
});

test("a question or request is never POSITIVE, even when the AI says so (its thanks-reply is dropped)", async () => {
  const client = mock(() => ({ intent: "positive", reply: "Rahmat, aka! 🔥" }));
  for (const comment of ["damasniyam qilasizmi", "zo'r ekan, qayerdasiz?", "iltimos kelib bering"]) {
    const result = await ai.classifyEshikmaster(comment, client);
    assert.equal(result.kind, "QUESTION", comment);
    assert.equal(result.reply, "", comment);
  }
  for (const comment of ["Miyyani qaydan topkansz", "zor ish", "🔥🔥"]) assert.equal((await ai.classifyEshikmaster(comment, client)).kind, "POSITIVE", comment);
});

test("AI down: no answer (null) → the keywords decide", async () => {
  assert.equal(await ai.classifyEshikmaster("narxi qancha", null), null, "no key");
  assert.equal(await ai.classifyEshikmaster("narxi qancha", { responses: { parse: async () => { throw new Error("timeout"); } } }), null, "error");
  const fallback = text => { const result = rules.classifyByKeywords(text, [], { contact: true, asks: true }); return result.definite ?? result.fallback ?? "UNKNOWN"; };
  assert.equal(fallback("narxi qancha"), "PRICE");
  assert.equal(fallback("manzil qayerda"), "ADDRESS");
  assert.equal(fallback("telefon raqam bering"), "PHONE");
  assert.equal(fallback("🔥🔥"), "POSITIVE");
  const service = await read("../lib/instagram/service.ts");
  assert.match(service, /if \(isEshikmaster\(account\)\) \{\n\s*const ai = await classifyEshikmaster\(comment\.text\);\n\s*if \(ai\) return \{ kind: ai\.kind, by: "AI", usage: ai\.usage, reply: ai\.reply \};\n\s*const fallback = classifyByKeywords/, "AI first, keywords only as the fallback");
  assert.match(service, /const ready = classifiedReply && \(heatPost \|\| !aiReplyProblem\(classifiedReply\)\) && !tooSimilar\(classifiedReply, recent\)/, "the reply is checked like any AI reply");
});

test("@buyuk_karavan unchanged: not eshikmaster, keyword-first path and its prompts as before", async () => {
  assert.equal(isEshikmaster({ username: "eshikmaster" }), true);
  assert.equal(isEshikmaster({ username: "EshikMaster " }), true);
  assert.equal(isEshikmaster({ username: "buyuk_karavan" }), false);
  const service = await read("../lib/instagram/service.ts");
  assert.match(service, /const keywords = classifyByKeywords\(comment\.text, rule\?\.keywords \?\? \[\], \{ contact: account\.contactRepliesEnabled, asks: account\.aiReplyAll \}\);\n\s*\/\/ aiReplyAll: a keyword QUESTION still goes to the AI/);
  const source = await read("../lib/instagram/ai.ts");
  assert.match(source, /\(options\.prompt\?\.trim\(\) \|\| replyPrompt\(brand\)\) \+ \(options\.simpleThanks \? SIMPLE_THANKS : ""\)/);
  assert.match(service, /relaxed: account\.aiReplyAll, simpleThanks: isEshikmaster\(account\) \}/, "the simple-thanks rule only for @eshikmaster");
  assert.equal(rules.aiCostUsd("gpt-4.1-mini", 1_000_000, 0), 0.4, "mini price unchanged");
  assert.equal(rules.aiCostUsd("gpt-4.1-mini-2025-04-14", 1_000_000, 0), 0.4, "dated mini still the mini price");
  assert.equal(rules.aiCostUsd("gpt-4.1", 1_000_000, 0), 2);
});
