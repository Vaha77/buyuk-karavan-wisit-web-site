import "server-only";
import { unstable_cache } from "next/cache";
import { getDb } from "@/lib/db";
import { mapProduct, readSpecifications } from "./mapper";
import type { Product } from "./types";

const orderBy = [{ order: "asc" as const }, { createdAt: "desc" as const }, { id: "asc" as const }];
const cardSelect = {
  id: true, slug: true, name: true, brand: true, model: true, categoryId: true,
  priceUsd: true, images: true, specifications: true, tags: true, availability: true,
  isVisible: true, order: true, updatedAt: true,
  category: { select: { name: true, slug: true } },
} as const;

type CardRow = Awaited<ReturnType<typeof loadPublicProducts>>[number];

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

async function loadPublicProducts(limit: number) {
  return getDb().product.findMany({ where: { isVisible: true, category: { isActive: true } }, select: cardSelect, orderBy, take: limit });
}
const loadCachedPublicProducts = unstable_cache(async (limit: number) => (await loadPublicProducts(limit)).map(mapProductCard), ["public-product-cards-v3"], { revalidate: 300, tags: ["public-products"] });

export async function getPublicProducts(limit = 24) {
  const safeLimit = Math.min(24, Math.max(1, Math.trunc(limit)));
  return loadCachedPublicProducts(safeLimit);
}

const loadProductBySlug = unstable_cache(async (slug: string) => {
  const row = await getDb().product.findFirst({ where: { slug, isVisible: true, category: { isActive: true } }, include: { category: true } });
  return row ? mapProduct(row) : null;
}, ["public-product-detail-v3"], { revalidate: 300, tags: ["public-products"] });

export async function getProductBySlug(slug: string) {
  return loadProductBySlug(slug);
}

export async function getAdminProducts() {
  const rows = await getDb().product.findMany({ select: cardSelect, orderBy });
  return rows.map(mapProductCard);
}

export async function getAdminProductOptions() {
  return getDb().product.findMany({ select: { id: true, name: true, model: true }, orderBy });
}

export async function getAdminProductById(id: string) {
  const row = await getDb().product.findUnique({ where: { id }, include: { category: true } });
  return row ? mapProduct(row) : null;
}

const loadRelatedProducts = unstable_cache(async (productId: string, category: string) => {
  const rows = await getDb().product.findMany({ where: { isVisible: true, category: { isActive: true }, id: { not: productId } }, select: cardSelect, orderBy, take: 12 });
  return rows.sort((a, b) => Number(b.category.slug === category) - Number(a.category.slug === category)).slice(0, 4).map(mapProductCard);
}, ["related-product-cards-v3"], { revalidate: 300, tags: ["public-products"] });

export async function getRelatedProducts(productId: string, category: string) {
  return loadRelatedProducts(productId, category);
}
