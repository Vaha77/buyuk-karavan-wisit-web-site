"use server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-admin";
import { readPriceWorkbook, type PriceListSheet } from "@/lib/prays/excel";
import { matchPartsTable, matchPriceList, matchProductTable, percentPreview, type PreviewRow } from "@/lib/prays/import";
import { applyMarkup, applyPriceUpdates, archiveProduct, createPart, deactivatePart } from "@/lib/prays/mutations";
import { getPraysProducts, getSexParts } from "@/lib/prays/queries";
import { clampMarkup, formatShortDate, normalizeBrand } from "@/lib/prays/rules";
import { PriceImageError, readPriceImage } from "@/lib/prays/ai-image";

export type PreviewSource = "EXCEL" | "AI_IMAGE" | "PERCENT";
export type PreviewResult = { ok: true; source: PreviewSource; fileName: string; priceListName: string | null; listDate: string | null; rows: PreviewRow[] } | { ok: false; error: string };
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const EXCEL_TYPES = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", ""]);
const MAX_EXCEL_BYTES = 10 * 1024 * 1024;

function listName(sheet: PriceListSheet, brands: string[]) {
  const brand = sheet.brand ? brands.find(item => normalizeBrand(item) === sheet.brand) ?? sheet.brand : null;
  return [[brand, sheet.freon].filter(Boolean).join(" "), sheet.listDate && formatShortDate(sheet.listDate)].filter(Boolean).join(" · ") || null;
}

export async function previewExcelAction(form: FormData): Promise<PreviewResult> {
  await requireRole("SUPER_ADMIN");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Excel faylni tanlang." };
  if (file.size > MAX_EXCEL_BYTES || !EXCEL_TYPES.has(file.type) || !/\.xlsx$/i.test(file.name)) return { ok: false, error: "Faqat .xlsx fayl (10 MB gacha) yuklang." };
  let sheets;
  try { sheets = await readPriceWorkbook(new Uint8Array(await file.arrayBuffer())); }
  catch { return { ok: false, error: "Excel fayl o‘qilmadi." }; }
  if (!sheets.length) return { ok: false, error: "Faylda prays jadvali topilmadi (sarlavhada “Kompressor” yoki “Nomi / Prays narxi” ustunlari bo‘lishi kerak)." };
  const [products, parts] = await Promise.all([getPraysProducts(), getSexParts(true)]);
  const brands = [...new Set(products.map(product => product.brand))];
  const rows: PreviewRow[] = [];
  let priceListName: string | null = null, listDate: Date | null = null;
  for (const sheet of sheets) {
    if (sheet.kind === "price-list") { rows.push(...matchPriceList(sheet, products)); priceListName ??= listName(sheet, brands); listDate ??= sheet.listDate; }
    else if (sheet.kind === "products-table") rows.push(...matchProductTable(sheet.rows, products));
    else rows.push(...matchPartsTable(sheet.rows, parts));
  }
  return { ok: true, source: "EXCEL", fileName: file.name, priceListName, listDate: listDate?.toISOString() ?? null, rows };
}

