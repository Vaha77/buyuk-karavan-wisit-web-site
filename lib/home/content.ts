import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { initialHomeContent, type HomeContent } from "@/data/admin-home";
import { getDb } from "@/lib/db";
import { unstable_cache } from "next/cache";

const sectionKeys = ["hero", "selector", "solutions", "featuredProducts", "temperature", "projects", "reasons", "cta", "footer"] as const;

export class HomeContentValidationError extends Error {}

function cloneDefaults(): HomeContent {
  return structuredClone(initialHomeContent);
}

function mergeWithDefaults(defaultValue: unknown, savedValue: unknown): unknown {
  if (Array.isArray(defaultValue)) {
    if (!Array.isArray(savedValue)) return structuredClone(defaultValue);
    const template = defaultValue[0];
    return template === undefined ? structuredClone(savedValue) : savedValue.map(item => mergeWithDefaults(template, item));
  }
  if (defaultValue && typeof defaultValue === "object") {
    if (!savedValue || typeof savedValue !== "object" || Array.isArray(savedValue)) return structuredClone(defaultValue);
    return Object.fromEntries(Object.entries(defaultValue).map(([key, fallback]) => [key, mergeWithDefaults(fallback, (savedValue as Record<string, unknown>)[key])]));
  }
  if (defaultValue === null) return savedValue === null || typeof savedValue === "string" ? savedValue : null;
  if (typeof savedValue !== typeof defaultValue) return defaultValue;
  if (typeof savedValue === "number" && !Number.isFinite(savedValue)) return defaultValue;
  return savedValue;
}

export function normalizeHomeContent(value: unknown): HomeContent {
  return mergeWithDefaults(initialHomeContent, value) as HomeContent;
}

function validateNode(value: unknown, depth = 0): void {
  if (depth > 7) throw new HomeContentValidationError("Kontent tuzilishi juda chuqur.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") { if (value.length > 8000) throw new HomeContentValidationError("Kontent maydonlaridan biri juda uzun."); return; }
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new HomeContentValidationError("Kontent qiymati noto‘g‘ri."); return; }
  if (Array.isArray(value)) { if (value.length > 40) throw new HomeContentValidationError("Kontent ro‘yxati juda uzun."); value.forEach(item => validateNode(item, depth + 1)); return; }
  if (!value || typeof value !== "object" || Object.keys(value).length > 40) throw new HomeContentValidationError("Kontent tuzilishi noto‘g‘ri.");
  Object.values(value).forEach(item => validateNode(item, depth + 1));
}

export function validateHomeContent(value: unknown): HomeContent {
  validateNode(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HomeContentValidationError("Home kontenti noto‘g‘ri.");
  const normalized = normalizeHomeContent(value);
  const record = normalized as unknown as Record<string, unknown>;
  for (const key of sectionKeys) {
    const section = record[key];
    if (!section || typeof section !== "object" || Array.isArray(section)) throw new HomeContentValidationError(`${key} bo‘limi noto‘g‘ri.`);
    const base = section as Record<string, unknown>;
    if (typeof base.isVisible !== "boolean" || !Number.isInteger(base.order)) throw new HomeContentValidationError(`${key} bo‘lim sozlamalari noto‘g‘ri.`);
  }
  if (JSON.stringify(value).length > 12_000_000) throw new HomeContentValidationError("Home kontenti hajmi juda katta.");
  return normalized;
}

function mapRow(row: { hero: unknown; selector: unknown; solutions: unknown; featuredProducts: unknown; temperatureRange: unknown; projects: unknown; reasons: unknown; cta: unknown; footer: unknown }): HomeContent {
  return normalizeHomeContent({ hero: row.hero, selector: row.selector, solutions: row.solutions, featuredProducts: row.featuredProducts, temperature: row.temperatureRange, projects: row.projects, reasons: row.reasons, cta: row.cta, footer: row.footer });
}

function columns(content: HomeContent) {
  return { hero: content.hero as unknown as Prisma.InputJsonValue, selector: content.selector as unknown as Prisma.InputJsonValue, solutions: content.solutions as unknown as Prisma.InputJsonValue, featuredProducts: content.featuredProducts as unknown as Prisma.InputJsonValue, temperatureRange: content.temperature as unknown as Prisma.InputJsonValue, projects: content.projects as unknown as Prisma.InputJsonValue, reasons: content.reasons as unknown as Prisma.InputJsonValue, cta: content.cta as unknown as Prisma.InputJsonValue, footer: content.footer as unknown as Prisma.InputJsonValue };
}

export async function getHomeContent(): Promise<HomeContent> {
  const db = getDb();
  const existing = await db.homeContent.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return mapRow(existing);
  const defaults = cloneDefaults();
  const products = await db.product.findMany({ where: { isVisible: true }, orderBy: [{ order: "asc" }, { createdAt: "desc" }], select: { id: true }, take: 4 });
  defaults.featuredProducts.items = products.map((product, index) => ({ productId: product.id, isVisible: true, order: index + 1 }));
  return mapRow(await db.homeContent.create({ data: columns(defaults) }));
}

const loadPublicHomeContent = unstable_cache(async (): Promise<HomeContent> => {
  try { return await getHomeContent(); }
  catch { return cloneDefaults(); }
}, ["public-home-content-v1"], { revalidate: 300, tags: ["public-home"] });
export async function getPublicHomeContent(): Promise<HomeContent> { return loadPublicHomeContent(); }

export async function persistHomeContent(content: HomeContent): Promise<HomeContent> {
  const db = getDb();
  const current = await db.homeContent.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const row = current ? await db.homeContent.update({ where: { id: current.id }, data: columns(content) }) : await db.homeContent.create({ data: columns(content) });
  return mapRow(row);
}
