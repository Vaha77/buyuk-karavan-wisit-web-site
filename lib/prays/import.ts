// Import preview: matches price-list rows to existing products / workshop parts. Pure; never creates products.
import type { ParsedPriceRow } from "../ai-office/price-list-parser";
import type { PriceListSheet, TableRow } from "./excel";
import { applyPercent, changePercent, changeStatus, hpOf, litersOf, modelKey, normalizeBrand, productFeatures, type ChangeStatus, type ProductKind } from "./rules";

export type CatalogProduct = { id: string; name: string; brand: string; model: string; categoryName: string | null; basePriceUsd: number | null };
export type CatalogPart = { id: string; name: string; size: string | null; group: string; unit: string; basePriceUsd: number | null };
export type PartDraft = { name: string; size: string | null; group: string; unit: string };
export type PreviewRow = {
  key: string;
  entityType: "PRODUCT" | "SEX_PART";
  /** null: nothing to update ("Topilmadi"), or a new workshop part (see `create`). */
  entityId: string | null;
  name: string;
  oldBase: number | null;
  newBase: number;
  status: ChangeStatus;
  percent: number | null;
  create?: PartDraft;
};

const KIND_LABEL: Record<ProductKind, string> = { compressor: "kompressor", receiver: "resiver ustida", water: "vadinoy agregat", air: "vazdushniy agregat", "water-kit": "vadinoy agregat komplekt", "air-kit": "vazdushniy agregat komplekt", other: "" };
const num = (text: string) => { const value = Number(text); return text && Number.isFinite(value) && value > 0 ? value : null; };

type Entry = { kind: ProductKind; price: number; detail: string; liters?: string | null; hp?: string | null; fn?: string | null; evaporator?: string | null };
/** One price-list row → one entry per assembly that has a price (kompressor, R/B ustida, vadinoy, vazdushniy, komplekts). */
export function rowEntries(row: ParsedPriceRow): Entry[] {
  const fn = row.airCondenser.trim().toUpperCase().replace(/\s+/g, "") || null, evaporator = row.evaporator.match(/\bD[DJ]\s*\d+/i)?.[0].toUpperCase().replace(/\s+/g, "") ?? null;
  const liters = litersOf(row.receiverLiters) ?? (row.receiverLiters.match(/^\d+/)?.[0] ?? null), hp = hpOf(row.waterCondenser) ?? (row.waterCondenser.match(/^\d+/)?.[0] ?? null);
  const entries: Array<[string, Omit<Entry, "price">]> = [
    [row.compressorPrice, { kind: "compressor", detail: "" }],
    [row.receiverPrice, { kind: "receiver", detail: liters ? `${liters}L` : "", liters }],
    [row.waterPrice, { kind: "water", detail: hp ? `· ${hp}HP` : "", hp }],
    [row.airPrice, { kind: "air", detail: fn ? `· ${fn}` : "", fn }],
    [row.waterKitPrice, { kind: "water-kit", detail: [hp && `${hp}HP`, evaporator].filter(Boolean).join(" + "), hp, evaporator }],
    [row.airKitPrice, { kind: "air-kit", detail: [fn, evaporator].filter(Boolean).join(" + "), fn, evaporator }],
  ];
  return entries.flatMap(([text, entry]) => { const price = num(text); return price === null ? [] : [{ ...entry, price }]; });
}

const same = (a: string | null | undefined, b: string | null | undefined) => !a || !b || a.toUpperCase() === b.toUpperCase();

