import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const { handleWebhookPost } = await import("../lib/instagram/webhook-handler.ts");
const SECRET = "app-secret";
const body = Buffer.from(JSON.stringify({ object: "instagram", entry: [] }));
const signature = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

test("webhook answers 200 at once; the slow work (8–25 s pauses) runs after the response", async () => {
  const scheduled = [];
  let backgroundDone = false;
  const deps = {
    appSecret: SECRET,
    ingest: async () => ({ queued: ["c-1"] }),
    // The real background part paces replies 8–25 s apart; here: 90 s.
    background: () => new Promise(resolve => { const timer = setTimeout(() => { backgroundDone = true; resolve(); }, 90_000); scheduled.push(timer); }),
    schedule: task => { scheduled.push(task); },
  };
  const started = performance.now();
  const response = await handleWebhookPost(body, signature, deps);
  const elapsed = performance.now() - started;
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
  assert.ok(elapsed < 1_000, `answered in ${Math.round(elapsed)} ms`);
  assert.equal(scheduled.length, 1, "background work handed to after()");
  assert.equal(backgroundDone, false, "not awaited");
  // Start it like after() would, prove it does not block, then stop the timer.
  const run = scheduled[0]();
  assert.equal(backgroundDone, false);
  clearTimeout(scheduled[1]);
  void run;
});

test("webhook: bad signature 401 (nothing ingested), bad JSON 400, DB error 500 (Meta retries), no account → nothing scheduled", async () => {
  let ingested = 0;
  const base = { appSecret: SECRET, ingest: async () => { ingested++; return null; }, background: async () => undefined, schedule: () => assert.fail("must not schedule") };
  assert.equal((await handleWebhookPost(body, "sha256=" + "0".repeat(64), base)).status, 401);
  assert.equal((await handleWebhookPost(body, null, base)).status, 401);
  assert.equal(ingested, 0);
  const bad = Buffer.from("{nope");
  assert.equal((await handleWebhookPost(bad, `sha256=${createHmac("sha256", SECRET).update(bad).digest("hex")}`, base)).status, 400);
  assert.equal((await handleWebhookPost(body, signature, base)).status, 200, "no connected account: 200, nothing to do");
  const failing = { ...base, ingest: async () => { throw new Error("db down"); }, log: () => undefined };
  assert.equal((await handleWebhookPost(body, signature, failing)).status, 500);
  assert.equal((await handleWebhookPost(Buffer.alloc(1_000_001), signature, base)).status, 413);
});

test("the route wires the handler to next/server after()", async () => {
  const route = await readFile(new URL("../app/api/instagram/webhook/route.ts", import.meta.url), "utf8");
  assert.match(route, /handleWebhookPost\(raw, request\.headers\.get\("x-hub-signature-256"\), \{ appSecret: appConfig\(\)\.appSecret, ingest: ingestNotification, background: afterNotification, schedule: after/);
  assert.match(route, /export const maxDuration = 300;/);
});
