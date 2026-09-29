import "server-only";
import { randomBytes } from "node:crypto";
import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { mapProduct, readSpecifications } from "./mapper";
import { decodeCatalogCursor, normalizeCatalogSearch } from "./catalog-utils";
import type { Product } from "./types";
import type { ProductCategoryRecord } from "@/lib/product-categories/types";

export const PUBLIC_CATALOG_PAGE_SIZE = 24;
const orderBy = [{ order: "asc" as const }, { createdAt: "desc" as const }, { id: "asc" as const }];
const cardSelect = {
  id: true, slug: true, name: true, brand: true, model: true, categoryId: true,
  priceUsd: true, images: true, specifications: true, tags: true, availability: true,
  isVisible: true, order: true, updatedAt: true,
  category: { select: { name: true, slug: true } },
} as const;

type CardRow = Awaited<ReturnType<typeof loadPublicProducts>>[number];
type RawCardRow = Omit<CardRow, "category"> & { categoryName: string; categorySlug: string };

function mapProductCard(row: CardRow): Product {
  const stored = readSpecifications(row.specifications);
  const specs = stored.cardSpecs?.length ? stored.cardSpecs : row.tags.length ? row.tags : stored.rows.map(item => item.value).filter(Boolean).slice(0, 2);
  return {
    id: row.id, slug: row.slug, name: row.name, brand: row.brand, model: row.model,
    categoryId: row.categoryId, category: row.category.slug, categoryName: row.category.name,
    priceUsd: row.priceUsd?.toString() ?? null, badge: row.category.name.toLocaleUpperCase("uz-UZ"),
    image: row.images[0] ?? null, specs, availability: row.availability === "AVAILABLE" ? "available" : "order",
    order: row.order, isVisible: row.isVisible, updatedAt: row.updatedAt.toLocaleDateString("uz-UZ"),
  };
}

function mapRawCard(row: RawCardRow) { return mapProductCard({ ...row, category: { name: row.categoryName, slug: row.categorySlug } }); }
export function sanitizeCatalogSeed(value?: string) { return value && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : randomBytes(12).toString("hex"); }

async function loadPublicProducts(limit: number) { return getDb().product.findMany({ where: { isVisible: true, category: { isActive: true } }, select: cardSelect, orderBy, take: limit }); }
const loadCachedPublicProducts = unstable_cache(async (limit: number) => (await loadPublicProducts(limit)).map(mapProductCard), ["public-product-cards-v4"], { revalidate: 300, tags: ["public-products"] });
/** Home/featured consumers only. The full catalog uses getPublicCatalogPage. */
export async function getPublicProducts(limit = 24) { return loadCachedPublicProducts(Math.min(24, Math.max(1, Math.trunc(limit)))); }

function publicCatalogWhere(category: string, query: string) {
  const normalized = normalizeCatalogSearch(query);
  return Prisma.sql`p."isVisible" = true AND c."isActive" = true
    ${category && category !== "all" ? Prisma.sql`AND c.slug = ${category}` : Prisma.empty}
    ${query ? Prisma.sql`AND (lower(coalesce(p.name,'') || ' ' || coalesce(p.brand,'') || ' ' || coalesce(p.model,'') || ' ' || coalesce(p.slug,'')) LIKE lower(${`%${query}%`}) OR regexp_replace(lower(p.name || p.brand || p.model || p.slug), '[^a-z0-9]+', '', 'g') LIKE ${`%${normalized}%`})` : Prisma.empty}`;
}

/**
 * Catalog filter chips: every active category with ≥1 visible product, sorted by count.
 * Uses the same WHERE as the catalog total and is not cached, so the chip counts always add up to the total.
 */
export async function getPublicCatalogCategories(): Promise<ProductCategoryRecord[]> {
  const rows = await getDb().$queryRaw<Array<{ id: string; name: string; slug: string; order: number; count: bigint }>>(Prisma.sql`SELECT c.id, c.name, c.slug, c."order", count(p.id)::bigint AS count FROM "Product" p JOIN "ProductCategory" c ON c.id=p."categoryId" WHERE ${publicCatalogWhere("all", "")} GROUP BY c.id HAVING count(p.id) > 0 ORDER BY count(p.id) DESC, c."order" ASC, c.name ASC`);
  return rows.map(row => ({ id: row.id, name: row.name, slug: row.slug, order: row.order, isActive: true, productCount: Number(row.count) }));
}