/** Supplier price list → preview. A product matches on brand + model + assembly kind; known liters/HP/FN/evaporator/freon must agree. */
export function matchPriceList(sheet: Pick<PriceListSheet, "brand" | "freon" | "rows">, products: CatalogProduct[], brandOverride?: string | null): PreviewRow[] {
  const brand = normalizeBrand(brandOverride || sheet.brand || "");
  const catalog = products.map(product => ({ product, features: productFeatures(product) })).filter(item => !brand || item.features.brand === brand);
  const rows: PreviewRow[] = [];
  for (const row of sheet.rows) {
    const key = modelKey(row.model), freon = row.freon || sheet.freon;
    for (const entry of rowEntries(row)) {
      const label = `${brand} ${row.model.replace(/\s+/g, " ").trim()} ${KIND_LABEL[entry.kind]} ${entry.detail}`.replace(/\s+/g, " ").trim();
      const matches = catalog.filter(({ features: f }) => f.modelKey === key && f.kind === entry.kind && same(f.freon, freon)
        && same(f.liters, entry.kind === "receiver" ? entry.liters : null)
        && same(f.hp, entry.kind === "water" || entry.kind === "water-kit" ? entry.hp : null)
        && same(f.fn, entry.kind === "air" || entry.kind === "air-kit" ? entry.fn : null)
        && same(f.evaporator, entry.kind.endsWith("kit") ? entry.evaporator : null));
      if (!matches.length) { rows.push({ key: `${row.sourceRow}:${entry.kind}`, entityType: "PRODUCT", entityId: null, name: label, oldBase: null, newBase: entry.price, status: "NOT_FOUND", percent: null }); continue; }
      for (const { product } of matches) rows.push(previewRow(`${row.sourceRow}:${entry.kind}:${product.id}`, "PRODUCT", product.id, product.name, product.basePriceUsd, entry.price));
    }
  }
  return rows;
}

function previewRow(key: string, entityType: PreviewRow["entityType"], entityId: string | null, name: string, oldBase: number | null, newBase: number): PreviewRow {
  return { key, entityType, entityId, name, oldBase, newBase, status: changeStatus(oldBase, newBase), percent: changePercent(oldBase, newBase) };
}

/** Our own product export read back: rows are matched by ID only. */
export function matchProductTable(rows: TableRow[], products: CatalogProduct[]): PreviewRow[] {
  const byId = new Map(products.map(product => [product.id, product]));
  return rows.filter(row => row.base !== null).map(row => {
    const product = row.id ? byId.get(row.id) : undefined;
    if (!product) return { key: `t${row.sourceRow}`, entityType: "PRODUCT" as const, entityId: null, name: row.name, oldBase: null, newBase: row.base!, status: "NOT_FOUND" as const, percent: null };
    return previewRow(`t${row.sourceRow}`, "PRODUCT", product.id, product.name, product.basePriceUsd, row.base!);
  });
}

export const partLabel = (part: { name: string; size: string | null }) => [part.name, part.size].filter(Boolean).join(" ");
const partKey = (name: string, size: string | null) => `${name} ${size ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim();

/** Workshop parts file: matched by ID, else by name + size; unknown rows become new parts (admin enters these lists). */
export function matchPartsTable(rows: TableRow[], parts: CatalogPart[]): PreviewRow[] {
  const byId = new Map(parts.map(part => [part.id, part])), byName = new Map(parts.map(part => [partKey(part.name, part.size), part]));
  return rows.filter(row => row.base !== null).map(row => {
    const part = (row.id && byId.get(row.id)) || byName.get(partKey(row.name, row.size));
    if (part) return previewRow(`p${row.sourceRow}`, "SEX_PART", part.id, partLabel(part), part.basePriceUsd, row.base!);
    const create = { name: row.name, size: row.size, group: row.group?.trim() || "Boshqa", unit: row.unit?.trim() || "dona" };
    return { key: `p${row.sourceRow}`, entityType: "SEX_PART" as const, entityId: null, name: partLabel(create), oldBase: null, newBase: row.base!, status: "NEW" as const, percent: null, create };
  });
}

/** "Foiz bilan o‘zgartirish": every selected price × (100 ± p) / 100. */
export function percentPreview(items: Array<{ id: string; name: string; basePriceUsd: number | null; entityType: PreviewRow["entityType"] }>, percent: number): PreviewRow[] {
  return items.filter(item => item.basePriceUsd !== null).map(item => previewRow(item.id, item.entityType, item.id, item.name, item.basePriceUsd, applyPercent(item.basePriceUsd!, percent)));
}

export function previewSummary(rows: PreviewRow[]) {
  const count = (status: ChangeStatus) => rows.filter(row => row.status === status).length;
  return { up: count("UP"), down: count("DOWN"), added: count("NEW"), same: count("SAME"), notFound: count("NOT_FOUND") };
}
