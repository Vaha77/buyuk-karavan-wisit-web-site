import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const rules = await import("../lib/instagram/rules.ts");
const { ingestWebhook } = await import("../lib/instagram/ingest.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

const SECRET = "test-app-secret";
const sign = body => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
const ACCOUNT = { igUserId: "17841400000000001", username: "buyukkaravan", generalReplyEnabled: true };
const now = new Date("2026-10-11T10:00:00Z");
const commentPayload = (id, text, extra = {}) => ({ object: "instagram", entry: [{ id: ACCOUNT.igUserId, time: Math.floor(now.getTime() / 1000), changes: [{ field: "comments", value: { id, text, from: { id: "9001", username: "mijoz_1" }, media: { id: "18000000000000001", media_product_type: "REELS" }, ...extra } }] }] });

test("webhook signature: HMAC-SHA256 of the raw body with the app secret; anything else is rejected", () => {
  const body = Buffer.from(JSON.stringify(commentPayload("1", "narxi qancha?")));
  assert.equal(rules.validSignature(body, sign(body), SECRET), true);
  assert.equal(rules.validSignature(body.toString("utf8"), sign(body), SECRET), true, "string body too");
  assert.equal(rules.validSignature(Buffer.concat([body, Buffer.from(" ")]), sign(body), SECRET), false, "changed body");
  assert.equal(rules.validSignature(body, sign(body), "other-secret"), false, "wrong secret");
  assert.equal(rules.validSignature(body, sign(body).replace("sha256=", "sha1="), SECRET), false);
  assert.equal(rules.validSignature(body, "sha256=abc", SECRET), false, "malformed");
  assert.equal(rules.validSignature(body, null, SECRET), false, "missing header");
  assert.equal(rules.validSignature(body, sign(body), ""), false, "no secret configured → reject");
});

test("webhook verification echoes hub.challenge only for the right token", () => {
  const params = token => new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": "1158201444" });
  assert.equal(rules.verifyChallenge(params("my-token"), "my-token"), "1158201444");
  assert.equal(rules.verifyChallenge(params("bad"), "my-token"), null);
  assert.equal(rules.verifyChallenge(params("my-token"), ""), null);
  assert.equal(rules.verifyChallenge(new URLSearchParams({ "hub.mode": "unsubscribe", "hub.verify_token": "my-token", "hub.challenge": "1" }), "my-token"), null);
});

test("keywords: words match anywhere (any case / apostrophe), symbols only as a whole comment", () => {
  const k = rules.DEFAULT_KEYWORDS;
  for (const text of ["Narxi qancha?", "NARX", "narxlari bormi", "nech pul", "Nechpul turadi", "Цена?", "сколько стоит", "price pls", "+", "+++", "?", " + ", "🔥+"]) assert.equal(rules.matchesKeywords(text, k), true, text);
  for (const text of ["Zo'r ekan", "Yetkazib berasizmi?", "+998901234567", "", "Super 👍"]) assert.equal(rules.matchesKeywords(text, k), false, text);
  assert.equal(rules.matchesKeywords("bu qancha turadi", ["qancha"]), true);
  assert.equal(rules.matchesKeywords("narx", ["qancha"]), false, "only the post's own keywords");
  assert.equal(rules.matchesKeywords("Necha pul o‘zi", ["necha pul", "o'zi"]), true, "o‘ = o'");
  assert.deepEqual(rules.parseKeywords("Narx, narx,  qancha\nЦена ,"), ["narx", "qancha", "цена"]);
});

test("template: placeholders filled, unknown ones kept, 1000-char limit", () => {
  const values = { mahsulot: "Agregat AK-12", narx_som: "12 450 000", havola: "https://buyukkaravan.com/products/ak-12?utm_source=instagram&utm_campaign=1", telefon: "+998 90 123 45 67", username: "mijoz_1" };
  assert.equal(rules.renderTemplate(rules.DEFAULT_DM_TEMPLATE, values), "Assalomu alaykum! Agregat AK-12 narxi — 12 450 000 so'm. Batafsil: https://buyukkaravan.com/products/ak-12?utm_source=instagram&utm_campaign=1. Savollaringiz bo'lsa shu yerga yozing yoki qo'ng'iroq qiling: +998 90 123 45 67");
  assert.equal(rules.renderTemplate("Salom {username}! {nomalum}", values), "Salom @mijoz_1! {nomalum}");
  assert.equal(rules.renderTemplate("x".repeat(1200), values).length, 1000);
});

test("price: Prays selling price × CBU rate, rounded up to 1 000 so‘m like the site; link carries UTM", () => {
  assert.equal(rules.priceSom("1000", "12650.5"), "12 651 000");
  assert.equal(rules.priceSom("1000.00", "12000"), "12 000 000");
  assert.equal(rules.priceSom("0.5", "12000"), "6 000");
  assert.equal(rules.priceSom(null, "12000"), null, "no price in Prays");
  assert.equal(rules.priceSom("1000", null), null, "no CBU rate");
  assert.equal(rules.priceSom("abc", "12000"), null);
  assert.equal(rules.productLink("https://buyukkaravan.com", "ak-12", "18000000000000001"), "https://buyukkaravan.com/products/ak-12?utm_source=instagram&utm_campaign=18000000000000001");
});

test("limits: 7-day window, backoff, retryable vs permanent errors, token-free reasons", () => {
  assert.equal(rules.tooOld(new Date(now.getTime() - 6 * 86_400_000), now), false);
  assert.equal(rules.tooOld(new Date(now.getTime() - 7 * 86_400_000 - 1000), now), true);
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(rules.backoffMs), [60_000, 300_000, 900_000, 3_600_000, 10_800_000, 10_800_000]);
  for (const error of [{ status: 429 }, { status: 400, code: 4 }, { status: 400, code: 613 }, { status: 400, code: 80002 }, { status: 503 }, { status: 0 }]) assert.equal(rules.isRetryable(error), true, JSON.stringify(error));
  for (const error of [{ status: 400, code: 10 }, { status: 400, code: 100 }, { status: 403, code: 200 }]) assert.equal(rules.isRetryable(error), false, JSON.stringify(error));
  assert.equal(rules.isRateLimit({ status: 400, code: 80002 }), true);
  const reason = rules.errorReason({ status: 400, code: 190, message: "Bad token IGQWRabcdefghijklmnopqrstuvwxyz123 access_token=IGQabc" });
  assert.doesNotMatch(reason, /IGQWRabc|IGQabc/);
  assert.equal(rules.leadKey("9001", "prod_1"), "ig:9001:prod_1");
  assert.equal(rules.isReel("https://www.instagram.com/reel/C8abc/"), true);
  assert.equal(rules.isReel("https://www.instagram.com/p/C8abc/"), false);
});

