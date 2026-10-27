import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const core = await import("../lib/kassa/bot-core.ts");
const kassa = await import("../lib/kassa/rules.ts");
const source = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");

const CATEGORIES = [{ id: "fuel", name: "Benzin", type: "OUT" }, { id: "food", name: "Ovqat", type: "OUT" }, { id: "ads", name: "Reklama", type: "OUT" }, { id: "debt", name: "Mijoz qarzi", type: "IN" }];
// What the OpenAI mock "understands" from each phrase (the real model gets the same rules in its prompt).
const AI = {
  "benzinga 300 ming": { type: "OUT", amount: 300000, currency: "UZS", categoryName: "Benzin", note: "Benzin", flags: [] },
  "Atxam akadan 500 dollar oldim qarzidan": { type: "IN", amount: 500, currency: "USD", categoryName: "Mijoz qarzi", note: "Atxam aka · qarzidan", flags: [] },
  "ovqatga 80 ming so‘m": { type: "OUT", amount: 80000, currency: "UZS", categoryName: "Ovqat", note: "Ovqat", flags: [] },
  "1,5 mln reklama": { type: "OUT", amount: 1500000, currency: "UZS", categoryName: "Reklama", note: "Reklama", flags: [] },
  "UCS yo‘lkira 120": { type: "OUT", amount: 120, currency: "UZS", categoryName: null, note: "UCS yo‘lkira", flags: [] }, // the model guessed a currency
  "yo‘q, 350 ming edi": { type: "OUT", amount: 350000, currency: "UZS", categoryName: "Benzin", note: "Benzin", flags: [] },
};

