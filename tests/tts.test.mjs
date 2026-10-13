import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const r = await import("../lib/tts/rules.ts");
const audio = await import("../lib/tts/audio.ts");
const { openaiProvider } = await import("../lib/tts/providers/openai.ts");
const { aishaProvider, customVoices } = await import("../lib/tts/providers/aisha.ts");
const { elevenlabsProvider } = await import("../lib/tts/providers/elevenlabs.ts");
const { describeProviders, voicesFor, getProvider } = await import("../lib/tts/providers/index.ts");
const { TtsProviderError } = await import("../lib/tts/providers/types.ts");
const { bearerMatches } = await import("../lib/stories/auth.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

// ---- Synthetic audio ----------------------------------------------------------------------------------------------
/** MPEG-1 Layer III, 128 kbps, 44.1 kHz, no padding: 417 bytes, 1152 samples (≈ 26.12 ms) per frame. */
const frame = (fill = 0) => { const bytes = new Uint8Array(417).fill(fill); bytes.set([0xff, 0xfb, 0x90, 0x64]); return bytes; };
const xingFrame = () => { const bytes = frame(); bytes.set(Buffer.from("Xing"), 36); return bytes; };
const id3 = () => new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5]);
const concat = (...parts) => new Uint8Array(Buffer.concat(parts.map(part => Buffer.from(part))));
const mp3 = (frames, { tag = true, xing = true } = {}) => concat(...(tag ? [id3()] : []), ...(xing ? [xingFrame()] : []), ...Array.from({ length: frames }, (_, i) => frame(i + 1)));
function wav(samples, { rate = 16000, channels = 1, bits = 16, streamed = false } = {}) {
  const data = new Uint8Array(samples * channels * bits / 8).fill(7);
  const info = { audioFormat: 1, channels, sampleRate: rate, bitsPerSample: bits, blockAlign: channels * bits / 8, byteRate: rate * channels * bits / 8 };
  const header = audio.wavHeader(info, streamed ? 0xffffffff : data.length);
  return concat(header, data);
}

// ---- Mock fetch ---------------------------------------------------------------------------------------------------
function mockFetch(routes) {
  const calls = [];
  const fetcher = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    for (const [match, respond] of routes) if (url.includes(match)) return respond(url, init);
    return new Response("not found", { status: 404 });
  };
  return { fetcher, calls };
}
const audioResponse = bytes => new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg" } });

// ---- Text splitting -----------------------------------------------------------------------------------------------
test("splitText: chunks ≤ max, cut between sentences, nothing lost", () => {
  const text = "Birinchi gap. Ikkinchi gap juda ham uzunroq! Uchinchimi? To‘rtinchi gap.";
  assert.deepEqual(r.splitText(text, 30), ["Birinchi gap.", "Ikkinchi gap juda ham uzunroq!", "Uchinchimi? To‘rtinchi gap."]);
  assert.deepEqual(r.splitText(text, 1000), [text], "short text stays one request");
  const long = Array.from({ length: 200 }, (_, i) => `Bu ${i + 1}-gap, unda bir oz matn bor.`).join(" ");
  const chunks = r.splitText(long, 950);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) { assert.ok(chunk.length <= 950, `chunk of ${chunk.length}`); assert.match(chunk, /\.$/, "every chunk ends on a sentence"); }
  assert.equal(chunks.join(" "), long, "joining the chunks gives the text back");
});

