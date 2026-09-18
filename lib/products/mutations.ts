import "server-only";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import { readSpecifications } from "./mapper";
import type { ProductInput } from "./validation";
import { deleteOwnedImage, imageOwnerId, ImageValidationError, uploadProductImage } from "./storage";

export class DuplicateSlugError extends Error {}
export class ProductNotFoundError extends Error {}
export type ProductImageInput = { url?: string; file?: File };

function checkedImages(raw: unknown, existing: string[]): ProductImageInput[] {
  if (!Array.isArray(raw) || raw.length > 12) throw new ImageValidationError("Rasmlar soni juda ko‘p.");
  return raw.map(item => {
    if (!item || typeof item !== "object") throw new ImageValidationError("Rasm ma’lumotlari noto‘g‘ri.");
    const image = item as ProductImageInput;
    if (typeof image.url === "string" && !image.file && existing.includes(image.url)) return { url: image.url };
    if (image.file instanceof File && !image.url) return { file: image.file };
    throw new ImageValidationError("Rasm ma’lumotlari noto‘g‘ri.");
  });
}

async function uploadImages(id: string, images: ProductImageInput[]) {
  const uploaded: string[] = [];
  try {
    const urls: string[] = [];
    for (const image of images) {
      if (image.url) urls.push(image.url);
      else if (image.file) {
        const url = await uploadProductImage(id, image.file);
        uploaded.push(url);
        urls.push(url);
      }
    }
    return { urls, uploaded };
  } catch (error) {
    await Promise.allSettled(uploaded.map(url => deleteOwnedImage(url, id)));
    throw error;
  }
}

async function cleanupUnreferenced(id: string, urls: string[]) {
  for (const url of urls) {
    const references = await getDb().product.count({ where: { images: { has: url } } });
    if (!references) {
      try {
        const ownerId = imageOwnerId(url);
        if (ownerId) await deleteOwnedImage(url, ownerId);
      }
      catch { console.error("Product image cleanup failed", { productId: id }); }
    }
  }
}

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

export async function createProduct(input: ProductInput, rawImages: unknown = []) {
  await requireAdmin();
  const images = checkedImages(rawImages, []);
  try {
    const row = await getDb().product.create({ data: { ...dbData(input), isVisible: false } });
    try {
      const result = await uploadImages(row.id, images);
      try {
        const saved = await getDb().product.update({ where: { id: row.id }, data: { images: result.urls, isVisible: input.isVisible } });
        revalidateProducts(saved.slug);
        return saved;
      } catch (error) {
        await Promise.allSettled(result.uploaded.map(url => deleteOwnedImage(url, row.id)));
        throw error;
      }
    } catch (error) {
      await getDb().product.delete({ where: { id: row.id } });
      throw error;
    }
  } catch (error) {
    if (isUniqueError(error)) throw new DuplicateSlugError();
    throw error;
  }
}

export async function updateProduct(id: string, input: ProductInput, rawImages?: unknown) {
  await requireAdmin();
  const previous = await getDb().product.findUnique({ where: { id } });
  if (!previous) throw new ProductNotFoundError();
  const images = checkedImages(rawImages ?? previous.images.map(url => ({ url })), previous.images);
  try {
    const result = await uploadImages(id, images);
    let row;
    try {
      row = await getDb().product.update({ where: { id }, data: { ...dbData(input, previous.specifications), images: result.urls } });
    } catch (error) {
      await Promise.allSettled(result.uploaded.map(url => deleteOwnedImage(url, id)));
      throw error;
    }
    revalidateProducts(previous.slug, row.slug);
    await cleanupUnreferenced(id, previous.images.filter(url => !row.images.includes(url)));
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
  await cleanupUnreferenced(id, row.images);
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
