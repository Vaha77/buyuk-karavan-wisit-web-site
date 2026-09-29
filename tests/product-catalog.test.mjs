import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decodeCatalogCursor, normalizeCatalogSearch } from "../lib/products/catalog-utils.ts";

test("model search ignores spaces and punctuation", () => {
  assert.equal(normalizeCatalogSearch("BR -8PZ"), "br8pz");
  assert.equal(normalizeCatalogSearch("br8pz"), "br8pz");
  assert.equal(normalizeCatalogSearch("BR+8PZ"), "br8pz");
});

test("catalog cursors accept safe offsets only", () => {
  assert.equal(decodeCatalogCursor("24"), 24);
  assert.equal(decodeCatalogCursor("-1"), 0);
  assert.equal(decodeCatalogCursor("bad"), 0);
});

test("public catalog uses database filtering, count and seeded ordering", async () => {
  const source = await readFile(new URL("../lib/products/queries.ts", import.meta.url), "utf8");
  assert.match(source, /count\(\*\)::bigint/);
  assert.match(source, /md5\(p\.id \|\| \$\{seed\}\)/);
  assert.match(source, /LIMIT \$\{limit\} OFFSET \$\{offset\}/);
  assert.match(source, /regexp_replace\(lower\(p\.model\)/);
});

test("API and client retain seed and prevent duplicate cards", async () => {
  const api = await readFile(new URL("../app/api/products/route.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../components/products/products-catalog.tsx", import.meta.url), "utf8");
  assert.match(api, /getPublicCatalogPage/);
  assert.match(client, /seed: initial\.seed/);
  assert.match(client, /!current\.some\(existing => existing\.id === item\.id\)/);
});