test("splitText: long sentence → commas → words → hard cut; line breaks and CJK punctuation", () => {
  const sentence = "Sovutgich kamerasi, agregat, bug‘latgich, kondensator, avtomatika va montaj ishlari bitta shartnoma asosida bajariladi.";
  const parts = r.splitText(sentence, 40);
  assert.ok(parts.every(part => part.length <= 40), JSON.stringify(parts));
  assert.equal(parts.join(" "), sentence, "commas kept, words kept");
  assert.deepEqual(r.splitText("a".repeat(50), 20), ["a".repeat(20), "a".repeat(20), "a".repeat(10)]);
  assert.deepEqual(r.splitText("Sarlavha\nBirinchi qator matni", 20), ["Sarlavha", "Birinchi qator matni"]);
  assert.deepEqual(r.splitText("你好。我们是工厂！欢迎", 20), ["你好。我们是工厂！欢迎"]);
  assert.deepEqual(r.sentences("你好。我们是工厂！欢迎"), ["你好。", "我们是工厂！", "欢迎"]);
  assert.deepEqual(r.sentences("U dedi: «Keling!» Keyin ketdi."), ["U dedi: «Keling!»", "Keyin ketdi."]);
  assert.throws(() => r.splitText("x", 5));
});

test("previewText: ~200 characters ending on a sentence or a word", () => {
  assert.equal(r.previewText("  Qisqa   matn. "), "Qisqa matn.");
  const text = `${"Birinchi gap juda uzun bo‘lib davom etadi va yana davom etadi. ".repeat(3)}${"so‘z ".repeat(100)}`;
  const preview = r.previewText(text);
  assert.ok(preview.length <= 200 && preview.endsWith("."), preview);
  const words = r.previewText("so‘z ".repeat(100));
  assert.ok(words.length <= 200 && !words.endsWith(" ") && words.endsWith("so‘z"));
});

test("request parsing: text, lang, provider, voice, speed, format", () => {
  assert.deepEqual(r.parseTtsRequest({ text: " Salom ", lang: "UZ", provider: "aisha", voice: "gulnoza" }), { ok: true, value: { text: "Salom", lang: "uz", provider: "aisha", voice: "gulnoza", speed: 1, format: null } });
  assert.equal(r.parseTtsRequest({ text: "x", lang: "uz", provider: "openai", voice: "nova", speed: "1.25", format: "wav" }).value.speed, 1.25);
  assert.match(r.parseTtsRequest({ text: "", lang: "uz", provider: "aisha", voice: "g" }).error, /bo‘sh/);
  assert.match(r.parseTtsRequest({ text: "x".repeat(r.MAX_TEXT_CHARS + 1), lang: "uz", provider: "aisha", voice: "g" }).error, /20000/);
  assert.match(r.parseTtsRequest({ text: "x", lang: "xx", provider: "aisha", voice: "g" }).error, /lang/);
  assert.match(r.parseTtsRequest({ text: "x", lang: "uz", provider: "../etc", voice: "g" }).error, /provider/);
  assert.match(r.parseTtsRequest({ text: "x", lang: "uz", provider: "aisha", voice: "" }).error, /voice/);
  assert.match(r.parseTtsRequest({ text: "x", lang: "uz", provider: "aisha", voice: "g", speed: 9 }).error, /speed/);
});

// ---- Cost and limits ----------------------------------------------------------------------------------------------
test("limits: monthly USD / characters stop, daily count warns; env overrides; Tashkent month", () => {
  const limits = r.limitsFromEnv({ TTS_MONTHLY_USD_LIMIT: "5", TTS_MONTHLY_CHAR_LIMIT: "100000", TTS_DAILY_WARN_REQUESTS: "3" });
  assert.deepEqual(limits, { monthlyUsd: 5, monthlyChars: 100000, dailyWarn: 3 });
  assert.deepEqual(r.limitsFromEnv({}), r.DEFAULT_LIMITS);
  assert.equal(r.limitsFromEnv({ TTS_MONTHLY_USD_LIMIT: "off" }).monthlyUsd, null);
  assert.equal(r.limitsFromEnv({ TTS_MONTHLY_USD_LIMIT: "abc" }).monthlyUsd, 20, "junk → default");
  assert.equal(r.limitError({ usd: 4.9, chars: 10 }, { usd: 0.05, chars: 500 }, limits), null);
  assert.match(r.limitError({ usd: 4.99, chars: 10 }, { usd: 0.05, chars: 500 }, limits), /Oylik limit: \$5/);
  assert.match(r.limitError({ usd: 0, chars: 99_900 }, { usd: 0, chars: 500 }, limits), /100000 belgi/);
  assert.equal(r.limitError({ usd: 1e6, chars: 1e9 }, { usd: 1, chars: 1 }, { monthlyUsd: null, monthlyChars: null, dailyWarn: null }), null);
  assert.equal(r.dailyWarning(3, limits), null);
  assert.match(r.dailyWarning(4, limits), /Bugun 4 ta/);
  assert.equal(r.usdForChars(1000, 0.08), 0.08);
  assert.equal(r.tashkentMonthStart(new Date("2026-10-31T20:00:00Z")).toISOString(), "2026-10-31T19:00:00.000Z", "01:00 on 1 Nov in Tashkent → November");
  assert.equal(r.tashkentMonthStart(new Date("2026-10-13T10:00:00Z")).toISOString(), "2026-09-30T19:00:00.000Z");
  assert.equal(r.tashkentDayStart(new Date("2026-10-13T20:30:00Z")).toISOString(), "2026-10-13T19:00:00.000Z");
  assert.equal(r.formatDuration(65_400), "1:05");
});

