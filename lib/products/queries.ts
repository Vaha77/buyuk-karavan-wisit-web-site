import "server-only";
import { getDb } from "@/lib/db";
import { mapProduct } from "./mapper";

const orderBy = [{ order: "asc" as const }, { createdAt: "desc" as const }, { id: "asc" as const }];

export async function getPublicProducts() {
  const rows = await getDb().product.findMany({ where: { isVisible: true, category: { isActive: true } }, include: { category: true }, orderBy });
  return rows.map(mapProduct);
}

export async function getProductBySlug(slug: string) {
  const row = await getDb().product.findFirst({ where: { slug, isVisible: true, category: { isActive: true } }, include: { category: true } });
  return row ? mapProduct(row) : null;
}

export async function getAdminProducts() {
  const rows = await getDb().product.findMany({ include: { category: true }, orderBy });
  return rows.map(mapProduct);
}

export async function getAdminProductById(id: string) {
  const row = await getDb().product.findUnique({ where: { id }, include: { category: true } });
  return row ? mapProduct(row) : null;
}

export async function getRelatedProducts(productId: string, category: string) {
  const rows = await getDb().product.findMany({
    where: { isVisible: true, category: { isActive: true }, id: { not: productId } }, include: { category: true },
    orderBy,
  });
  return rows.sort((a, b) => Number(b.category.slug === category) - Number(a.category.slug === category)).slice(0, 4).map(mapProduct);
}
