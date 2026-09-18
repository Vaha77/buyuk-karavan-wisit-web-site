import 'dotenv/config';
import pg from 'pg';
import { products } from '../data/products.ts';

const { Client } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
const url = new URL(process.env.DATABASE_URL);
url.hostname = url.hostname.replace('-pooler', '');
const client = new Client({ connectionString: url.toString() });

function localImages(product) {
  return [...new Set([product.image, ...(product.images ?? [])].filter(value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')))];
}

async function seed() {
  await client.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;
    for (const product of products) {
      const specifications = {
        rows: product.specifications ?? product.specs.map((value, index) => ({ id: `spec-${index}`, name: 'Xususiyat', value })),
        cardSpecs: product.specs,
        descriptionBullets: product.descriptionBullets ?? [],
        applications: product.applications ?? [],
      };
      const result = await client.query(`
        INSERT INTO "Product" (id,name,brand,model,slug,category,"shortDescription",description,images,specifications,tags,availability,"isVisible","order","seoTitle","seoDescription","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::"ProductAvailability",$13,$14,$15,$16,now(),now())
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [product.id, product.name, product.brand, product.model, product.slug, product.category,
        product.shortDescription ?? null, product.description ?? null, localImages(product),
        JSON.stringify(specifications), product.tags ?? product.specs,
        product.availability === 'available' ? 'AVAILABLE' : 'ORDER', product.isVisible, product.order,
        product.seoTitle ?? null, product.seoDescription ?? null]);
      inserted += result.rowCount;
    }
    await client.query('COMMIT');
    console.log(`Product seed complete: ${inserted} inserted, ${products.length - inserted} already present or conflicting.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch(() => { console.error('Product seed failed.'); process.exitCode = 1; });
