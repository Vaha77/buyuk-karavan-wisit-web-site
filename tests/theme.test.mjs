import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Aurora: one dark token set on :root, no light/dark switch left", async () => {
  const globals = await read("../app/globals.css");
  for (const token of ["--bg:#07070d", "--card:rgba(255,255,255,.045)", "--card2:rgba(255,255,255,.07)", "--line:rgba(255,255,255,.09)", "--ink:#f4f5fb", "--muted:#8b90a6", "--v:#7c5cff", "--c:#22d3ee", "--g:linear-gradient(100deg,#7c5cff,#22d3ee)", "--ok:#34d399", "--red:#fb7185", "--gold:#ecc96b", "--r-card:22px", "--r-btn:13px"]) assert.ok(globals.includes(token), token);
  assert.doesNotMatch(globals, /data-theme|theme:dark:start|--k-(fg|bg|bd|on)-/);
  assert.ok(!existsSync(new URL("../components/theme-toggle.tsx", import.meta.url)));
});

test("Aurora: Plus Jakarta Sans via next/font is the only web font", async () => {
  const layout = await read("../app/layout.tsx");
  assert.match(layout, /Plus_Jakarta_Sans\(\{[^}]*weight: \["400", "500", "600", "700", "800"\]/);
  for (const path of ["../app/layout.tsx", "../app/admin/layout.tsx"]) assert.doesNotMatch(await read(path), /Space_Grotesk|IBM_Plex|Inter\b/, path);
});

test("Aurora: blur only on nav-type surfaces, motion off for reduced-motion users", async () => {
  const globals = await read("../app/globals.css");
  assert.match(globals, /\.glass\{background:var\(--card\);border:1px solid var\(--line\);border-radius:var\(--r-card\)\}/, "list cards have no backdrop-filter");
  assert.match(globals, /@media\(prefers-reduced-motion:reduce\)\{\.aurora i,\.btn-g:after,\.fab:before\{animation:none\}\.rv\{opacity:1;transform:none\}/);
  const reveal = await read("../components/ui/reveal.tsx");
  assert.equal(reveal.match(/new IntersectionObserver/g)?.length, 1, "one observer for the whole site");
  assert.match(reveal, /prefers-reduced-motion: reduce/);
});