// ---- Audio --------------------------------------------------------------------------------------------------------
test("MP3: frames parsed, ID3 and Xing dropped, parts joined, duration summed", () => {
  const one = audio.parseMp3(mp3(10));
  assert.equal(one.body.length, 10 * 417, "only audio frames");
  assert.equal(one.durationMs, Math.round(10 * 1152 / 44100 * 1000));
  const merged = audio.mergeAudio([mp3(10), mp3(20), mp3(5, { tag: false, xing: false })], "mp3");
  assert.equal(merged.bytes.length, 35 * 417);
  assert.ok(Math.abs(merged.durationMs - 35 * 1152 / 44100 * 1000) <= 2);
  assert.deepEqual([...merged.bytes.subarray(0, 4)], [0xff, 0xfb, 0x90, 0x64], "starts on a frame (no tag, no Xing)");
  assert.equal(audio.detectFormat(mp3(2)), "mp3");
  assert.equal(audio.parseMp3(new Uint8Array(Buffer.from("not audio at all"))), null);
  assert.throws(() => audio.mergeAudio([mp3(2), new Uint8Array(Buffer.from("{\"error\":1}"))], "mp3"), /Not an MP3/);
});

test("WAV: PCM joined under one header, streamed size handled, mismatched formats refused", () => {
  const merged = audio.mergeAudio([wav(16000), wav(8000), wav(4000, { streamed: true })], "wav");
  const info = audio.parseWav(merged.bytes);
  assert.equal(info.data.length, 28000 * 2);
  assert.equal(merged.durationMs, 1750);
  assert.equal(info.sampleRate, 16000);
  assert.equal(audio.detectFormat(wav(10)), "wav");
  assert.throws(() => audio.mergeAudio([wav(10), wav(10, { rate: 24000 })], "wav"), /differ/);
  assert.throws(() => audio.mergeAudio([], "wav"), /No audio/);
});

// ---- Providers (mocked fetch) -------------------------------------------------------------------------------------
const ENV = { OPENAI_API_KEY: "sk-test-openai", AISHA_API_KEY: "aisha-test-key", ELEVENLABS_API_KEY: "el-test-key" };

