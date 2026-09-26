import "server-only";
import { revalidatePath, updateTag } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import { readSpecifications } from "./mapper";
import type { ProductInput } from "./validation";
import { deleteOwnedImage, imageOwnerId, ImageValidationError, uploadProductImage } from "./storage";
import { productSnapshot,writeAudit } from "@/lib/audit/service";

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
  updateTag("public-products");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/products/[slug]", "page");
  for (const slug of slugs) revalidatePath(`/products/${slug}`);
}

function dbData(input: ProductInput, previous?: unknown) {
  const existing = readSpecifications(previous);
  return {
    name: input.name, brand: input.brand, model: input.model, slug: input.slug,
    categoryId: input.categoryId, priceUsd: input.priceUsd || null, shortDescription: input.shortDescription || null,
    description: input.description || null,
    specifications: { ...existing, rows: input.specifications, cardSpecs: input.tags.length ? input.tags : input.specifications.map(spec => spec.value).filter(Boolean).slice(0, 2) },
    tags: input.tags, availability: input.availability === "available" ? "AVAILABLE" as const : "ORDER" as const,
    isVisible: input.isVisible, order: input.order, seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
  };
}

export async function createProduct(input: ProductInput, rawImages: unknown = []) {
  const actor=await requireAdmin();
  const images = checkedImages(rawImages, []);
  try {
    const row = await getDb().product.create({ data: { ...dbData(input), isVisible: false } });
    try {
      const result = await uploadImages(row.id, images);
      try {
        const saved = await getDb().product.update({ where: { id: row.id }, data: { images: result.urls, isVisible: input.isVisible } });
        await writeAudit(actor,{action:"CREATE",entityType:"PRODUCT",entityId:saved.id,entityName:saved.name,summary:"Mahsulot yaratdi",after:productSnapshot(saved)});
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
  const actor=await requireAdmin();
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
    const before=productSnapshot(previous),after=productSnapshot(row);
    await writeAudit(actor,{action:"UPDATE",entityType:"PRODUCT",entityId:row.id,entityName:row.name,summary:"Mahsulot ma’lumotlarini tahrirladi",before,after});
    if(before.priceUsd!==after.priceUsd)await writeAudit(actor,{action:"PRICE_CHANGE",entityType:"PRODUCT",entityId:row.id,entityName:row.name,summary:"Narxni o‘zgartirdi",before:{priceUsd:before.priceUsd},after:{priceUsd:after.priceUsd}});
    if(before.categoryId!==after.categoryId)await writeAudit(actor,{action:"CATEGORY_CHANGE",entityType:"PRODUCT",entityId:row.id,entityName:row.name,summary:"Kategoriyani o‘zgartirdi",before:{categoryId:before.categoryId},after:{categoryId:after.categoryId}});
    if(before.seoTitle!==after.seoTitle||before.seoDescription!==after.seoDescription||before.slug!==after.slug)await writeAudit(actor,{action:"SEO_CHANGE",entityType:"PRODUCT",entityId:row.id,entityName:row.name,summary:"SEO ma’lumotlarini yangiladi",before:{slug:before.slug,seoTitle:before.seoTitle,seoDescription:before.seoDescription},after:{slug:after.slug,seoTitle:after.seoTitle,seoDescription:after.seoDescription}});
    if(JSON.stringify(before.images)!==JSON.stringify(after.images))await writeAudit(actor,{action:"IMAGE_CHANGE",entityType:"PRODUCT",entityId:row.id,entityName:row.name,summary:"Mahsulot rasmlarini yangiladi",before:{images:before.images},after:{images:after.images}});
    if(before.isVisible!==after.isVisible||before.availability!==after.availability)await writeAudit(actor,{action:"STATUS_CHANGE",entityType:"PRODUCT",entityId:row.id,entityName:row.name,summary:"Mahsulot holatini o‘zgartirdi",before:{isVisible:before.isVisible,availability:before.availability},after:{isVisible:after.isVisible,availability:after.availability}});
    await cleanupUnreferenced(id, previous.images.filter(url => !row.images.includes(url)));
    return row;
  } catch (error) {
    if (isUniqueError(error)) throw new DuplicateSlugError();
    throw error;
  }
}

export async function deleteProduct(id: string) {
  const actor=await requireAdmin();
  const row = await getDb().product.findUnique({ where: { id } });
  if (!row) throw new ProductNotFoundError();
  await getDb().product.delete({ where: { id } });
  await writeAudit(actor,{action:"DELETE",entityType:"PRODUCT",entityId:row.id,entityName:row.name,summary:"Mahsulotni o‘chirdi",before:productSnapshot(row)});
  revalidateProducts(row.slug);
  await cleanupUnreferenced(id, row.images);
}

export async function toggleProductVisibility(id: string) {
  const actor=await requireAdmin();
  const row = await getDb().product.findUnique({ where: { id } });
  if (!row) throw new ProductNotFoundError();
  const updated = await getDb().product.update({ where: { id }, data: { isVisible: !row.isVisible } });
  await writeAudit(actor,{action:"STATUS_CHANGE",entityType:"PRODUCT",entityId:updated.id,entityName:updated.name,summary:updated.isVisible?"Mahsulotni saytda ko‘rsatdi":"Mahsulotni saytda yashirdi",before:{isVisible:row.isVisible},after:{isVisible:updated.isVisible}});
  revalidateProducts(row.slug);
  return updated;
}

type GeneratedImageAttachOptions = { maxSize?: number; skipAudit?: boolean; onStage?: (stage: "product_lookup" | "storage_upload" | "product_update" | "storage_cleanup") => void };
export async function attachGeneratedProductImage(id: string, file: File, placement: "main" | "gallery", options: GeneratedImageAttachOptions = {}) {
  const actor=await requireAdmin();
  options.onStage?.("product_lookup");
  const previous = await getDb().product.findUnique({ where: { id } });
  if (!previous) throw new ProductNotFoundError();
  options.onStage?.("storage_upload");
  const url = await uploadProductImage(id, file, options.maxSize);
  const images = placement === "main" ? [url, ...previous.images.slice(1)] : [...previous.images, url];
  let updated;
  try {
    options.onStage?.("product_update");
    updated = await getDb().product.update({ where: { id }, data: { images } });
  } catch (error) {
    options.onStage?.("storage_cleanup");
    await Promise.allSettled([deleteOwnedImage(url, id)]);
    throw error;
  }
  revalidateProducts(updated.slug);
  if (!options.skipAudit) await writeAudit(actor,{action:"IMAGE_ATTACH",entityType:"PRODUCT",entityId:updated.id,entityName:updated.name,summary:`Photo Studio rasmini mahsulotga biriktirdi`,before:{images:previous.images},after:{images:updated.images},metadata:{placement}});
  if (placement === "main" && previous.images[0]) await Promise.allSettled([cleanupUnreferenced(id, [previous.images[0]])]);
  return { product: updated, url };
}

export async function copyProduct(id: string) {
  const actor=await requireAdmin();
  const source = await getDb().product.findUnique({ where: { id } });
  if (!source) throw new ProductNotFoundError();
  const maxOrder = await getDb().product.aggregate({ _max: { order: true } });
  for (let suffix = 1; suffix <= 100; suffix++) {
    try {
      const copy = await getDb().product.create({ data: {
        name: `${source.name} — nusxa`, brand: source.brand, model: source.model,
        slug: `${source.slug}-nusxa${suffix === 1 ? "" : `-${suffix}`}`,
        categoryId: source.categoryId, priceUsd: source.priceUsd, shortDescription: source.shortDescription, description: source.description,
        images: source.images, specifications: source.specifications ?? {}, tags: source.tags,
        availability: source.availability, isVisible: false, order: (maxOrder._max.order ?? 0) + 1,
        seoTitle: source.seoTitle, seoDescription: source.seoDescription,
      } });
      revalidateProducts(copy.slug);
      await writeAudit(actor,{action:"CREATE",entityType:"PRODUCT",entityId:copy.id,entityName:copy.name,summary:"Mahsulot nusxasini yaratdi",after:productSnapshot(copy),metadata:{copiedFromId:source.id}});
      return copy;
    } catch (error) {
      if (!isUniqueError(error)) throw error;
    }
  }
  throw new DuplicateSlugError();
}
