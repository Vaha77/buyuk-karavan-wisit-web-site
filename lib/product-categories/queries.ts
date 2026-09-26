import "server-only";
import { getDb } from "@/lib/db";
import { unstable_cache } from "next/cache";
import type { ProductCategoryRecord } from "./types";

export async function getAdminProductCategories(): Promise<ProductCategoryRecord[]> {
  const rows = await getDb().productCategory.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  return rows.map(row => ({ ...row, productCount: row._count.products }));
}

const loadPublicProductCategories = unstable_cache(async (): Promise<ProductCategoryRecord[]> => {
  const rows = await getDb().productCategory.findMany({
    where: { isActive: true, products: { some: { isVisible: true } } },
    include: { _count: { select: { products: { where: { isVisible: true } } } } },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  return rows.map(row => ({ ...row, productCount: row._count.products }));
}, ["public-product-categories-v1"], { revalidate: 300, tags: ["public-products"] });
export async function getPublicProductCategories() { return loadPublicProductCategories(); }