function fakeDb() {
  const drafts = [], entries = [], updates = new Set();
  const match = (row, where = {}) => Object.entries(where).every(([key, value]) => value && typeof value === "object" && "gte" in value ? row[key] && row[key] >= value.gte : row[key] === value);
  const db = {
    kassaCategory: { findMany: async () => CATEGORIES, findUnique: async ({ where }) => CATEGORIES.find(item => item.id === where.id) ?? null },
    kassaBotUpdate: { create: async ({ data }) => { if (updates.has(data.updateId)) throw Object.assign(new Error("unique"), { code: "P2002" }); updates.add(data.updateId); } },
    kassaDraft: {
      create: async ({ data }) => { const row = { id: `d${drafts.length + 1}`, status: "PENDING", paymentType: "CASH", tgReplyMessageId: null, editRequestedAt: null, ...data }; drafts.push(row); return { ...row }; },
      findFirst: async ({ where, orderBy }) => { const rows = drafts.filter(row => match(row, where)); return (orderBy ? rows.at(-1) : rows[0]) ?? null; },
      findUnique: async ({ where }) => drafts.find(row => row.id === where.id) ?? null,
      findMany: async ({ where }) => drafts.filter(row => match(row, where)),
      update: async ({ where, data }) => ({ ...Object.assign(drafts.find(row => row.id === where.id), data) }),
      updateMany: async ({ where, data }) => { const rows = drafts.filter(row => match(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
    },
    kassaEntry: { create: async ({ data }) => { const row = { id: `e${entries.length + 1}`, ...data }; entries.push(row); return row; } },
    // Rolls back the entries a failed transaction created.
    $transaction: async fn => {
      const mine = [], tx = { ...db, kassaEntry: { create: async args => { await Promise.resolve(); const row = await db.kassaEntry.create(args); mine.push(row); return row; } } };
      try { return await fn(tx); } catch (error) { for (const row of mine) entries.splice(entries.indexOf(row), 1); throw error; }
    },
  };
  return { db, drafts, entries };
}

function setup() {
  const store = fakeDb(), sent = [];
  const tg = async (method, payload) => { sent.push({ method, payload }); return method === "sendMessage" ? { message_id: 900 + sent.length } : true; };
  const bot = core.createKassaBot({ db: store.db, tg, transcribe: async () => "Atxam akadan 500 dollar oldim qarzidan", analyze: async text => structuredClone(AI[text]), owner: "42", secret: "s3cret" });
  let id = 0;
  const say = async (text, extra = {}) => { const { status, run } = await bot.receive("s3cret", { update_id: ++id, message: { message_id: 500 + id, date: 1793080000, chat: { id: 42 }, from: { id: 42 }, text, ...extra } }); await run?.(); return status; };
  return { ...store, sent, bot, say };
}

test("analysis: amounts, currencies and categories are checked on the server; a currency the text never names is not guessed", () => {
  const parse = text => core.normalizeDraft(AI[text], CATEGORIES, text);
  assert.deepEqual(parse("benzinga 300 ming"), { type: "OUT", amount: 300000, currency: "UZS", categoryId: "fuel", note: "Benzin", flags: [] });
  assert.deepEqual(parse("Atxam akadan 500 dollar oldim qarzidan"), { type: "IN", amount: 500, currency: "USD", categoryId: "debt", note: "Atxam aka · qarzidan", flags: [] });
  assert.deepEqual(parse("ovqatga 80 ming so‘m"), { type: "OUT", amount: 80000, currency: "UZS", categoryId: "food", note: "Ovqat", flags: [] });
  assert.equal(parse("1,5 mln reklama").amount, 1500000);
  assert.equal(parse("1,5 mln reklama").currency, "UZS");
  const ucs = parse("UCS yo‘lkira 120");
  assert.equal(ucs.currency, null);
  assert.deepEqual(ucs.flags, ["CURRENCY_UNCLEAR", "CATEGORY_UNKNOWN"]);
  assert.deepEqual(core.normalizeDraft({ type: "SIDEWAYS", amount: -5, currency: "EUR", categoryName: "Benzin", note: "", flags: [] }, CATEGORIES, "x").flags, ["TYPE_UNCLEAR", "AMOUNT_MISSING", "CURRENCY_UNCLEAR"]);
  assert.equal(core.normalizeDraft({ ...AI["benzinga 300 ming"], categoryName: "Mijoz qarzi" }, CATEGORIES, "benzinga 300 ming").categoryId, null, "a category of the other type does not count");
});

test("bot: a text becomes a PENDING draft and a card with ✏️ / 🗑; a voice message shows its transcript in italics", async () => {
  const { say, drafts, sent, entries } = setup();
  assert.equal(await say("benzinga 300 ming"), 200);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].status, "PENDING");
  assert.equal(drafts[0].source, "TEXT");
  assert.equal(drafts[0].occurredAt.getTime(), 1793080000 * 1000, "Telegram message time");
  const card = sent.at(-1).payload;
  assert.match(card.text, /Turi: ↑ Chiqim\nSumma: −300 000 so‘m\nKategoriya: Benzin\nIzoh: Benzin\n\nSaytga «tasdiqlash kutmoqda» bo‘lib tushdi ⏳$/);
  assert.deepEqual(card.reply_markup.inline_keyboard[0].map(button => button.text), ["✏️ Tuzatish", "🗑 Bekor"]);
  assert.equal(drafts[0].tgReplyMessageId, 900 + sent.length);
  await say(undefined, { voice: { file_id: "f1" } });
  assert.equal(drafts[1].source, "VOICE");
  assert.match(sent.at(-1).payload.text, /^<i>«Atxam akadan 500 dollar oldim qarzidan»<\/i>\n\nTuri: ↓ Kirim\nSumma: \+\$ 500/);
  assert.equal(entries.length, 0, "nothing reaches the kassa before ✓");
});

test("security: wrong secret → 401; a stranger gets silence; a repeated update_id makes one draft", async () => {
  const { bot, drafts, sent } = setup();
  const update = { update_id: 7, message: { message_id: 1, date: 1793080000, chat: { id: 42 }, from: { id: 42 }, text: "benzinga 300 ming" } };
  assert.deepEqual(await bot.receive("wrong", update), { status: 401 });
  assert.deepEqual(await bot.receive(null, update), { status: 401 });
  assert.deepEqual(await bot.receive("s3cret", { ...update, message: { ...update.message, from: { id: 666 } } }), { status: 200 });
  assert.equal(drafts.length + sent.length, 0, "no draft, no reply for a stranger");
  const first = await bot.receive("s3cret", update);
  await first.run();
  const again = await bot.receive("s3cret", update);
  assert.equal(again.run, undefined);
  assert.equal(drafts.length, 1);
});

test("correction (reply or ✏️) updates a PENDING draft; a confirmed one is not corrected", async () => {
  const { say, bot, drafts, sent } = setup();
  await say("benzinga 300 ming");
  await say("yo‘q, 350 ming edi", { reply_to_message: { message_id: drafts[0].tgReplyMessageId } });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].amount, 350000);
  assert.equal(sent.at(-1).payload.text, "✅ Tuzatildi: Benzin — −350 000 so‘m");
  assert.ok(sent.some(item => item.method === "editMessageText" && /−350 000/.test(item.payload.text)), "the card is rewritten");

  const { status, run } = await bot.receive("s3cret", { update_id: 99, callback_query: { id: "q", from: { id: 42 }, data: `kb:edit:${drafts[0].id}`, message: { message_id: 1, chat: { id: 42 } } } });
  assert.equal(status, 200);
  await run();
  assert.ok(drafts[0].editRequestedAt);
  assert.deepEqual(await bot.confirmDraft(drafts[0].id, "admin"), { ok: true });
  await say("yo‘q, 350 ming edi", { reply_to_message: { message_id: drafts[0].tgReplyMessageId } });
  assert.equal(drafts.length, 1);
  assert.equal(sent.at(-1).payload.text, "Bu yozuv allaqachon ko‘rib chiqilgan — tuzatib bo‘lmaydi.");
});

