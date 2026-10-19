import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
const pwa = await import("../lib/pwa.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("manifest: BK Admin, /admin scope, standalone, 192/512 and maskable icons", () => {
  const manifest = pwa.adminManifest();
  assert.deepEqual([manifest.name, manifest.short_name, manifest.start_url, manifest.scope, manifest.display], ["Buyuk Karavan Admin", "BK Admin", "/admin", "/admin", "standalone"]);
  assert.deepEqual(manifest.icons.map(icon => `${icon.sizes}:${icon.purpose}`), ["192x192:any", "512x512:any", "512x512:maskable"]);
});

test("assetlinks: fingerprints from env, invalid ones dropped, none → empty list", () => {
  const good = Array.from({ length: 32 }, () => "ab").join(":");
  const links = pwa.assetLinks(` ${good} , not-a-fingerprint`);
  assert.equal(links[0].target.package_name, "uz.buyukkaravan.admin");
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, [good.toUpperCase()]);
  assert.deepEqual(pwa.assetLinks(undefined), []);
});

test("only login, register, manifest and service worker skip the session check; the worker caches static files and whole pages only", async () => {
  assert.deepEqual(pwa.PUBLIC_ADMIN_PATHS, ["/admin/login", "/admin/register", "/admin/manifest.webmanifest", "/admin/sw.js"]);
  const worker = await read("../app/admin/sw.js/route.ts");
  assert.match(worker, /\/_next\/static\//);
  assert.match(worker, /service-worker-allowed": "\/admin"/);
  assert.equal((worker.match(/cache\.put/g) ?? []).length, 2, "only static files and whole pages are written");
  assert.match(worker, /request\.mode === "navigate"[\s\S]{0,200}page\(request\)/, "pages only for full navigations (never RSC fetches)");
  assert.match(worker, /request\.method !== "GET"/, "POST is never cached");
  assert.match(worker, /\/admin\/login"\)\) event\.waitUntil\(caches\.delete\(PAGES\)\)/, "signing out clears the page copies");
  assert.ok(!worker.includes("/api/"), "API is never cached");
  assert.match(await read("../proxy.ts"), /PUBLIC_ADMIN_PATHS\.includes/);
});