export async function previewImageAction(form: FormData): Promise<PreviewResult> {
  await requireRole("SUPER_ADMIN");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Rasmni tanlang." };
  try {
    const sheet = await readPriceImage(file);
    const products = await getPraysProducts();
    return { ok: true, source: "AI_IMAGE", fileName: file.name, priceListName: listName(sheet, [...new Set(products.map(product => product.brand))]), listDate: sheet.listDate?.toISOString() ?? null, rows: matchPriceList(sheet, products) };
  } catch (error) {
    if (error instanceof PriceImageError) return { ok: false, error: error.message };
    console.error("[PraysImage]", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return { ok: false, error: "Rasm AI orqali o‘qilmadi. Qayta urinib ko‘ring." };
  }
}

const percentSchema = z.object({ scope: z.string().regex(/^(?:product|part):.{1,120}$/), percent: z.number().min(-90).max(500).refine(value => value !== 0, "Foiz 0 bo‘lmasin.") });
/** scope "product:all", "product:<brand>", "part:all", "part:<group>". */
export async function previewPercentAction(raw: unknown): Promise<PreviewResult> {
  await requireRole("SUPER_ADMIN");
  const parsed = percentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Foizni tekshiring." };
  const [kind, filter] = [parsed.data.scope.slice(0, parsed.data.scope.indexOf(":")), parsed.data.scope.slice(parsed.data.scope.indexOf(":") + 1)];
  const items = kind === "product"
    ? (await getPraysProducts()).filter(product => filter === "all" || product.brand === filter).map(product => ({ id: product.id, name: product.name, basePriceUsd: product.basePriceUsd, entityType: "PRODUCT" as const }))
    : (await getSexParts()).filter(part => filter === "all" || part.group === filter).map(part => ({ id: part.id, name: [part.name, part.size].filter(Boolean).join(" "), basePriceUsd: part.basePriceUsd, entityType: "SEX_PART" as const }));
  const rows = percentPreview(items, parsed.data.percent);
  if (!rows.length) return { ok: false, error: "Tanlangan guruhda prays narxi kiritilgan mahsulot yo‘q." };
  const sign = parsed.data.percent > 0 ? "+" : "";
  return { ok: true, source: "PERCENT", fileName: `${filter === "all" ? (kind === "product" ? "Tayyor mahsulotlar" : "Sex zapchastlari") : filter} · ${sign}${parsed.data.percent}%`, priceListName: null, listDate: null, rows };
}

const money = z.number().positive("Narx 0 dan katta bo‘lsin.").max(10_000_000).transform(value => Math.round(value * 100) / 100);
const partDraft = z.object({ name: z.string().trim().min(1).max(120), size: z.string().trim().max(40).nullable(), group: z.string().trim().min(1).max(60), unit: z.string().trim().min(1).max(20) });
const confirmSchema = z.object({
  source: z.enum(["EXCEL", "AI_IMAGE", "PERCENT"]),
  priceListName: z.string().max(160).nullable(),
  listDate: z.string().datetime().nullable(),
  rows: z.array(z.object({ entityType: z.enum(["PRODUCT", "SEX_PART"]), entityId: z.string().max(40).nullable(), newBase: money, create: partDraft.optional() })).min(1).max(3000),
});
export async function confirmPreviewAction(raw: unknown): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN");
  const parsed = confirmSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Ma’lumotni tekshiring." };
  const updates = parsed.data.rows.filter(row => row.entityId || (row.entityType === "SEX_PART" && row.create));
  if (!updates.length) return { ok: false, error: "Yangilanadigan narx yo‘q." };
  const count = await applyPriceUpdates(actor, { updates, source: parsed.data.source, priceListName: parsed.data.priceListName, listDate: parsed.data.listDate ? new Date(parsed.data.listDate) : null });
  return { ok: true, message: `${count} ta narx saqlandi` };
}

const manualSchema = z.object({ entityType: z.enum(["PRODUCT", "SEX_PART"]), id: z.string().min(1).max(40), base: money });
export async function updateBaseAction(raw: unknown): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN");
  const parsed = manualSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Narxni to‘g‘ri kiriting." };
  const count = await applyPriceUpdates(actor, { updates: [{ entityType: parsed.data.entityType, entityId: parsed.data.id, newBase: parsed.data.base }], source: "MANUAL" });
  return count ? { ok: true } : { ok: false, error: "Mahsulot topilmadi." };
}

export async function removeEntryAction(raw: unknown): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN");
  const parsed = z.object({ entityType: z.enum(["PRODUCT", "SEX_PART"]), id: z.string().min(1).max(40) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "So‘rov noto‘g‘ri." };
  const done = parsed.data.entityType === "PRODUCT" ? await archiveProduct(actor, parsed.data.id) : await deactivatePart(actor, parsed.data.id);
  return done ? { ok: true } : { ok: false, error: "Topilmadi yoki allaqachon o‘chirilgan." };
}

export async function createPartAction(raw: unknown): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN");
  const parsed = partDraft.extend({ base: money.nullable() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Nomi, guruh va birlikni kiriting." };
  await createPart(actor, { ...parsed.data, size: parsed.data.size || null });
  return { ok: true };
}

export async function applyMarkupAction(raw: unknown): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN");
  const markup = clampMarkup(Number(raw));
  if (markup === null) return { ok: false, error: "Ustama 1% dan 20% gacha bo‘lishi kerak." };
  const count = await applyMarkup(actor, markup);
  return { ok: true, message: `Ustama +${markup}% · ${count} ta sotuv narxi yangilandi` };
}
