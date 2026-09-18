import "server-only";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import { readSpecifications } from "./mapper";
import type { ProductInput } from "./validation";

export class DuplicateSlugError extends Error {}
export class ProductNotFoundError extends Error {}

function isUniqueError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "P2002";
}

function revalidateProducts(...slugs: string[]) {
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/products/[slug]", "page");
  for (const slug of slugs) revalidatePath(`/products/${slug}`);
}

function dbData(input: ProductInput, previous?: unknown) {
  const existing = readSpecifications(previous);
  return {
    name: input.name, brand: input.brand, model: input.model, slug: input.slug,
    category: input.category, shortDescription: input.shortDescription || null,
    description: input.description || null,
    specifications: { ...existing, rows: input.specifications, cardSpecs: input.tags.length ? input.tags : input.specifications.map(spec => spec.value).filter(Boolean).slice(0, 2) },
    tags: input.tags, availability: input.availability === "available" ? "AVAILABLE" as const : "ORDER" as const,
    isVisible: input.isVisible, order: input.order, seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
  };
}

export async function createProduct(input: ProductInput) {
  await requireAdmin();
  try {
    const row = await getDb().product.create({ data: dbData(input) });
    revalidateProducts(row.slug);
    return row;
  } catch (error) {
    if (isUniqueError(error)) throw new DuplicateSlugError();
    throw error;
  }
}

export async function updateProduct(id: string, input: ProductInput) {
  await requireAdmin();
  const previous = await getDb().product.findUnique({ where: { id } });
  if (!previous) throw new ProductNotFoundError();
  try {
    const row = await getDb().product.update({ where: { id }, data: dbData(input, previous.specifications) });
    revalidateProducts(previous.slug, row.slug);
    return row;
  } catch (error) {
    if (isUniqueError(error)) throw new DuplicateSlugError();
    throw error;
  }
}

export async function deleteProduct(id: string) {
  await requireAdmin();
  const row = await getDb().product.findUnique({ where: { id } });
  if (!row) throw new ProductNotFoundError();
  await getDb().product.delete({ where: { id } });
  revalidateProducts(row.slug);
}

export async function toggleProductVisibility(id: string) {
  await requireAdmin();
  const row = await getDb().product.findUnique({ where: { id } });
  if (!row) throw new ProductNotFoundError();
  const updated = await getDb().product.update({ where: { id }, data: { isVisible: !row.isVisible } });
  revalidateProducts(row.slug);
  return updated;
}

export async function copyProduct(id: string) {
  await requireAdmin();
  const source = await getDb().product.findUnique({ where: { id } });
  if (!source) throw new ProductNotFoundError();
  const maxOrder = await getDb().product.aggregate({ _max: { order: true } });
  for (let suffix = 1; suffix <= 100; suffix++) {
    try {
      const copy = await getDb().product.create({ data: {
        name: `${source.name} — nusxa`, brand: source.brand, model: source.model,
        slug: `${source.slug}-nusxa${suffix === 1 ? "" : `-${suffix}`}`,
        category: source.category, shortDescription: source.shortDescription, description: source.description,
        images: source.images, specifications: source.specifications ?? {}, tags: source.tags,
        availability: source.availability, isVisible: false, order: (maxOrder._max.order ?? 0) + 1,
        seoTitle: source.seoTitle, seoDescription: source.seoDescription,
      } });
      revalidateProducts(copy.slug);
      return copy;
    } catch (error) {
      if (!isUniqueError(error)) throw error;
    }
  }
  throw new DuplicateSlugError();
}
