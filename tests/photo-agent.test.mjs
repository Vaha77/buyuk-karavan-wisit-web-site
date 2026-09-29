import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("photo agent normalizes model punctuation and only exposes image tools", async () => {
  const source = await readFile(new URL("../lib/ai-office/photo-agent.ts", import.meta.url), "utf8");
  assert.match(source, /replace\(\/\[\^a-z0-9\]\+\/g, ""\)/);
  assert.match(source, /"findProducts", "processPhoto", "buildPhotoPreview"/);
  assert.doesNotMatch(source, /createProduct|updateProduct|priceUsd/);
});

test("photo agent requires explicit signed confirmation and preserves old main image", async () => {
  const route = await readFile(new URL("../app/api/admin/ai-office/photo-agent/confirm/route.ts", import.meta.url), "utf8");
  const mutations = await readFile(new URL("../lib/products/mutations.ts", import.meta.url), "utf8");
  assert.match(route, /verifyPhotoPreview/);
  assert.match(route, /saveApprovedPhotoStudioImageAction/);
  assert.match(mutations, /\[url, \.\.\.previous\.images\]/);
});

test("sitemap does not publish missing projects index", async () => {
  const source = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /`\$\{SITE_URL\}\/projects`/);
  assert.match(source, /\/projects\/\$\{encodeURIComponent/);
});
