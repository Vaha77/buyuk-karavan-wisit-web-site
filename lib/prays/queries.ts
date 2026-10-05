import "server-only";
import { cache } from "react";
import { getDb } from "@/lib/db";
import type { CatalogPart, CatalogProduct } from "./import";
import { DEFAULT_MARKUP, clampMarkup, formatShortDate } from "./rules";

const toNumber = (value: { toString(): string } | null | undefined) => (value === null || value === undefined ? null : Number(value.toString()));

// cache(): one read per request even when the layout, page and catalog builders all ask.
export const getMarkupPercent = cache(async function getMarkupPercent() {
  const settings = await getDb().siteSettings.findUnique({ where: { id: "global" }, select: { priceMarkupPercent: true } }).catch(() => null);
  return clampMarkup(settings?.priceMarkupPercent ?? DEFAULT_MARKUP) ?? DEFAULT_MARKUP;
});

export type PraysProduct = CatalogProduct & { priceUsd: number | null; priceListDate: string | null; categoryName: string | null };
export type PraysPart = CatalogPart & { priceListDate: string | null };
export type HistoryEntry = { id: string; title: string; detail: string; who: string };

/** Products still in the price list (not archived), for the Prays page and imports. */
export const getPraysProducts = cache(async function getPraysProducts(): Promise<PraysProduct[]> {
  const rows = await getDb().product.findMany({
    where: { archivedAt: null },
    orderBy: [{ brand: "asc" }, { model: "asc" }, { name: "asc" }],
    select: { id: true, name: true, brand: true, model: true, basePriceUsd: true, priceUsd: true, priceListDate: true, category: { select: { name: true } } },
  });
  return rows.map(row => ({ id: row.id, name: row.name, brand: row.brand, model: row.model, categoryName: row.category.name, basePriceUsd: toNumber(row.basePriceUsd), priceUsd: toNumber(row.priceUsd), priceListDate: row.priceListDate?.toISOString() ?? null }));
});

export const getSexParts = cache(async function getSexParts(includeInactive = false): Promise<PraysPart[]> {
  const rows = await getDb().sexPart.findMany({ where: includeInactive ? {} : { active: true }, orderBy: [{ group: "asc" }, { name: "asc" }, { size: "asc" }] });
  return rows.map(row => ({ id: row.id, name: row.name, size: row.size, group: row.group, unit: row.unit, basePriceUsd: toNumber(row.basePriceUsd), priceListDate: row.priceListDate?.toISOString() ?? null }));
});

const SOURCE_LABEL = { MANUAL: "qo‘lda", EXCEL: "Excel import", AI_IMAGE: "rasm (AI)", PERCENT: "foiz bilan" } as const;

/** "Narx tarixi": the latest changes, one entry per confirmed batch (an import or a percent change is one line). */
export async function getPriceHistory(limit = 20): Promise<HistoryEntry[]> {
  const rows = await getDb().priceChange.findMany({ orderBy: { createdAt: "desc" }, take: 400, select: { id: true, batchId: true, entityType: true, entityName: true, oldBase: true, newBase: true, source: true, priceListName: true, createdAt: true, user: { select: { name: true } } } });
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.batchId ?? row.id;
    if (!groups.has(key) && groups.size >= limit) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const first = items[0], kind = first.entityType === "SEX_PART" ? "Sex zapchastlari" : "Tayyor mahsulotlar";
    let detail: string;
    if (items.length === 1) detail = `${first.entityName}: ${first.oldBase === null ? "—" : `$${toNumber(first.oldBase)}`} → $${toNumber(first.newBase)}`;
    else {
      const up = items.filter(item => item.oldBase !== null && item.newBase !== null && Number(item.newBase) > Number(item.oldBase)).length;
      const down = items.filter(item => item.oldBase !== null && item.newBase !== null && Number(item.newBase) < Number(item.oldBase)).length;
      const added = items.filter(item => item.oldBase === null).length;
      detail = [up && `${up} ta narx oshdi`, down && `${down} ta arzonladi`, added && `${added} ta yangi`].filter(Boolean).join(", ") || `${items.length} ta narx`;
    }
    return { id: key, title: `${first.priceListName || kind} · ${SOURCE_LABEL[first.source]}`, detail, who: `${formatShortDate(first.createdAt)} · ${first.user?.name ?? "—"}` };
  });
}
