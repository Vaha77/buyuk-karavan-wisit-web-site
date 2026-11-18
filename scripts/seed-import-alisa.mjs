// Import buyurtma: loads a factory catalog (JSON + images zip) into ImportCategory/Agent/Catalog/Product. Idempotent:
// products are upserted by code; price, MOQ and "active" set in the admin are never overwritten; images go to fixed keys.
//   node scripts/seed-import-alisa.mjs --dry-run
//   node scripts/seed-import-alisa.mjs --json <file.json> --zip <rasmlar.zip> --catalog CK --title "Cookunique 2025" \
//     --agent ALISA --country Xitoy --currency USD --category "Fast food/ALISA" [--no-images] [--dry-run]
// DB: .env.local (Neon branch) wins over .env; an exported DATABASE_URL wins over both. The target host is printed first.
import dotenv from "dotenv";
import pg from "pg";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback; };
const opts = {
  json: arg("json", "scripts/data/alisa_tovarlar.json"), zip: arg("zip", "Claude outputs/alisa_rasmlar.zip"),
  catalog: arg("catalog", "CK"), title: arg("title", "Cookunique 2025"), agent: arg("agent", "ALISA"), country: arg("country", "Xitoy"),
  currency: arg("currency", "USD"), category: arg("category", "Fast food/ALISA").split("/").map(s => s.trim()).filter(Boolean),
  dryRun: flag("dry-run"), images: !flag("no-images"),
};

/** JSON rows → product records; a repeated code (same model twice in the catalog with different specs) gets "-2", "-3". */
export function normalize(rows) {
  const seen = new Map();
  return rows.map(row => {
    const n = (seen.get(row.kod) ?? 0) + 1; seen.set(row.kod, n);
    return {
      code: n === 1 ? row.kod : `${row.kod}-${n}`, groupEn: row.category_en ?? "", nameEn: row.name_en ?? "", nameUz: row.name_uz ?? "", model: row.model ?? "",
      type: ["elektr", "gaz"].includes(row.type) ? row.type : "boshqa", specs: Array.isArray(row.specs) ? row.specs : [], catPage: row.cat_page ? String(row.cat_page).slice(0, 10) : null,
      flag: row.flag || null, image: row.rasm || null,
    };
  });
}

function storage() {
  const { AWS_ENDPOINT_URL_S3: endpoint, NEON_STORAGE_BUCKET: bucket, AWS_REGION: region, AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
  if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey) throw new Error("Storage env is missing (use --no-images to skip images).");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".neon.tech")) throw new Error("Invalid storage endpoint");
  return { base: `${url.origin}/${bucket}`, bucket, client: new S3Client({ endpoint: url.origin, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } }) };
}

