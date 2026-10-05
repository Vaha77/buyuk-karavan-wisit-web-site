import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { Prisma, type AdminUser, type PriceChangeSource } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit/service";
import { getDb } from "@/lib/db";
import type { PartDraft } from "./import";
import { getMarkupPercent } from "./queries";
import { formatUsd, sellPrice } from "./rules";

type Actor = Pick<AdminUser, "id" | "name">;
export type PriceUpdate = { entityType: "PRODUCT" | "SEX_PART"; entityId: string | null; newBase: number; create?: PartDraft };

export function revalidatePrices() {
  updateTag("public-products");
  revalidatePath("/admin/prays");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/products/[slug]", "page");
}

const money = (value: number) => new Prisma.Decimal(value.toFixed(2));

/**
 * Writes confirmed base prices: products also get priceUsd = ceil(base × (100 + markup) / 100).
 * One PriceChange per row (shared batchId) and one audit entry for the whole batch.
 */
export async function applyPriceUpdates(actor: Actor, args: { updates: PriceUpdate[]; source: PriceChangeSource; priceListName?: string | null; listDate?: Date | null }) {
  const markup = await getMarkupPercent(), batchId = randomUUID(), listDate = args.listDate ?? new Date(), db = getDb();
  const productUpdates = args.updates.filter(update => update.entityType === "PRODUCT" && update.entityId);
  const partUpdates = args.updates.filter(update => update.entityType === "SEX_PART" && update.entityId);
  const partCreates = args.updates.filter(update => update.entityType === "SEX_PART" && !update.entityId && update.create);
  const result = await db.$transaction(async tx => {
    const products = productUpdates.length ? await tx.product.findMany({ where: { id: { in: productUpdates.map(update => update.entityId!) }, archivedAt: null }, select: { id: true, name: true, basePriceUsd: true } }) : [];
    const parts = partUpdates.length ? await tx.sexPart.findMany({ where: { id: { in: partUpdates.map(update => update.entityId!) } }, select: { id: true, name: true, size: true, basePriceUsd: true } }) : [];
    const productById = new Map(products.map(row => [row.id, row])), partById = new Map(parts.map(row => [row.id, row]));
    const changes: Prisma.PriceChangeCreateManyInput[] = [];
    const productRows = productUpdates.filter(update => productById.has(update.entityId!));
    if (productRows.length) {
      const values = Prisma.join(productRows.map(update => Prisma.sql`(${update.entityId}, ${update.newBase.toFixed(2)}::numeric, ${sellPrice(update.newBase, markup).toFixed(2)}::numeric)`));
      await tx.$executeRaw`UPDATE "Product" AS p SET "basePriceUsd" = v.base, "priceUsd" = v.sale, "priceListDate" = ${listDate}, "updatedAt" = now() FROM (VALUES ${values}) AS v(id, base, sale) WHERE p.id = v.id`;
      for (const update of productRows) { const row = productById.get(update.entityId!)!; changes.push({ entityType: "PRODUCT", entityId: row.id, entityName: row.name, oldBase: row.basePriceUsd, newBase: money(update.newBase), source: args.source, priceListName: args.priceListName ?? null, batchId, userId: actor.id }); }
    }
    for (const update of partUpdates) {
      const row = partById.get(update.entityId!); if (!row) continue;
      await tx.sexPart.update({ where: { id: row.id }, data: { basePriceUsd: money(update.newBase), priceListDate: listDate } });
      changes.push({ entityType: "SEX_PART", entityId: row.id, entityName: [row.name, row.size].filter(Boolean).join(" "), oldBase: row.basePriceUsd, newBase: money(update.newBase), source: args.source, priceListName: args.priceListName ?? null, batchId, userId: actor.id });
    }
    for (const update of partCreates) {
      const draft = update.create!;
      const row = await tx.sexPart.create({ data: { name: draft.name, size: draft.size, group: draft.group, unit: draft.unit, basePriceUsd: money(update.newBase), priceListDate: listDate } });
      changes.push({ entityType: "SEX_PART", entityId: row.id, entityName: [row.name, row.size].filter(Boolean).join(" "), oldBase: null, newBase: money(update.newBase), source: args.source, priceListName: args.priceListName ?? null, batchId, userId: actor.id });
    }
    if (changes.length) await tx.priceChange.createMany({ data: changes });
    return changes;
  }, { timeout: 60_000, maxWait: 10_000 });
  if (result.length) {
    const sample = result.slice(0, 20).map(change => ({ name: change.entityName, old: change.oldBase?.toString() ?? null, new: change.newBase?.toString() ?? null }));
    await writeAudit(actor, { action: "PRICE_UPDATE", entityType: "PRICE_LIST", entityId: batchId, entityName: args.priceListName ?? null, summary: `Prays narxlarini yangiladi (${result.length} ta)`, metadata: { source: args.source, count: result.length, markup, sample } });
  }
  revalidatePrices();
  return result.length;
}

