import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const d = await import("../lib/instagram/deletion-rules.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");
const b64url = value => Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sign = (payload, secret) => { const body = b64url(JSON.stringify(payload)); return `${b64url(createHmac("sha256", secret).update(body).digest())}.${body}`; };

test("signed_request: Meta's HMAC-SHA256 signature with the app secret; anything else is refused", () => {
  const payload = { algorithm: "HMAC-SHA256", user_id: "17841400000000001", issued_at: 1_791_000_000, expires: 0 };
  const parsed = d.parseSignedRequest(sign(payload, "app-secret"), "app-secret");
  assert.equal(parsed.userId, "17841400000000001");
  assert.equal(d.parseSignedRequest(sign({ ...payload, user_id: 1234 }, "s"), "s").userId, "1234", "numeric ids too");
  assert.equal(d.parseSignedRequest(sign(payload, "other-secret"), "app-secret"), null, "wrong secret");
  assert.equal(d.parseSignedRequest(sign({ ...payload, algorithm: "none" }, "app-secret"), "app-secret"), null);
  assert.equal(d.parseSignedRequest(sign({ algorithm: "HMAC-SHA256" }, "app-secret"), "app-secret"), null, "no user_id");
  assert.equal(d.parseSignedRequest(sign({ ...payload, user_id: "1 OR 1=1" }, "app-secret"), "app-secret"), null);
  const [sig, body] = sign(payload, "app-secret").split(".");
  assert.equal(d.parseSignedRequest(`${sig}.${b64url(JSON.stringify({ ...payload, user_id: "999" }))}`, "app-secret"), null, "tampered payload");
  assert.equal(d.parseSignedRequest(`${sig}.${body}.x`, "app-secret"), null);
  assert.equal(d.parseSignedRequest(sign(payload, "app-secret"), null), null, "no secret configured");
  assert.equal(d.parseSignedRequest("", "app-secret"), null);
  assert.equal(d.parseSignedRequest("garbage", "app-secret"), null);
});

test("confirmation code, status url and the stored user hash", () => {
  const codes = new Set(Array.from({ length: 200 }, () => d.confirmationCode()));
  assert.equal(codes.size, 200);
  for (const code of codes) assert.ok(d.isConfirmationCode(code), code);
  assert.equal(d.isConfirmationCode("abc"), false);
  assert.equal(d.isConfirmationCode("O0I1O0I1O0I1"), false, "no look-alike characters");
  assert.equal(d.deletionStatusUrl("https://buyukkaravan.com", "ABCDEFGH2345"), "https://buyukkaravan.com/data-deletion?code=ABCDEFGH2345");
  assert.match(d.userHash("178"), /^[0-9a-f]{64}$/);
  assert.notEqual(d.userHash("178"), d.userHash("179"));
  assert.equal(d.ANONYMISED_LEAD.phone, null);
  assert.deepEqual(d.ANONYMISED_LEAD.chatHistory, []);
});

test("wiring: callback route, status page, footer / sitemap / robots, additive migration", async () => {
  const route = await read("../app/api/instagram/data-deletion/route.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /signed_request/);
  assert.match(route, /confirmation_code/);
  assert.doesNotMatch(route, /console\.\w+\([^\n]*(secret|signed)/i, "no secrets in logs");
  const service = await read("../lib/instagram/data-deletion.ts");
  assert.match(service, /instagramComment\.deleteMany/);
  assert.match(service, /instagramMessage\.deleteMany/);
  assert.match(service, /lead\.updateMany/, "leads are anonymised, not deleted");
  assert.doesNotMatch(service, /lead\.delete/);
  const page = await read("../app/data-deletion/page.tsx");
  assert.match(page, /30 kun/);
  assert.match(page, /Приложения и сайты/);
  for (const path of ["../app/privacy/page.tsx", "../app/data-deletion/page.tsx"]) {
    const text = await read(path);
    assert.match(text, /\?lang=ru/, "Russian version");
  }
  const privacy = await read("../app/privacy/page.tsx");
  assert.match(privacy, /uchinchi shaxslarga sotilmaydi/);
  const legal = await read("../components/legal/legal-page.tsx");
  assert.match(legal, /Buyuk Karavan MChJ/);
  assert.match(legal, /\+998916377777/);
  assert.match(legal, /Namangan/);
  const footer = await read("../components/home/home-page.tsx");
  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/data-deletion"/);
  const sitemap = await read("../app/sitemap.ts");
  assert.match(sitemap, /\/privacy`/);
  assert.match(sitemap, /\/data-deletion`/);
  const robots = await read("../app/robots.ts");
  assert.match(robots, /"\/privacy"/);
  assert.doesNotMatch(robots, /disallow: \[[^\]]*(privacy|data-deletion)/);
  const migration = await read("../prisma/migrations/20261019090000_add_instagram_data_deletion/migration.sql");
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), /\bDROP\b|DELETE FROM|\bTRUNCATE\b|ALTER COLUMN/i);
});