test("OpenAI adapter: /v1/audio/speech, Bearer key in the header only, model from env, speed per model", async () => {
  const { fetcher, calls } = mockFetch([["api.openai.com/v1/audio/speech", () => audioResponse(mp3(3))]]);
  const bytes = await openaiProvider.synthesize({ text: "Salom", lang: "uz", voice: "nova", speed: 1.3, format: "mp3" }, ENV, fetcher);
  assert.equal(audio.detectFormat(bytes), "mp3");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-test-openai");
  assert.deepEqual([body.model, body.voice, body.input, body.response_format], ["gpt-4o-mini-tts", "nova", "Salom", "mp3"]);
  assert.match(body.instructions, /Uzbek/);
  assert.match(body.instructions, /faster/);
  assert.equal(body.speed, undefined, "gpt-4o-mini-tts: pace via instructions");
  assert.ok(!calls[0].url.includes("sk-test"), "key never in the URL");

  await openaiProvider.synthesize({ text: "Hi", lang: "en", voice: "alloy", speed: 9, format: "wav" }, { ...ENV, OPENAI_TTS_MODEL: "tts-1-hd" }, fetcher);
  const legacy = JSON.parse(calls[1].init.body);
  assert.deepEqual([legacy.model, legacy.speed, legacy.response_format], ["tts-1-hd", 4, "wav"], "tts-1*: speed param, clamped");
  assert.equal((await openaiProvider.voices({ OPENAI_TTS_MODEL: "tts-1" })).some(v => v.id === "marin"), false, "tts-1 has only its own voices");
  assert.equal((await openaiProvider.voices({})).length, 13);
  assert.equal(openaiProvider.costUsd(1000, { OPENAI_TTS_MODEL: "tts-1" }), 0.015);

  const failing = mockFetch([["openai", () => new Response(JSON.stringify({ error: { message: "Invalid voice" } }), { status: 400 })]]);
  await assert.rejects(openaiProvider.synthesize({ text: "x", lang: "en", voice: "zzz", speed: 1, format: "mp3" }, ENV, failing.fetcher), error => error instanceof TtsProviderError && error.status === 400 && error.message === "Invalid voice");
});

test("Aisha adapter: documented form fields, X-Api-Key, audio_path downloaded, key only to Aisha", async () => {
  const { fetcher, calls } = mockFetch([
    ["/api/v1/tts/post/", () => new Response(JSON.stringify({ audio_path: "/media/tts_audios/abc.wav" }), { status: 201 })],
    ["/media/tts_audios/abc.wav", () => new Response(wav(1600), { status: 200 })],
    ["cdn.example.com", () => new Response(wav(800), { status: 200 })],
  ]);
  const bytes = await aishaProvider.synthesize({ text: "Assalomu alaykum", lang: "uz", voice: "gulnoza:cheerful", speed: 3, format: "wav" }, ENV, fetcher);
  assert.equal(audio.detectFormat(bytes), "wav");
  assert.equal(calls[0].url, "https://back.aisha.group/api/v1/tts/post/");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["X-Api-Key"], "aisha-test-key");
  const form = calls[0].init.body;
  assert.deepEqual([form.get("transcript"), form.get("language"), form.get("model"), form.get("mood"), form.get("speed")], ["Assalomu alaykum", "uz", "Gulnoza", "Cheerful", "2"], "speed clamped to 0.5–2");
  assert.equal(calls[1].url, "https://back.aisha.group/media/tts_audios/abc.wav");

  await aishaProvider.synthesize({ text: "Привет", lang: "ru", voice: "default", speed: 1.5, format: "wav" }, ENV, fetcher);
  const ru = calls[2].init.body;
  assert.deepEqual([ru.get("language"), ru.get("model"), ru.get("mood"), ru.get("speed")], ["ru", null, null, null], "ru/en: no model, mood or speed");

  await aishaProvider.synthesize({ text: "Salom", lang: "uz", voice: "voice:42", speed: 1, format: "wav" }, ENV, fetcher);
  const custom = calls[4].init.body;
  assert.deepEqual([custom.get("voice_id"), custom.get("mood"), custom.get("model")], ["42", null, null], "own voice: voice_id, no mood");

  const cdn = mockFetch([["/api/v1/tts/post/", () => new Response(JSON.stringify({ audio_path: "https://cdn.example.com/a.wav" }), { status: 201 })], ["cdn.example.com", () => new Response(wav(10))]]);
  await aishaProvider.synthesize({ text: "x", lang: "uz", voice: "gulnoza", speed: 1, format: "wav" }, ENV, cdn.fetcher);
  assert.equal(cdn.calls[1].init.headers["X-Api-Key"], undefined, "the key is not sent to another host");

  const broke = mockFetch([["aisha", () => new Response("{}", { status: 402 })]]);
  await assert.rejects(aishaProvider.synthesize({ text: "x", lang: "uz", voice: "gulnoza", speed: 1, format: "wav" }, ENV, broke.fetcher), /balansi/);
  const noPath = mockFetch([["aisha", () => new Response("{}", { status: 201 })]]);
  await assert.rejects(aishaProvider.synthesize({ text: "x", lang: "uz", voice: "gulnoza", speed: 1, format: "wav" }, ENV, noPath.fetcher), /audio_path/);

  assert.deepEqual(customVoices({ AISHA_VOICE_IDS: "Ali:12, 34 ,bad:x" }).map(v => [v.id, v.name]), [["voice:12", "Ali"], ["voice:34", "Ovoz 34"]]);
  const uz = voicesFor(await aishaProvider.voices({}), "uz").map(v => v.id);
  assert.deepEqual(uz, ["gulnoza", "gulnoza:cheerful", "gulnoza:happy", "gulnoza:sad"]);
  assert.equal(aishaProvider.maxChars <= 1000, true, "under Aisha's 1000-character limit");
  assert.equal(aishaProvider.costUsd(1000, {}), 0.08);
});