/** Uploads each image once to import/<agent>-<catalog>/<file>; an existing key is reused. Returns code → URL. */
async function uploadImages(products, dir) {
  const s3 = storage(), urls = new Map(), prefix = `import/${opts.agent}-${opts.catalog}`.replace(/[^A-Za-z0-9/_-]/g, "_");
  let uploaded = 0, reused = 0;
  const todo = products.filter(p => p.image && existsSync(join(dir, p.image)));
  for (let i = 0; i < todo.length; i += 8) await Promise.all(todo.slice(i, i + 8).map(async p => {
    const key = `${prefix}/${p.image.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    const exists = await s3.client.send(new HeadObjectCommand({ Bucket: s3.bucket, Key: key })).then(() => true, () => false);
    if (exists) reused++;
    else {
      const body = readFileSync(join(dir, p.image));
      const type = /\.png$/i.test(p.image) ? "image/png" : /\.webp$/i.test(p.image) ? "image/webp" : "image/jpeg";
      await s3.client.send(new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: body, ContentLength: body.byteLength, ContentType: type, CacheControl: "public, max-age=31536000, immutable" }));
      uploaded++;
    }
    urls.set(p.code, `${s3.base}/${key}`);
  }));
  console.log(`Rasmlar: ${uploaded} yuklandi, ${reused} oldin bor edi.`);
  return urls;
}

async function main() {
  const products = normalize(JSON.parse(readFileSync(opts.json, "utf8")));
  const dir = mkdtempSync(join(tmpdir(), "import-img-"));
  try {
    if (existsSync(opts.zip)) {
      // bsdtar (Windows System32, macOS) reads zip; GNU tar does not, so Linux uses unzip.
      const win = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
      if (process.platform === "win32") execFileSync(win, ["-xf", opts.zip, "-C", dir]);
      else try { execFileSync("unzip", ["-q", "-o", opts.zip, "-d", dir]); } catch { execFileSync("tar", ["-xf", opts.zip, "-C", dir]); }
    }
    const files = new Set(readdirSync(dir));
    const withImage = products.filter(p => p.image && files.has(p.image)).length;
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
    const url = new URL(process.env.DATABASE_URL);
    url.hostname = url.hostname.replace("-pooler", "");
    console.log(`DB: ${url.hostname.split(".")[0]} · katalog ${opts.agent}/${opts.catalog} "${opts.title}" · ${products.length} tovar, ${new Set(products.map(p => p.code)).size} noyob kod, rasm ${withImage} (zip'da ${files.size})`);
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    try {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM "ImportProduct" WHERE code = ANY($1)`, [products.map(p => p.code)]);
      console.log(`Bazada bor: ${rows[0].n} · yangi qo‘shiladi: ${products.length - rows[0].n}`);
      if (opts.dryRun) { console.log("--dry-run: hech narsa yozilmadi."); return; }
      const urls = opts.images ? await uploadImages(products, dir) : new Map();
      await client.query("BEGIN");
      let parentId = null;
      for (const [sort, name] of opts.category.entries()) {
        const found = await client.query(`SELECT id FROM "ImportCategory" WHERE "nameUz" = $1 AND "parentId" IS NOT DISTINCT FROM $2 LIMIT 1`, [name, parentId]);
        parentId = found.rows[0]?.id ?? (await client.query(`INSERT INTO "ImportCategory" (id, "nameUz", "parentId", sort) VALUES ($1, $2, $3, $4) RETURNING id`, [randomUUID(), name, parentId, sort])).rows[0].id;
      }
      const agentId = (await client.query(`INSERT INTO "ImportAgent" (id, name, country, currency) VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) DO UPDATE SET country = EXCLUDED.country, currency = EXCLUDED.currency RETURNING id`, [randomUUID(), opts.agent, opts.country, opts.currency])).rows[0].id;
      const catalogId = (await client.query(`INSERT INTO "ImportCatalog" (id, "agentId", "categoryId", title, code, "sourceFile") VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT ("agentId", code) DO UPDATE SET "categoryId" = EXCLUDED."categoryId", title = EXCLUDED.title, "sourceFile" = EXCLUDED."sourceFile" RETURNING id`,
        [randomUUID(), agentId, parentId, opts.title, opts.catalog, opts.json.split(/[\\/]/).pop()])).rows[0].id;
      let inserted = 0; const foreign = [];
      for (const p of products) {
        const result = await client.query(`INSERT INTO "ImportProduct" (id, code, "catalogId", "groupEn", "nameEn", "nameUz", model, type, specs, "imageUrl", "catPage", flag, "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, now())
          ON CONFLICT (code) DO UPDATE SET "catalogId" = EXCLUDED."catalogId", "groupEn" = EXCLUDED."groupEn", "nameEn" = EXCLUDED."nameEn", "nameUz" = EXCLUDED."nameUz",
            model = EXCLUDED.model, type = EXCLUDED.type, specs = EXCLUDED.specs, "imageUrl" = COALESCE(EXCLUDED."imageUrl", "ImportProduct"."imageUrl"),
            "catPage" = EXCLUDED."catPage", flag = EXCLUDED.flag, "updatedAt" = now()
          WHERE "ImportProduct"."catalogId" = EXCLUDED."catalogId"
          RETURNING (xmax = 0) AS inserted`,
          [randomUUID(), p.code, catalogId, p.groupEn, p.nameEn, p.nameUz, p.model, p.type, JSON.stringify(p.specs), urls.get(p.code) ?? null, p.catPage, p.flag]);
        if (!result.rowCount) foreign.push(p.code); // same code already in another catalog: left as is
        else if (result.rows[0].inserted) inserted++;
      }
      await client.query("COMMIT");
      const total = (await client.query(`SELECT count(*)::int AS n FROM "ImportProduct" WHERE "catalogId" = $1`, [catalogId])).rows[0].n;
      console.log(`Tayyor: ${inserted} qo‘shildi, ${products.length - inserted - foreign.length} yangilandi · katalogda jami ${total}.`);
      if (foreign.length) console.warn(`Boshqa katalogda bor, o‘tkazib yuborildi (${foreign.length}): ${foreign.slice(0, 10).join(", ")}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { await client.end(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1]?.endsWith("seed-import-alisa.mjs")) main().catch(error => { console.error("Import seed failed:", error.message); process.exitCode = 1; });