test("decision: own comments ignored, price question with product queued, others logged as skipped", () => {
  const rule = { isActive: true, productId: "prod_1", keywords: [] };
  const event = (text, extra = {}) => ({ fromId: "9001", username: "mijoz_1", text, time: now, ...extra });
  assert.deepEqual(rules.decideComment(event("narxi?"), ACCOUNT, rule, now), { action: "queue" });
  assert.deepEqual(rules.decideComment(event("narxi?", { fromId: ACCOUNT.igUserId }), ACCOUNT, rule, now), { action: "ignore" });
  assert.deepEqual(rules.decideComment(event("narxi?", { fromId: "x", username: "BuyukKaravan" }), ACCOUNT, rule, now), { action: "ignore" });
  assert.equal(rules.decideComment(event("zo'r"), ACCOUNT, rule, now).reason, "Kalit so‘z yo‘q");
  assert.equal(rules.decideComment(event("narxi?", { time: new Date(now.getTime() - 8 * 86_400_000) }), ACCOUNT, rule, now).reason, "7 kundan eski komment");
  assert.equal(rules.decideComment(event("narxi?"), ACCOUNT, { ...rule, isActive: false }, now).action, "skip");
  assert.deepEqual(rules.decideComment(event("narxi?"), ACCOUNT, null, now), { action: "skip", reason: "Postga mahsulot biriktirilmagan", generalReply: true });
  assert.equal(rules.decideComment(event("narxi?"), { ...ACCOUNT, generalReplyEnabled: false }, null, now).generalReply, false);
});

function memoryStore(rule) {
  const comments = new Map(), messages = new Map();
  return {
    comments, messages,
    rules: async ids => new Map(ids.filter(id => rule && id === "18000000000000001").map(id => [id, rule])),
    insertComment: async row => { if (comments.has(row.commentId)) return false; comments.set(row.commentId, row); return true; },
    insertMessages: async rows => { for (const row of rows) if (!messages.has(row.mid)) messages.set(row.mid, row); },
  };
}