export type PublicCatalogPage ={ products: Product[]; total: number; nextCursor: string | null; seed: string };
export async function getPublicCatalogPage(input: { category?: string; q?: string; cursor?: string | null; seed?: string; limit?: number }): Promise<PublicCatalogPage> {
  const category = (input.category || "all").trim().slice(0, 120), q = (input.q || "").trim().slice(0, 120), seed = sanitizeCatalogSeed(input.seed);
  const offset = decodeCatalogCursor(input.cursor), limit = Math.min(PUBLIC_CATALOG_PAGE_SIZE, Math.max(1, Math.trunc(input.limit || PUBLIC_CATALOG_PAGE_SIZE)));
  const where = publicCatalogWhere(category, q), normalized = normalizeCatalogSearch(q);
  const ordering = q ? Prisma.sql`CASE WHEN regexp_replace(lower(p.model), '[^a-z0-9]+', '', 'g') = ${normalized} THEN 0 WHEN regexp_replace(lower(p.model), '[^a-z0-9]+', '', 'g') LIKE ${`${normalized}%`} THEN 1 WHEN lower(p.name) = lower(${q}) THEN 2 WHEN p.model ILIKE ${`%${q}%`} THEN 3 WHEN p.name ILIKE ${`%${q}%`} THEN 4 ELSE 5 END, p."order" ASC, p.id ASC` : Prisma.sql`CASE WHEN cardinality(p.images)>0 THEN 0 ELSE 1 END, md5(p.id || ${seed}) ASC, p.id ASC`;
  const [rows, countRows] = await Promise.all([
    getDb().$queryRaw<RawCardRow[]>(Prisma.sql`SELECT p.id,p.slug,p.name,p.brand,p.model,p."categoryId",p."priceUsd",p.images,p.specifications,p.tags,p.availability,p."isVisible",p."order",p."updatedAt",c.name AS "categoryName",c.slug AS "categorySlug" FROM "Product" p JOIN "ProductCategory" c ON c.id=p."categoryId" WHERE ${where} ORDER BY ${ordering} LIMIT ${limit} OFFSET ${offset}`),
    getDb().$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT count(*)::bigint AS count FROM "Product" p JOIN "ProductCategory" c ON c.id=p."categoryId" WHERE ${where}`),
  ]);
  const total = Number(countRows[0]?.count || 0);
  return { products: rows.map(mapRawCard), total, nextCursor: offset + rows.length < total ? String(offset + rows.length) : null, seed };
}

const loadProductBySlug = unstable_cache(async (slug: string) => { const row = await getDb().product.findFirst({ where: { slug, isVisible: true, category: { isActive: true } }, include: { category: true } }); return row ? mapProduct(row) : null; }, ["public-product-detail-v3"], { revalidate: 300, tags: ["public-products"] });
export async function getProductBySlug(slug: string) { return loadProductBySlug(slug); }
export async function getAdminProducts() { const rows = await getDb().product.findMany({ select: cardSelect, orderBy }); return rows.map(mapProductCard); }
export type AdminCatalogPage = { products: Product[]; total: number; page: number; pageCount: number; summary: { total: number; available: number; order: number; hidden: number } };
export async function getAdminProductsPage(input: { q?: string; category?: string; status?: string; page?: number }): Promise<AdminCatalogPage> {
  const q = (input.q || "").trim().slice(0, 120), normalized = normalizeCatalogSearch(q), category = (input.category || "all").slice(0, 120), status = input.status || "all";
  const page = Math.max(1, Math.trunc(input.page || 1)), limit = 24, offset = (page - 1) * limit;
  const where = Prisma.sql`true ${category !== "all" ? Prisma.sql`AND p."categoryId"=${category}` : Prisma.empty} ${status === "hidden" ? Prisma.sql`AND p."isVisible"=false` : status === "available" ? Prisma.sql`AND p.availability='AVAILABLE' AND p."isVisible"=true` : status === "order" ? Prisma.sql`AND p.availability='ORDER' AND p."isVisible"=true` : Prisma.empty} ${q ? Prisma.sql`AND (lower(coalesce(p.name,'')||' '||coalesce(p.brand,'')||' '||coalesce(p.model,'')||' '||coalesce(p.slug,'')) LIKE lower(${`%${q}%`}) OR regexp_replace(lower(p.name||p.brand||p.model||p.slug),'[^a-z0-9]+','','g') LIKE ${`%${normalized}%`})` : Prisma.empty}`;
  const [rows, countRows, total, available, ordered, hidden] = await Promise.all([
    getDb().$queryRaw<RawCardRow[]>(Prisma.sql`SELECT p.id,p.slug,p.name,p.brand,p.model,p."categoryId",p."priceUsd",p.images,p.specifications,p.tags,p.availability,p."isVisible",p."order",p."updatedAt",c.name AS "categoryName",c.slug AS "categorySlug" FROM "Product" p JOIN "ProductCategory" c ON c.id=p."categoryId" WHERE ${where} ORDER BY p."order",p."updatedAt" DESC,p.id LIMIT ${limit} OFFSET ${offset}`),
    getDb().$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT count(*)::bigint AS count FROM "Product" p WHERE ${where}`),
    getDb().product.count(), getDb().product.count({ where: { availability: "AVAILABLE", isVisible: true } }), getDb().product.count({ where: { availability: "ORDER", isVisible: true } }), getDb().product.count({ where: { isVisible: false } }),
  ]);
  const count = Number(countRows[0]?.count || 0);
  return { products: rows.map(mapRawCard), total: count, page, pageCount: Math.max(1, Math.ceil(count / limit)), summary: { total, available, order: ordered, hidden } };
}
export async function getAdminProductOptions() { return getDb().product.findMany({ select: { id: true, name: true, model: true }, orderBy }); }
export async function getAdminProductById(id: string) { const row = await getDb().product.findUnique({ where: { id }, include: { category: true } }); return row ? mapProduct(row) : null; }

export async function getRelatedProducts(productId: string, category: string) {
  const seed = randomBytes(12).toString("hex");
  const rows = await getDb().$queryRaw<RawCardRow[]>(Prisma.sql`SELECT p.id,p.slug,p.name,p.brand,p.model,p."categoryId",p."priceUsd",p.images,p.specifications,p.tags,p.availability,p."isVisible",p."order",p."updatedAt",c.name AS "categoryName",c.slug AS "categorySlug" FROM "Product" p JOIN "ProductCategory" c ON c.id=p."categoryId" WHERE p."isVisible"=true AND c."isActive"=true AND p.id<>${productId} ORDER BY CASE WHEN c.slug=${category} THEN 0 ELSE 1 END,md5(p.id||${seed}) LIMIT 8`);
  return rows.map(mapRawCard);
}