test("ElevenLabs adapter: account voices (fallback premade), xi-api-key header, mp3", async () => {
  const { fetcher, calls } = mockFetch([
    ["/v1/voices", () => new Response(JSON.stringify({ voices: [{ voice_id: "abcdEFGH1234", name: "Bek", category: "cloned", labels: { gender: "male" } }] }))],
    ["/v1/text-to-speech/", () => audioResponse(mp3(2))],
  ]);
  assert.deepEqual(await elevenlabsProvider.voices(ENV, fetcher), [{ id: "abcdEFGH1234", name: "Bek", langs: "all", gender: "male", note: "cloned" }]);
  assert.equal(calls[0].init.headers["xi-api-key"], "el-test-key");
  await elevenlabsProvider.synthesize({ text: "Hello", lang: "en", voice: "abcdEFGH1234", speed: 2, format: "mp3" }, ENV, fetcher);
  assert.match(calls[1].url, /\/v1\/text-to-speech\/abcdEFGH1234\?output_format=mp3_44100_128$/);
  const body = JSON.parse(calls[1].init.body);
  assert.deepEqual([body.model_id, body.voice_settings.speed], ["eleven_multilingual_v2", 1.2]);
  await assert.rejects(elevenlabsProvider.synthesize({ text: "x", lang: "en", voice: "../../x", speed: 1, format: "mp3" }, ENV, fetcher), /voice_id/);
  const down = mockFetch([["/v1/voices", () => new Response("", { status: 500 })]]);
  assert.ok((await elevenlabsProvider.voices(ENV, down.fetcher)).some(v => v.name === "Rachel"), "fallback to premade voices");
  assert.ok(!elevenlabsProvider.languages({}).includes("uz"));
  assert.ok(elevenlabsProvider.languages({ ELEVENLABS_MODEL: "eleven_v3" }).includes("uz"));
});

test("registry: provider without a key is listed as 'kalit kiritilmagan', keys never in the output", async () => {
  const { fetcher } = mockFetch([["/v1/voices", () => new Response(JSON.stringify({ voices: [] }))]]);
  const none = await describeProviders({}, fetcher);
  assert.deepEqual(none.map(p => [p.id, p.configured, p.status]), [["aisha", false, "kalit kiritilmagan (AISHA_API_KEY)"], ["openai", false, "kalit kiritilmagan (OPENAI_API_KEY)"], ["elevenlabs", false, "kalit kiritilmagan (ELEVENLABS_API_KEY)"]]);
  const all = await describeProviders(ENV, fetcher);
  assert.ok(all.every(p => p.configured));
  const json = JSON.stringify(all);
  for (const secret of Object.values(ENV)) assert.ok(!json.includes(secret), "no key in the voices list");
  assert.equal(getProvider("aisha").id, "aisha");
  assert.equal(getProvider("nope"), null);
  for (const lang of r.MAIN_LANGUAGES) assert.ok(all.some(p => p.languages.includes(lang)), `${lang} is spoken by some provider`);
  for (const p of all) assert.ok(p.maxChars >= 500 && p.formats.length > 0);
});