test("idempotency: the same comment delivered twice is stored and queued once", async () => {
  const store = memoryStore({ isActive: true, productId: "prod_1", keywords: ["narx"] });
  const payload = commentPayload("c-1", "Narxi qancha?");
  const first = await ingestWebhook(payload, ACCOUNT, store, now);
  const second = await ingestWebhook(payload, ACCOUNT, store, now);
  assert.deepEqual(first.queued, ["c-1"]);
  assert.deepEqual(second.queued, [], "second delivery queues nothing");
  assert.equal(second.duplicates, 1);
  assert.equal(store.comments.size, 1);
  assert.equal(store.comments.get("c-1").status, "PENDING");
});

test("ingest: other accounts and our own comments / echoes ignored; DMs logged once; general reply for posts without a product", async () => {
  const store = memoryStore(null);
  const own = commentPayload("c-own", "narx", { from: { id: ACCOUNT.igUserId, username: ACCOUNT.username } });
  assert.deepEqual((await ingestWebhook(own, ACCOUNT, store, now)).queued, []);
  assert.equal(store.comments.size, 0, "own comment not even logged");
  const other = { ...commentPayload("c-x", "narx"), entry: [{ ...commentPayload("c-x", "narx").entry[0], id: "999" }] };
  await ingestWebhook(other, ACCOUNT, store, now);
  assert.equal(store.comments.size, 0, "another account");
  const general = await ingestWebhook(commentPayload("c-2", "narxi?"), ACCOUNT, store, now);
  assert.deepEqual(general.generalReplies, ["c-2"]);
  assert.equal(store.comments.get("c-2").status, "SKIPPED");
  const dm = { object: "instagram", entry: [{ id: ACCOUNT.igUserId, time: 1, messaging: [
    { sender: { id: "9001" }, recipient: { id: ACCOUNT.igUserId }, timestamp: now.getTime(), message: { mid: "m-1", text: "Rahmat, yetkazib berasizmi?" } },
    { sender: { id: ACCOUNT.igUserId }, recipient: { id: "9001" }, timestamp: now.getTime(), message: { mid: "m-2", text: "echo", is_echo: true } },
  ] }] };
  await ingestWebhook(dm, ACCOUNT, store, now);
  await ingestWebhook(dm, ACCOUNT, store, now);
  assert.equal(store.messages.size, 1);
  assert.equal(store.messages.get("m-1").text, "Rahmat, yetkazib berasizmi?");
  assert.deepEqual(rules.parseWebhook({ object: "page", entry: [] }), { comments: [], messages: [] });
  assert.deepEqual(rules.parseWebhook(null), { comments: [], messages: [] });
});

test("wiring: unique comment id, unique lead key, 401 on bad signature, token encrypted, no secrets in code", async () => {
  const schema = await read("../prisma/schema.prisma");
  assert.match(schema, /model InstagramComment \{\s+commentId\s+String\s+@id/);
  assert.match(schema, /submissionKey\s+String\?\s+@unique/);
  const migration = await read("../prisma/migrations/20261015090000_add_instagram_private_replies/migration.sql");
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), /\bDROP\b|DELETE FROM|\bTRUNCATE\b|ALTER COLUMN/i, "additive only");
  const route = await read("../app/api/instagram/webhook/route.ts");
  assert.match(route, /validSignature\(raw, request\.headers\.get\("x-hub-signature-256"\), appConfig\(\)\.appSecret\)\) return NextResponse\.json\(\{ ok: false \}, \{ status: 401 \}\)/);
  assert.match(route, /after\(\(\) => processQueue/);
  const service = await read("../lib/instagram/service.ts");
  assert.match(service, /leadKey\(input\.fromId, input\.product\.id\)/);
  assert.match(service, /encryptPassword\(token\)/);
  for (const file of ["../lib/instagram/service.ts", "../lib/instagram/graph.ts", "../app/api/instagram/oauth/callback/route.ts", "../app/api/instagram/webhook/route.ts"]) {
    const source = await read(file);
    assert.doesNotMatch(source, /console\.\w+\([^\n]*(?:[,{(]\s*(?:\w+\.)?token\s*[,})]|\$\{[^}]*token)/i, `${file}: no token value in logs`);
    assert.doesNotMatch(source, /console\.\w+\([^\n]*(?:url|payload|body)\b\s*[,})]/i, `${file}: no URLs / payloads in logs`);
  }
  const example = await read("../.env.example");
  for (const name of ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_WEBHOOK_VERIFY_TOKEN"]) assert.match(example, new RegExp(`^${name}=\\r?$`, "m"));
});
