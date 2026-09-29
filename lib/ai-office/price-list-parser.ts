import "server-only";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

export type PriceListKind = "compressor" | "receiver" | "water" | "air" | "water-kit" | "air-kit";
export type ParsedPriceRow = { model: string; freon: string; compressorPrice: string; receiverLiters: string; receiverPrice: string; waterCondenser: string; waterPrice: string; airCondenser: string; airPrice: string; waterKitPrice: string; evaporator: string; airKitPrice: string; kitParts: string; sourceRow: number };
export type ParsedPriceBlock = { key: string; label: string; sheetName: string; startColumn: number; sourceTitle: string; rows: ParsedPriceRow[] };
export type ParsedPriceList = { version: 1; blocks: ParsedPriceBlock[] };

const text = (value: ExcelJS.CellValue | null | undefined) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) return String(value.result).trim();
    if ("richText" in value) return value.richText.map(part => part.text).join("").trim();
    if ("text" in value) return String(value.text).trim();
  }
  return String(value).trim();
};
const money = (value: ExcelJS.CellValue | null | undefined) => text(value).replace(/[$\s]/g, "").replace(",", ".");
export function normalizePriceModel(raw: string) { const compact = raw.toUpperCase().replace(/XUEYING|XUEING/g, "").replace(/\s+/g, "").trim(); return compact.replace(/^([A-Z]{2})([+-]?)(\d)/, (_, family, sign, digit) => `${family}${sign ? ` ${sign}` : " "}${digit}`); }

function mergedValue(sheet: ExcelJS.Worksheet, row: number, column: number) { const cell = sheet.getCell(row, column); return text(cell.isMerged ? cell.master.value : cell.value); }
function headerRow(sheet: ExcelJS.Worksheet, start: number) { for (let row = 1; row <= Math.min(15, sheet.rowCount); row++) if (/model/i.test(text(sheet.getCell(row, start).value))) return row; return 2; }
function parseBlock(sheet: ExcelJS.Worksheet, startColumn: number, suffix: string): ParsedPriceBlock {
  const header = headerRow(sheet, startColumn); const title = [1, 2, 3].map(row => text(sheet.getCell(row, startColumn).value)).filter(Boolean).join(" · "); const rows: ParsedPriceRow[] = [];
  for (let row = header + 1; row <= sheet.rowCount; row++) {
    const rawModel = mergedValue(sheet, row, startColumn); if (!rawModel || !/(?:BR|BF)\s*[+-]?\s*\d/i.test(rawModel)) continue;
    const values = Array.from({ length: 12 }, (_, offset) => mergedValue(sheet, row, startColumn + offset));
    rows.push({ model: normalizePriceModel(values[0]), freon: /R\d+/i.exec(values[0])?.[0]?.toUpperCase() || /R\d+/i.exec(title)?.[0]?.toUpperCase() || "R22", compressorPrice: money(values[1]), receiverLiters: values[2], receiverPrice: money(values[3]), waterCondenser: values[4], waterPrice: money(values[5]), airCondenser: values[6], airPrice: money(values[7]), waterKitPrice: money(values[8]), evaporator: values[9], airKitPrice: money(values[10]), kitParts: values[11], sourceRow: row });
  }
  return { key: `${sheet.name}:${suffix}`, label: suffix === "main" ? "asosiy blok" : "+3 blok", sheetName: sheet.name, startColumn, sourceTitle: title, rows };
}

export async function parseXlsxPriceList(bytes: Uint8Array): Promise<ParsedPriceList> {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(bytes) as never); const blocks: ParsedPriceBlock[] = [];
  workbook.worksheets.forEach((sheet, index) => { blocks.push(parseBlock(sheet, 2, index === 0 ? "main" : `sheet-${index + 1}`)); if (index === 0 && sheet.columnCount >= 26) blocks.push(parseBlock(sheet, 15, "plus-3")); });
  return { version: 1, blocks: blocks.filter(block => block.rows.length) };
}

export function choosePriceBlock(parsed: ParsedPriceList, command: string) { if (/\+\s*3\s*(?:li|lik)|3\s*%\s*(?:li|lik)/iu.test(command)) return parsed.blocks.find(block => block.key.endsWith(":plus-3")) || parsed.blocks[0]; const sheetMatch = command.match(/(?:list|лист)\s*[- ]?(\d+)/iu); if (sheetMatch) return parsed.blocks.find(block => block.key.includes(`sheet-${sheetMatch[1]}`)) || parsed.blocks[Number(sheetMatch[1]) - 1] || parsed.blocks[0]; return parsed.blocks.find(block => block.key.endsWith(":main")) || parsed.blocks[0]; }
export function valueForKind(row: ParsedPriceRow, kind: PriceListKind) { return kind === "compressor" ? row.compressorPrice : kind === "receiver" ? row.receiverPrice : kind === "water" ? row.waterPrice : kind === "air" ? row.airPrice : kind === "water-kit" ? row.waterKitPrice : row.airKitPrice; }

export async function saveActivePriceList(filename: string, bytes: Uint8Array, adminId: string) {
  const parsed = await parseXlsxPriceList(bytes); if (!parsed.blocks.length) throw new Error("PRICE_LIST_STRUCTURE_NOT_FOUND"); const block = parsed.blocks[0];
  return getDb().$transaction(async tx => { await tx.aiPriceList.updateMany({ where: { isActive: true }, data: { isActive: false } }); return tx.aiPriceList.create({ data: { filename, sourceHash: createHash("sha256").update(bytes).digest("hex"), sheetName: block.sheetName, blockKey: block.key, blockLabel: block.label, parsed: parsed as unknown as Prisma.InputJsonValue, createdByAdminId: adminId } }); });
}
export async function getActivePriceList() { const row = await getDb().aiPriceList.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } }); return row ? { ...row, parsed: row.parsed as unknown as ParsedPriceList } : null; }
