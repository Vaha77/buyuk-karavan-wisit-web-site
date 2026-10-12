import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("admin on phones: every table hidden at ≤650px has cards, or scrolls instead of disappearing", async () => {
  const css = await read("../components/admin/admin.css");
  assert.match(css, /\.admin-table-wrap\{display:none\}/, "the desktop table is still hidden on phones");
  assert.match(css, /\.admin-mobile-cards\{display:none\}/, "cards stay off on desktop");
  assert.match(css, /@media\(max-width:650px\)\{\n\.admin-table-wrap\.is-scroll\{display:block;overflow-x:auto/);
  assert.match(css, /\.admin-mobile-cards\{display:grid/);
  assert.match(css, /@media\(max-width:650px\)\{\.admin-shell\{width:auto\}\}/, "no 24px sideways overflow");
  const pages = {
    "../components/admin/admin-sales-agents.tsx": "cards",
    "../components/admin/sales-board.tsx": "cards",
    "../components/admin/rewards-board.tsx": "cards",
    "../components/admin/admin-projects.tsx": "cards",
    "../components/admin/backups-board.tsx": "scroll",
    "../components/admin/admin-products.tsx": "admin-mobile-products",
    "../app/admin/(protected)/calculations/page.tsx": "calculation-mobile-list",
  };
  for (const [path, mode] of Object.entries(pages)) {
    const source = await read(path);
    if (!source.includes("admin-table-wrap")) continue;
    if (mode === "cards") assert.match(source, /className="admin-mobile-cards"/, `${path}: cards on phones`);
    else if (mode === "scroll") assert.match(source, /admin-table-wrap is-scroll/, `${path}: scrolls on phones`);
    else assert.match(source, new RegExp(mode), `${path}: own mobile list`);
  }
  const agents = await read("../components/admin/admin-sales-agents.tsx");
  const cards = agents.slice(agents.indexOf('className="admin-mobile-cards"'));
  for (const needle of ["agent.name", "agent.username", "agent.createdAt", "Kutilmoqda", "status(agent)", "agent.sales", "agent.overdue", "agent.marja", "marjaForm(agent)", "actions(agent)"]) assert.ok(cards.includes(needle), `seller card shows ${needle}`);
});

test("no other admin page hides a table on phones without an alternative", async () => {
  const { readdir } = await import("node:fs/promises");
  const walk = async dir => (await Promise.all((await readdir(new URL(dir, import.meta.url), { withFileTypes: true })).map(entry => entry.isDirectory() ? walk(`${dir}${entry.name}/`) : [`${dir}${entry.name}`]))).flat();
  const files = [...await walk("../app/admin/(protected)/"), ...await walk("../components/admin/")].filter(file => file.endsWith(".tsx"));
  const known = new Set(["admin-sales-agents.tsx", "sales-board.tsx", "rewards-board.tsx", "admin-projects.tsx", "backups-board.tsx", "admin-products.tsx", "page.tsx"]);
  for (const file of files) {
    const source = await read(file);
    if (!/className="admin-table-wrap"/.test(source)) continue;
    const name = file.split("/").pop();
    assert.ok(known.has(name) && (name !== "page.tsx" || /calculation-mobile-list/.test(source)), `${file} hides its table on phones without cards`);
  }
});
