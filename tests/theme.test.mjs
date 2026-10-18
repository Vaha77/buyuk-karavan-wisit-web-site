import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const { contrast, darkOf, PALETTE } = await import("../scripts/theme-dark.mjs");

test("dark palette: text ≥ 4.5:1 on cards and page, no pure black or white, every variable keeps its light color", async () => {
  const globals = await read("../app/globals.css");
  const block = globals.slice(globals.indexOf("/* theme:dark:start"), globals.indexOf("/* theme:dark:end */"));
  const vars = [...block.matchAll(/--k-(fg|bg|bd|on)-([0-9a-f]{6}):(#[0-9A-F]{6})/g)];
  assert.ok(vars.length > 300, "dark values written");
  for (const [, role, , value] of vars) {
    assert.ok(!["#000000", "#FFFFFF"].includes(value), `${role}: no pure black/white`);
    if (role === "fg") for (const surface of [PALETTE.card, PALETTE.bg]) assert.ok(contrast(value, surface) >= 4.5, `${value} on ${surface}: ${contrast(value, surface).toFixed(2)}`);
  }
  assert.ok(contrast(PALETTE.text, PALETTE.card) >= 4.5 && contrast(PALETTE.muted, PALETTE.card) >= 4.5);
  assert.equal(darkOf("#FFFFFF", "bg"), PALETTE.card); assert.equal(darkOf("#0F1E33", "fg"), PALETTE.text); assert.equal(darkOf("#FFFFFF", "fg"), null, "white text on brand colors stays");
  assert.match(block, /color-scheme:dark/, "native selects, inputs and scrollbars follow");
  // Light mode is untouched: every rewritten color is a var() with the original as fallback.
  assert.match(await read("../components/admin/bklead/bklead.css"), /--bk-card:var\(--k-bg-ffffff, #FFFFFF\)/);
});

test("theme switch: set in <head> before paint (saved choice, else device setting), toggle in admin, login and site header", async () => {
  const toggle = await read("../components/theme-toggle.tsx");
  assert.match(toggle, /localStorage\.getItem\("\$\{THEME_KEY\}"\)/);
  assert.match(toggle, /prefers-color-scheme: dark/);
  assert.match(toggle, /aria-label="Rejimni almashtirish"/);
  assert.match(await read("../app/layout.tsx"), /<head><script dangerouslySetInnerHTML=\{\{ __html: THEME_SCRIPT \}\}\/><\/head>/);
  for (const path of ["../components/admin/admin-shell.tsx", "../app/admin/login/page.tsx", "../components/home/navigation.tsx"]) assert.match(await read(path), /<ThemeToggle/, path);
  const globals = await read("../app/globals.css");
  assert.match(globals, /transition:transform \.4s/);
  assert.match(globals, /@media\(prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after\{animation-duration:\.01ms!important/);
  assert.match(await read("../app/admin/layout.tsx"), /prefers-color-scheme: dark\)", color: "#141A24"/);
});