// ---- API auth and wiring ------------------------------------------------------------------------------------------
test("API auth: Bearer TTS_API_TOKEN on both endpoints, nothing open without a token", async () => {
  assert.equal(bearerMatches("Bearer tts-secret", "tts-secret"), true);
  assert.equal(bearerMatches("Bearer wrong", "tts-secret"), false);
  assert.equal(bearerMatches("tts-secret", "tts-secret"), false);
  assert.equal(bearerMatches("Bearer anything", undefined), false, "no TTS_API_TOKEN → closed");
  for (const path of ["../app/api/tts/route.ts", "../app/api/tts/voices/route.ts"]) {
    const source = await read(path);
    assert.match(source, /if \(!bearerMatches\(request\.headers\.get\("authorization"\), process\.env\.TTS_API_TOKEN\)\) return NextResponse\.json\(\{ error: "unauthorized" \}, \{ status: 401 \}\);/, `${path}: auth first`);
    const body = source.slice(source.indexOf("export async function"));
    assert.ok(body.indexOf("bearerMatches") < body.search(/request\.json|providersInfo|generateFull/), `${path}: auth before any work`);
  }
});

test("wiring: Super Admin only, keys only from env and never logged, additive migration, nav chip", async () => {
  const page = await read("../app/admin/(protected)/instagram/voice/page.tsx");
  assert.match(page, /await requireRole\("SUPER_ADMIN"\)/);
  const actions = await read("../app/admin/(protected)/instagram/voice/actions.ts");
  assert.match(actions, /requireRole\("SUPER_ADMIN"\)/);
  for (const name of ["previewVoiceAction", "generateVoiceAction", "sampleVoiceAction", "deleteVoiceAction"]) assert.match(actions, new RegExp(`export async function ${name}[\\s\\S]*?await actor\\(\\)`), `${name} checks the role`);
  const nav = await read("../app/admin/(protected)/instagram/page.tsx");
  assert.match(nav, /user\.role === "SUPER_ADMIN" && <Link className="bk-chip" href="\/admin\/instagram\/voice">Ovoz<\/Link>/);
  for (const path of ["../lib/tts/service.ts", "../lib/tts/providers/openai.ts", "../lib/tts/providers/aisha.ts", "../lib/tts/providers/elevenlabs.ts", "../lib/tts/storage.ts", "../app/api/tts/route.ts"]) {
    const source = await read(path);
    assert.doesNotMatch(source, /console\.\w+\([^)]*(apiKey|API_KEY|key\(env)/, `${path}: no key in a log`);
    assert.doesNotMatch(source, /sk-[A-Za-z0-9]{10,}/, `${path}: no hard-coded key`);
  }
  const service = await read("../lib/tts/service.ts");
  assert.match(service, /limitError\(/, "monthly limit checked before calling the provider");
  assert.ok(service.indexOf("limitError(") < service.indexOf("provider.synthesize("));
  assert.match(service, /costUsd, durationMs/, "cost written to the history row");
  const board = await read("../components/admin/instagram/voice-studio.tsx");
  for (const label of ["Sinab eshitish", "Ovoz yasash", "Yuklab olish", "Ovozlar galereyasi", "O‘chirish"]) assert.ok(board.includes(label), label);
  assert.doesNotMatch(board, /className="admin-table-wrap"/, "cards, no hidden table on phones");
  const migration = await read("../prisma/migrations/20261023090000_add_tts_generation/migration.sql");
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), /\bDROP\b|DELETE FROM|\bTRUNCATE\b|ALTER COLUMN/i);
  assert.match(migration, /CREATE TABLE "TtsGeneration"/);
});
