import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/instagram/rules.ts");
const { ingestWebhook } = await import("../lib/instagram/ingest.ts");
const { directRecipients } = await import("../lib/instagram/direct-rules.ts");
const stories = await import("../lib/stories/rules.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

const now = new Date("2026-10-16T10:00:00Z");
const BK = { igUserId: "17841400000000001", username: "buyuk_karavan" };
const EM = { igUserId: "17841400000000002", username: "eshikmaster" };
const entry = (account, commentId, text, mid) => ({
  id: account.igUserId, time: Math.floor(now.getTime() / 1000),
  changes: [{ field: "comments", value: { id: commentId, text, from: { id: `fan-${commentId}`, username: `fan_${commentId}` }, media: { id: `media-${account.username}` } } }],
  messaging: [{ sender: { id: `cust-${mid}` }, recipient: { id: account.igUserId }, timestamp: now.getTime(), message: { mid, text: "Salom" } }],
});
const memoryStore = () => { const rows = new Map(); return { rows, insertComment: async row => rows.has(row.commentId) ? false : (rows.set(row.commentId, row), true) }; };

test("one notification for two accounts: each account gets only its own comments and Direct messages", async () => {
  const payload = { object: "instagram", entry: [entry(BK, "c-bk", "narxi qancha?", "m-bk"), entry(EM, "c-em", "telefon raqam?", "m-em")] };
  const bkStore = memoryStore(), emStore = memoryStore();
  const bk = await ingestWebhook(payload, BK, bkStore, now), em = await ingestWebhook(payload, EM, emStore, now);
  assert.deepEqual(bk.queued, ["c-bk"]);
  assert.deepEqual(em.queued, ["c-em"]);
  assert.deepEqual([...bkStore.rows.keys()], ["c-bk"], "no eshikmaster comment in Buyuk Karavan's journal");
  assert.deepEqual([...emStore.rows.keys()], ["c-em"]);
  assert.deepEqual(bk.direct.map(event => event.mid), ["m-bk"]);
  assert.deepEqual(em.direct.map(event => event.mid), ["m-em"]);
  const unknown = await ingestWebhook({ object: "instagram", entry: [entry({ igUserId: "999", username: "x" }, "c-x", "narx", "m-x")] }, BK, memoryStore(), now);
  assert.deepEqual([unknown.queued, unknown.direct], [[], []], "an account that is not connected is ignored");
});

test("contact kinds (eshikmaster): phone / address / working hours only when the account answers them", () => {
  const contact = { contact: true };
  for (const [text, kind] of [["Telefon raqamingiz?", "PHONE"], ["tel bering", "PHONE"], ["номер?", "PHONE"], ["Aloqa uchun", "PHONE"], ["Manzil qayerda?", "ADDRESS"], ["adres", "ADDRESS"], ["Где вы находитесь", "ADDRESS"], ["Ish vaqtingiz qanaqa?", "HOURS"]]) {
    assert.equal(rules.classifyByKeywords(text, [], contact).definite, kind, text);
  }
  assert.equal(rules.classifyByKeywords("narxi va telefon?", [], contact).definite, "PRICE", "price + phone: the price question wins");
  assert.equal(rules.classifyByKeywords("kotel bormi", [], contact).definite === "PHONE", false, "“tel” only at a word start");
  assert.equal(rules.classifyByKeywords("telegramdan yozing", [], contact).definite === "PHONE", false);
  assert.equal(rules.classifyByKeywords("Manzil qayerda?").definite, "QUESTION", "Buyuk Karavan (contact off): still a QUESTION, as before");
});

test("each account: own templates ({telefon} {manzil} {moljal} {xarita} {ishVaqti}), own daily limit, own settings", () => {
  const values = (contact, telefon) => ({ mahsulot: "", narx_som: "", havola: "", telefon, contact });
  const template = "Tel: {telefon}\nManzil: {manzil} ({moljal})\n{xarita}\nIsh vaqti: {ishVaqti}";
  assert.equal(rules.renderTemplate(template, values({ manzil: "Namangan, Eshik bozori", moljal: "Chorsu", xarita: "https://yandex.uz/maps/1", ishVaqti: "9:00–19:00" }, "+998901112233")), "Tel: +998901112233\nManzil: Namangan, Eshik bozori (Chorsu)\nhttps://yandex.uz/maps/1\nIsh vaqti: 9:00–19:00");
  assert.equal(rules.renderTemplate("Tel: {telefon} {manzil}", values(undefined, "+998916377777")), "Tel: +998916377777", "an account without an address: empty, never another account's");

  const base = { priceEnabled: true, positiveEnabled: true, questionEnabled: true, negativeNotify: true };
  const bk = { ...base, dailyReplyLimit: 150, contactRepliesEnabled: false, noPriceDmTemplate: null };
  const em = { ...base, dailyReplyLimit: 5, contactRepliesEnabled: true, noPriceDmTemplate: "Narxni telefon orqali aytamiz: {telefon}" };
  const context = (repliesToday, rule = { isActive: true, productId: "p1" }) => ({ rule, alreadyAnswered: false, repliesToday, generalReplyEnabled: false });
  assert.deepEqual(rules.chooseAction("PRICE", bk, context(5)), { type: "price", publicReply: true }, "5 replies today: under Buyuk Karavan's 150");
  assert.deepEqual(rules.chooseAction("PRICE", em, context(5)), { type: "price", publicReply: false }, "5 replies today: eshikmaster's limit of 5 is reached (DM only)");
  assert.deepEqual(rules.chooseAction("PHONE", em, context(0)), { type: "contact", kind: "PHONE", publicReply: true });
  assert.equal(rules.chooseAction("PHONE", bk, context(0)).type, "skip");

  // Price on a post without a product: the post's price text, else the account's "price by phone" DM, else as before.
  const noProduct = { isActive: true, productId: null };
  assert.deepEqual(rules.chooseAction("PRICE", em, context(0, noProduct)), { type: "price", publicReply: true });
  assert.deepEqual(rules.chooseAction("PRICE", { ...em, noPriceDmTemplate: null }, context(0, { ...noProduct, priceText: "2 500 000 so‘mdan" })), { type: "price", publicReply: true });
  assert.deepEqual(rules.chooseAction("PRICE", bk, context(0, noProduct)), { type: "skip", reason: "Postga mahsulot biriktirilmagan" }, "Buyuk Karavan unchanged");
});

test("Telegram: each account's Direct goes to its own group; without a group to the Direct admins (as before)", () => {
  const receivers = [{ id: "a1", name: "Ikrom", chatId: "111" }], supers = [{ id: "s1", name: "Boss", chatId: "999" }, { id: "a1", name: "Ikrom", chatId: "111" }];
  assert.deepEqual(directRecipients("-1001234567890", receivers, supers), [{ id: "", name: "Telegram guruh", chatId: "-1001234567890" }]);
  assert.deepEqual(directRecipients(null, receivers, supers), receivers);
  assert.deepEqual(directRecipients("-1001234567890", receivers, supers, true).map(person => person.chatId), ["-1001234567890", "999", "111"], "2 h reminder / report: + Super Admins");
  assert.deepEqual(directRecipients(null, receivers, supers, true).map(person => person.chatId), ["111", "999"], "one message per chat");
});

test("AI and Telegram name the account; stories day button stays within one account", async () => {
  assert.equal(rules.accountBrand({ brandName: null, username: "eshikmaster" }), "@eshikmaster");
  assert.equal(rules.accountName({ label: "Eshik Master", username: "eshikmaster" }), "Eshik Master");
  const ai = await read("../lib/instagram/ai.ts");
  assert.doesNotMatch(ai, /BUYUK KARAVAN/, "the brand comes from the account, never hard-coded");
  assert.match(ai, /classifyPrompt\(brand\)/);
  assert.match(ai, /replyPrompt\(brand\)/);
  const keyboard = stories.approvalKeyboard("ckabcdefgh12", new Date("2026-10-12T06:00:00Z"), "ckaccount0001");
  const day = keyboard.inline_keyboard[1][0].callback_data;
  assert.ok(day.length <= 64);
  assert.deepEqual(stories.parseStoryCallback(day), { kind: "day", day: "2026-10-12", accountId: "ckaccount0001" });
});

test("wiring: queue, pacing, lock and limit per account; webhook routed by entry.id; first account migrated as is", async () => {
  const service = await read("../lib/instagram/service.ts");
  assert.match(service, /findMany\(\{ where: \{ igUserId: \{ in: ids \}, tokenEncrypted: \{ not: "" \} \} \}\)/, "webhook: connected accounts by entry.id");
  assert.match(service, /data: \[\{ \.\.\.row, accountId \}\]/, "comment rows carry their account");
  assert.match(service, /updateMany\(\{ where: \{ id: accountId, OR: \[\{ runnerUntil/, "one runner per account");
  assert.match(service, /updateMany\(\{ where: \{ id: accountId, OR: \[\{ nextActionAt/, "8–25 s pacing per account");
  assert.match(service, /count\(\{ where: \{ accountId: account\.id, publicReplyAt: \{ gte: tashkentDayStart\(\) \} \} \}\)/, "daily limit per account");
  assert.match(service, /where: \{ accountId, status: "PENDING", nextAttemptAt/, "queue per account");
  assert.match(service, /if \(account\.id !== FIRST_ACCOUNT_ID\) return "";/, "no Buyuk Karavan footer phone for another brand");
  const direct = await read("../lib/instagram/direct.ts");
  assert.match(direct, /accountId_igsid: \{ accountId: account\.id, igsid: customer \}/);
  const callback = await read("../app/api/instagram/oauth/callback/route.ts");
  assert.match(callback, /upsert\(\{ where: \{ igUserId: me\.userId \}/, "reconnecting keeps the account (and its history)");
  assert.match(callback, /return back\(origin, "mismatch"\)/);

  const migration = await read("../prisma/migrations/20261025090000_instagram_multi_account/migration.sql");
  const sql = migration.replace(/^--.*$/gm, "");
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/i, "no data removed");
  for (const line of sql.match(/ADD COLUMN[^\n]*NOT NULL[^\n]*/g)) assert.match(line, /DEFAULT/, line);
  for (const table of ["InstagramComment", "InstagramMessage", "InstagramConversation", "InstagramMediaRule", "InstagramDailyStat", "InstagramMediaStat", "InstagramAudienceSnapshot", "StoryQueueItem", "TtsGeneration"]) {
    assert.match(sql, new RegExp(`ALTER TABLE "${table}"[^;]*"accountId" VARCHAR\\(64\\) NOT NULL DEFAULT 'global'`), `${table}: existing rows → the first account`);
  }
  assert.match(sql, /UPDATE "Lead" SET "instagramAccountId" = 'global'/);
});

test("eshikmaster: AI answers every other comment (1–2 sentences, own prompt); contact / price → one fixed Direct; no leads, Direct, Telegram", async () => {
  const { ESHIKMASTER_PRESET: em } = await import("../lib/instagram/constants.ts");
  const settings = { ...em, dailyReplyLimit: 150 };
  const context = { rule: null, alreadyAnswered: false, repliesToday: 0, generalReplyEnabled: false };
  for (const kind of ["POSITIVE", "QUESTION", "UNKNOWN"]) assert.deepEqual(rules.chooseAction(kind, settings, context), { type: "positive" }, kind);
  for (const kind of ["SPAM", "NEGATIVE"]) assert.equal(rules.chooseAction(kind, settings, context).type, "skip", `${kind}: no reply, no Telegram`);
  for (const kind of ["PHONE", "ADDRESS", "HOURS"]) assert.equal(rules.chooseAction(kind, settings, context).type, "contact");
  assert.deepEqual(rules.chooseAction("PRICE", settings, context), { type: "price", publicReply: true }, "price → the same fixed Direct");
  for (const [text, kind] of [["Lokatsiya tashlang", "ADDRESS"], ["Qachon kelsak bo'ladi?", "HOURS"], ["Когда можно приехать?", "HOURS"]]) assert.equal(rules.classifyByKeywords(text, [], { contact: true }).definite, kind, text);
  assert.equal(em.phoneDmTemplate, "Assalomu alaykum!\nTelefon: +998 91 185 30 23\nManzil (Google xarita):\nhttps://maps.app.goo.gl/1hSXYLYgBBeAgEZh6");
  assert.equal(em.addressDmTemplate, em.phoneDmTemplate);
  assert.equal(em.hoursDmTemplate, "Assalomu alaykum!\nIsh vaqtini telefon orqali aniqlab oling.\nTelefon: +998 91 185 30 23\nManzil (Google xarita):\nhttps://maps.app.goo.gl/1hSXYLYgBBeAgEZh6");
  assert.equal(em.noPriceDmTemplate, "Assalomu alaykum!\nNarxni telefon orqali aniqlab oling.\nTelefon: +998 91 185 30 23\nManzil (Google xarita):\nhttps://maps.app.goo.gl/1hSXYLYgBBeAgEZh6");
  assert.doesNotMatch(em.phoneDmTemplate + em.hoursDmTemplate, /narx/i, "no price talk unless price was asked");
  assert.doesNotMatch(Object.values(em).join(" "), /\{ishVaqti\}/);
  assert.match(em.aiPrompt, /Narx va ish vaqtini HECH QACHON yozma/);
  assert.equal(em.questionReplyText, "Ma'lumotni Direct'ga yubordik");
  assert.deepEqual([em.leadsEnabled, em.directEnabled, em.negativeNotify], [false, false, false]);
  assert.equal(rules.validPositiveReply("Rahmat, juda xursandmiz! Sizni kutib qolamiz.", "Zo'r eshiklar", 2), true, "two sentences allowed");
  assert.equal(rules.validPositiveReply("Rahmat, juda xursandmiz! Sizni kutib qolamiz.", "Zo'r eshiklar"), false, "Buyuk Karavan: still one");
  assert.equal(rules.validPositiveReply("Rahmat! Ertaga 10 da keling.", "Zo'r", 2), false, "no invented time");
  const service = await read("../lib/instagram/service.ts");
  assert.match(service, /if \(account\.leadsEnabled && /);
  assert.match(service, /account\.directEnabled \? await recordDirectEvents/);
  assert.match(service, /prompt: account\.aiPrompt/);
  assert.match(service, /rule\?\.productId && !account\.aiReplyAll \? rule\.dmTemplate : \(!account\.aiReplyAll && rule\?\.priceText/, "no post price text / product for @eshikmaster");
  assert.match(await read("../app/api/instagram/oauth/callback/route.ts"), /=== "eshikmaster" \? ESHIKMASTER_PRESET/);
  const migration = (await read("../prisma/migrations/20261026090000_instagram_account_ai_switches/migration.sql")).replace(/^--.*$/gm, "");
  assert.doesNotMatch(migration, /DROP|DELETE FROM|TRUNCATE|ALTER COLUMN/i);
});

test("connect (new account too): the long-lived token subscribes the account to comments + messages webhooks", async () => {
  const graph = await read("../lib/instagram/graph.ts");
  assert.match(graph, /subscribeWebhooks = \(token: string\) => call<[^>]*>\(graph\("me\/subscribed_apps", \{ subscribed_fields: "comments,messages" \}\), \{ method: "POST", token \}\)/);
  const callback = await read("../app/api/instagram/oauth/callback/route.ts");
  const long = callback.indexOf("exchangeLongLived("), subscribe = callback.indexOf("await subscribeWebhooks(long.token)"), save = callback.indexOf("instagramAccount.upsert(");
  assert.ok(long > 0 && long < subscribe && subscribe < save, "token → subscribe → save (also for “add”)");
  assert.doesNotMatch(callback.slice(0, subscribe), /if \(target === ADD_ACCOUNT\)[^\n]*return/, "the add flow is not cut short before subscribing");
});