/** Changes the markup and recomputes every selling price that has a base price; products without one are left as they are. */
export async function applyMarkup(actor: Actor, markup: number) {
  const previous = await getMarkupPercent(), db = getDb();
  const updated = await db.$transaction(async tx => {
    await tx.siteSettings.upsert({ where: { id: "global" }, create: { id: "global", priceMarkupPercent: markup }, update: { priceMarkupPercent: markup } });
    return tx.$executeRaw`UPDATE "Product" SET "priceUsd" = ceil("basePriceUsd" * ${100 + markup} / 100.0), "updatedAt" = now() WHERE "basePriceUsd" IS NOT NULL AND "priceUsd" IS DISTINCT FROM ceil("basePriceUsd" * ${100 + markup} / 100.0)`;
  }, { timeout: 60_000, maxWait: 10_000 });
  await writeAudit(actor, { action: "MARKUP_CHANGE", entityType: "SITE_SETTINGS", entityId: "global", entityName: "Sotuv ustamasi", summary: `Sotuv ustamasini +${previous}% → +${markup}% qildi (${updated} ta narx)`, before: { priceMarkupPercent: previous }, after: { priceMarkupPercent: markup }, metadata: { updatedPrices: updated } });
  revalidatePrices();
  return updated;
}

/** "O‘chirish" in Prays hides the product (isVisible = false, archivedAt); the row is never deleted. */
export async function archiveProduct(actor: Actor, id: string) {
  const row = await getDb().product.findFirst({ where: { id, archivedAt: null }, select: { id: true, name: true, isVisible: true } });
  if (!row) return false;
  await getDb().product.update({ where: { id }, data: { isVisible: false, archivedAt: new Date() } });
  await writeAudit(actor, { action: "ARCHIVE", entityType: "PRODUCT", entityId: row.id, entityName: row.name, summary: "Mahsulotni praysdan o‘chirdi (yashirildi)", before: { isVisible: row.isVisible, archivedAt: null }, after: { isVisible: false, archived: true } });
  revalidatePrices();
  return true;
}

export async function deactivatePart(actor: Actor, id: string) {
  const row = await getDb().sexPart.findFirst({ where: { id, active: true } });
  if (!row) return false;
  await getDb().sexPart.update({ where: { id }, data: { active: false } });
  await writeAudit(actor, { action: "ARCHIVE", entityType: "SEX_PART", entityId: row.id, entityName: [row.name, row.size].filter(Boolean).join(" "), summary: "Seh zapchastini o‘chirdi (nofaol)", before: { active: true }, after: { active: false } });
  revalidatePrices();
  return true;
}

export async function createPart(actor: Actor, draft: PartDraft & { base: number | null }) {
  const row = await getDb().sexPart.create({ data: { name: draft.name, size: draft.size, group: draft.group, unit: draft.unit, basePriceUsd: draft.base === null ? null : money(draft.base), priceListDate: draft.base === null ? null : new Date() } });
  const label = [row.name, row.size].filter(Boolean).join(" ");
  if (draft.base !== null) await getDb().priceChange.create({ data: { entityType: "SEX_PART", entityId: row.id, entityName: label, oldBase: null, newBase: money(draft.base), source: "MANUAL", userId: actor.id } });
  await writeAudit(actor, { action: "CREATE", entityType: "SEX_PART", entityId: row.id, entityName: label, summary: "Seh zapchastini qo‘shdi", after: { name: row.name, size: row.size, group: row.group, unit: row.unit, basePriceUsd: draft.base === null ? null : formatUsd(draft.base) } });
  revalidatePrices();
  return row.id;
}
