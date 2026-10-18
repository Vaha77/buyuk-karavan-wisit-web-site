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

test("seller pages on phones: order and purchase tables become cards; every other table scrolls inside its wrapper", async () => {
  const css = await read("../components/admin/admin.css");
  assert.match(css, /\.admin-mobile-cards\{display:grid[^}]*\}\n\.has-mobile-cards\{display:none!important\}/, "≤650px: table hidden, cards shown");
  const orders = await read("../components/admin/sex/orders-board.tsx");
  assert.match(orders, /sx-table-wrap\$\{seller \? " has-mobile-cards" : ""\}/);
  const card = orders.slice(orders.indexOf('{seller && <ul className="admin-mobile-cards">'));
  for (const needle of ["row.number", "row.day", "row.kind", "row.product", "row.note", "PriceLine", "step.label", "statusCell(row)", "actions(row)"]) assert.ok(card.includes(needle), `order card shows ${needle}`);
  const purchases = await read("../app/admin/(seller)/my/purchase/page.tsx");
  assert.match(purchases, /bk-table-wrap has-mobile-cards/);
  const purchaseCard = purchases.slice(purchases.indexOf('<ul className="admin-mobile-cards">'));
  for (const needle of ["row.customer.name", "row.amountUsd", "row.date", "row.regionCode", "PURCHASE_STATUS[row.status]"]) assert.ok(purchaseCard.includes(needle), `purchase card shows ${needle}`);
  // No page-wide sideways scroll at 375px: wide tables only live in wrappers that scroll on their own.
  assert.match(await read("../components/admin/bklead/bklead.css"), /\.bk-table-wrap\{overflow-x:auto/);
  assert.match(await read("../components/admin/sex/sex.css"), /\.sx-table-wrap\{overflow-x:auto;min-width:0\}/);
  for (const path of ["../app/admin/(seller)/my/purchase/page.tsx", "../components/admin/sex/orders-board.tsx", "../components/admin/sex/prays-board.tsx", "../components/admin/bklead/customer-forms.tsx", "../components/admin/bklead/customer-ranking.tsx", "../components/admin/bklead/customer-regions.tsx", "../components/admin/bklead/links-table.tsx", "../components/admin/bklead/sales-plan-client.tsx", "../components/admin/bklead/sales-plan-people.tsx", "../components/admin/bklead/workshop-section.tsx"]) {
    const source = await read(path);
    const tables = source.split("<table").length - 1;
    assert.ok(tables <= (source.match(/(bk|sx|admin)-table-wrap/g) ?? []).length, `${path}: every table sits in a scrolling wrapper`);
  }
});

test("phones: every admin table becomes cards — cells get their column header (colspan aware), page never wider than the screen", async () => {
  const { register } = await import("node:module");
  register("./ts-resolve.mjs", import.meta.url);
  const { labelTables } = await import("../components/admin/table-cards.ts");
  const el = (text = "", attrs = {}) => ({ textContent: text, attrs: { ...attrs }, getAttribute(name) { return this.attrs[name] ?? null; }, hasAttribute(name) { return name in this.attrs; }, setAttribute(name, value) { this.attrs[name] = value; } });
  const cells = [el("Ali"), el("2", { colspan: "2" }), el("$5")], header = [el("Ism"), el("Soni", { colspan: "2" }), el("Summa")];
  const classes = new Set();
  const table = { classList: { add: name => classes.add(name) }, querySelectorAll: selector => selector.startsWith("thead") ? header : [{ children: cells }] };
  labelTables({ querySelectorAll: () => [table] });
  assert.deepEqual(cells.map(cell => cell.attrs["data-label"]), ["Ism", "Soni", "Summa"]);
  assert.ok(classes.has("is-cards"));
  const css = await read("../components/admin/admin.css");
  assert.match(css, /table\.is-cards thead\{display:none\}/);
  assert.match(css, /table\.is-cards td::before\{content:attr\(data-label\)/);
  assert.match(await read("../components/admin/admin-shell.tsx"), /new MutationObserver\(run\)/);
  assert.match(await read("../components/admin/bklead/bklead.css"), /\.bk\{[^}]*grid-template-columns:minmax\(0,1fr\)/, "the .bk grid column never takes a wide table's width");
});