test("✓ makes exactly one KassaEntry (pressed twice or in parallel); cancelled and pending drafts never touch the balance", async () => {
  const { say, bot, drafts, entries, sent } = setup();
  await say("benzinga 300 ming");
  await say("ovqatga 80 ming so‘m");
  await say("UCS yo‘lkira 120");
  const [fuel, food, ucs] = drafts;
  const results = await Promise.all([bot.confirmDraft(fuel.id, "admin"), bot.confirmDraft(fuel.id, "admin")]);
  assert.deepEqual(results.map(result => result.ok).sort(), [false, true]);
  assert.deepEqual(await bot.confirmDraft(fuel.id, "admin"), { ok: false, error: "Bu yozuv allaqachon ko‘rib chiqilgan." });
  assert.equal(entries.length, 1);
  assert.deepEqual({ ...entries[0], occurredAt: entries[0].occurredAt.getTime() }, { id: entries[0].id, type: "OUT", amount: 300000, currency: "UZS", categoryId: "fuel", paymentType: "CASH", note: "Benzin", occurredAt: fuel.occurredAt.getTime(), createdById: "admin" });
  assert.equal(fuel.status, "CONFIRMED");
  assert.equal(fuel.entryId, entries[0].id);
  assert.match(sent.findLast(item => item.method === "editMessageText").payload.text, /✅ Kassaga o‘tdi$/);

  assert.equal(await bot.cancelDraft(food.id), true);
  assert.equal(food.status, "CANCELLED");
  assert.match(sent.findLast(item => item.method === "editMessageText").payload.text, /❌ Bekor qilindi$/);
  assert.equal(await bot.cancelDraft(food.id), false);
  assert.deepEqual(await bot.confirmDraft(ucs.id, "admin"), { ok: false, error: "Avval ✏️ bilan tuzating." }, "flagged: ✓ is off");
  const day = kassa.ledger({ USD: 0, UZS: 0 }, entries, "2026-10-27", "2026-10-28").at(-1);
  assert.equal(day.UZS.end, -300000, "only the confirmed draft counts");
  assert.deepEqual(drafts.filter(draft => draft.status === "PENDING" && core.entryFromDraft(draft)).map(draft => draft.id), [], "the flagged draft is left out of “Hammasini tasdiqlash”");
});

test("site and setup: every kassa action and the bot setup are SUPER_ADMIN only; Madina's bot is untouched", async () => {
  const actions = await source("app/admin/(protected)/kassa/actions.ts");
  const bodies = actions.split("export async function ").slice(1);
  assert.equal(bodies.length, 9);
  for (const body of bodies) assert.match(body.split("\n")[1], /^\s+(const user = )?await requireRole\("SUPER_ADMIN"\);$/, body.slice(0, 30));
  assert.match(actions, /confirmAllDraftsAction[\s\S]*?drafts\.filter\(item => entryFromDraft\(item\)\)/);
  assert.match(await source("app/api/kassa-bot/setup/route.ts"), /await requireRole\("SUPER_ADMIN"\);/);
  const bot = await source("lib/kassa/bot.ts");
  assert.doesNotMatch(bot, /TELEGRAM_BOT_TOKEN|lib\/telegram/);
  assert.match(bot, /KASSA_BOT_TOKEN/);
});
