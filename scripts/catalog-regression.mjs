import "dotenv/config";
import assert from "node:assert/strict";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const categories = await client.query(`SELECT c.name, count(*)::int AS count FROM "ProductCategory" c JOIN "Product" p ON p."categoryId" = c.id WHERE c."isActive" = true AND p."isVisible" = true AND c.name IN ('Kompressor XUEYING', 'DD/DJ UCS') GROUP BY c.name`);
  const counts = Object.fromEntries(categories.rows.map(row => [row.name, row.count]));
  assert.ok(Number.isInteger(counts["Kompressor XUEYING"]));
  assert.ok(Number.isInteger(counts["DD/DJ UCS"]));

  const search = await client.query(`SELECT p.id FROM "Product" p JOIN "ProductCategory" c ON c.id = p."categoryId" WHERE p."isVisible" = true AND c."isActive" = true AND regexp_replace(lower(p.model), '[^a-z0-9]+', '', 'g') LIKE '%br8pz%'`);
  assert.ok(search.rowCount && search.rowCount > 0, "BR -8PZ must be searchable as br8pz");

  const seed = "catalog-regression-seed";
  const page1 = await client.query(`SELECT p.id FROM "Product" p JOIN "ProductCategory" c ON c.id = p."categoryId" WHERE p."isVisible" = true AND c."isActive" = true ORDER BY md5(p.id || $1), p.id LIMIT 24 OFFSET 0`, [seed]);
  const page2 = await client.query(`SELECT p.id FROM "Product" p JOIN "ProductCategory" c ON c.id = p."categoryId" WHERE p."isVisible" = true AND c."isActive" = true ORDER BY md5(p.id || $1), p.id LIMIT 24 OFFSET 24`, [seed]);
  assert.equal(new Set([...page1.rows, ...page2.rows].map(row => row.id)).size, page1.rowCount + page2.rowCount);
  const total = await client.query(`SELECT count(*)::int AS count FROM "Product" p JOIN "ProductCategory" c ON c.id = p."categoryId" WHERE p."isVisible" = true AND c."isActive" = true`);
  const duplicates = await client.query(`SELECT c.name, regexp_replace(lower(p.model), '[^a-z0-9]+', '', 'g') AS model, count(*)::int AS count FROM "Product" p JOIN "ProductCategory" c ON c.id=p."categoryId" WHERE p."isVisible"=true AND c."isActive"=true GROUP BY c.name, regexp_replace(lower(p.model), '[^a-z0-9]+', '', 'g') HAVING count(*) > 1`);
  assert.equal(duplicates.rowCount, 0, "Visible catalog must not contain normalized model duplicates in one category");
  console.log(JSON.stringify({ categoryCounts: counts, normalizedSearchMatches: search.rowCount, firstTwoPages: page1.rowCount + page2.rowCount, total: total.rows[0].count }));
} finally {
  await client.end();
}
