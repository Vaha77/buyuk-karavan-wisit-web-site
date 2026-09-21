import "server-only";
import type { Product as DbProduct, ProductCategory as DbProductCategory } from "@/generated/prisma/client";
import type { Product, ProductSpecification } from "./types";

export type StoredSpecifications = {
  rows: ProductSpecification[];
  cardSpecs?: string[];
  descriptionBullets?: string[];
  applications?: { id: string; label: string }[];
};

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function specRows(value: unknown): ProductSpecification[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is ProductSpecification => !!row && typeof row === "object" && typeof row.id === "string" && typeof row.name === "string" && typeof row.value === "string");
}

export function readSpecifications(value: unknown): StoredSpecifications {
  if (Array.isArray(value)) return { rows: specRows(value) };
  if (!value || typeof value !== "object") return { rows: [] };
  const stored = value as Record<string, unknown>;
  return {
    rows: specRows(stored.rows),
    cardSpecs: stringList(stored.cardSpecs),
    descriptionBullets: stringList(stored.descriptionBullets),
    applications: Array.isArray(stored.applications) ? stored.applications.filter((item): item is { id: string; label: string } => !!item && typeof item === "object" && typeof item.id === "string" && typeof item.label === "string") : [],
  };
}

export function mapProduct(row: DbProduct & { category: DbProductCategory }): Product {
  const stored = readSpecifications(row.specifications);
  const specs = stored.cardSpecs?.length ? stored.cardSpecs : row.tags.length ? row.tags : stored.rows.map(item => item.value).filter(Boolean).slice(0, 2);
  return {
    id: row.id, slug: row.slug, name: row.name, brand: row.brand, model: row.model,
    categoryId: row.categoryId, category: row.category.slug, categoryName: row.category.name, priceUsd: row.priceUsd?.toString() ?? null,
    badge: row.category.name.toLocaleUpperCase("uz-UZ"), image: row.images[0] ?? null, images: row.images,
    shortDescription: row.shortDescription ?? undefined, description: row.description ?? undefined,
    descriptionBullets: stored.descriptionBullets, specifications: stored.rows, applications: stored.applications,
    tags: row.tags, specs, availability: row.availability === "AVAILABLE" ? "available" : "order",
    order: row.order, isVisible: row.isVisible, seoTitle: row.seoTitle ?? undefined,
    seoDescription: row.seoDescription ?? undefined, updatedAt: row.updatedAt.toLocaleDateString("uz-UZ"),
  };
}
