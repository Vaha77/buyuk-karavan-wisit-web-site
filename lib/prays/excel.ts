// Reads price workbooks for the Prays import. No "server-only": the tests parse the sample Bitzer file directly.
import ExcelJS from "exceljs";
import type { ParsedPriceRow } from "../ai-office/price-list-parser";
import { detectBrand, detectFreon, parseListDate } from "./rules";

/** A supplier price list (Bitzer / XUEYING / Briliant): one row per compressor model, columns per assembly. */
export type PriceListSheet = { kind: "price-list"; sheetName: string; title: string; brand: string | null; freon: string | null; listDate: Date | null; rows: ParsedPriceRow[] };
/** Our own "Excel yuklab olish" file read back: rows by ID (products) or by name/size (workshop parts). */
export type TableRow = { id: string | null; name: string; size: string | null; group: string | null; unit: string | null; base: number | null; sourceRow: number };
export type TableSheet = { kind: "products-table" | "parts-table"; sheetName: string; rows: TableRow[] };
export type PriceSheet = PriceListSheet | TableSheet;

export function cellText(value: ExcelJS.CellValue | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map(part => part.text).join("").replace(/\s+/g, " ").trim();
    if ("text" in value) return String(value.text).trim();
    return "";
  }
  return String(value).replace(/\s+/g, " ").trim();
}
/** "$1 091", "1091,50" → 1091 / 1091.5; anything else → null. */
export function moneyValue(text: string) {
  const cleaned = text.replace(/[$\s ]/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 ? value : null;
}

function value(sheet: ExcelJS.Worksheet, row: number, column: number) {
  const cell = sheet.getCell(row, column);
  return cellText(cell.isMerged ? cell.master.value : cell.value);
}
function rowTexts(sheet: ExcelJS.Worksheet, row: number) {
  return Array.from({ length: Math.max(sheet.columnCount, 1) }, (_, index) => value(sheet, row, index + 1));
}

// Column headers of a supplier price list, as written in the Bitzer/XUEYING files (with spelling variants).
const PRICE_LIST_COLUMNS: Array<[keyof Omit<ParsedPriceRow, "model" | "freon" | "sourceRow">, RegExp]> = [
  ["waterKitPrice", /^v[ao]d[iy]?n[oa]y\s*agregat\s*komplekt/i],
  ["airKitPrice", /^v[ao][zs]dush\S*\s*agregat\s*komplekt/i],
  ["kitParts", /komplekt\s*qism/i],
  ["evaporator", /isparitel/i],
  ["receiverPrice", /^r\s*\/\s*b\s*ustida/i],
  ["receiverLiters", /^r\s*\/\s*b$/i],
  ["waterCondenser", /^v[ao]d[iy]?n[oa]y\s*kondensator/i],
  ["waterPrice", /^v[ao]d[iy]?n[oa]y\s*agregat/i],
  ["airCondenser", /^v[ao][zs]dush\S*\s*kondensator/i],
  ["airPrice", /^v[ao][zs]dush\S*\s*agregat/i],
  ["compressorPrice", /^kompressor$/i],
];
const MONEY_FIELDS = new Set(["compressorPrice", "receiverPrice", "waterPrice", "airPrice", "waterKitPrice", "airKitPrice"]);

function readPriceList(sheet: ExcelJS.Worksheet): PriceListSheet | null {
  let header = 0;
  for (let row = 1; row <= Math.min(12, sheet.rowCount); row++) if (rowTexts(sheet, row).some(text => /^kompressor$/i.test(text))) { header = row; break; }
  if (!header) return null;
  const headers = rowTexts(sheet, header);
  const columns = new Map<string, number>();
  headers.forEach((text, index) => {
    const match = PRICE_LIST_COLUMNS.find(([key, pattern]) => !columns.has(key) && pattern.test(text));
    if (match) columns.set(match[0], index + 1);
  });
  const compressorColumn = columns.get("compressorPrice")!;
  // The model sits left of "Kompressor" ("Bitzer turi" / "Model").
  const modelColumn = headers.findIndex(text => /turi|model/i.test(text)) + 1 || compressorColumn - 1;
  if (modelColumn < 1) return null;
  const title = Array.from({ length: header - 1 }, (_, index) => rowTexts(sheet, index + 1).find(Boolean) ?? "").filter(Boolean).join(" · ");
  const context = `${title} ${headers[modelColumn - 1]}`;
  const freon = detectFreon(context);
  const rows: ParsedPriceRow[] = [];
  for (let row = header + 1; row <= sheet.rowCount; row++) {
    const model = value(sheet, row, modelColumn);
    if (!model || /^(?:jami|izoh)/i.test(model)) continue;
    const read = (key: string) => { const column = columns.get(key); if (!column) return ""; const text = value(sheet, row, column); return MONEY_FIELDS.has(key) ? (moneyValue(text)?.toString() ?? "") : text; };
    const parsed: ParsedPriceRow = { model, freon: detectFreon(model) ?? freon ?? "", compressorPrice: read("compressorPrice"), receiverLiters: read("receiverLiters"), receiverPrice: read("receiverPrice"), waterCondenser: read("waterCondenser"), waterPrice: read("waterPrice"), airCondenser: read("airCondenser"), airPrice: read("airPrice"), waterKitPrice: read("waterKitPrice"), evaporator: read("evaporator"), airKitPrice: read("airKitPrice"), kitParts: read("kitParts"), sourceRow: row };
    if ([...MONEY_FIELDS].some(key => parsed[key as keyof ParsedPriceRow])) rows.push(parsed);
  }
  return { kind: "price-list", sheetName: sheet.name, title, brand: detectBrand(context), freon, listDate: parseListDate(title), rows };
}

function readTable(sheet: ExcelJS.Worksheet): TableSheet | null {
  let header = 0;
  for (let row = 1; row <= Math.min(5, sheet.rowCount); row++) { const texts = rowTexts(sheet, row); if (texts.some(text => /^nomi$/i.test(text)) && texts.some(text => /prays\s*narxi/i.test(text))) { header = row; break; } }
  if (!header) return null;
  const headers = rowTexts(sheet, header);
  const find = (pattern: RegExp) => headers.findIndex(text => pattern.test(text)) + 1;
  const column = { id: find(/^id$/i), name: find(/^nomi$/i), size: find(/o.?lcham/i), group: find(/^guruh/i), unit: find(/^birlik/i), base: find(/prays\s*narxi/i) };
  const kind = column.group ? "parts-table" : "products-table";
  const rows: TableRow[] = [];
  for (let row = header + 1; row <= sheet.rowCount; row++) {
    const read = (index: number) => (index ? value(sheet, row, index) : "");
    const name = read(column.name);
    if (!name) continue;
    rows.push({ id: read(column.id) || null, name, size: read(column.size) || null, group: read(column.group) || null, unit: read(column.unit) || null, base: moneyValue(read(column.base)), sourceRow: row });
  }
  return { kind, sheetName: sheet.name, rows };
}

export async function readPriceWorkbook(bytes: Uint8Array): Promise<PriceSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as never);
  return workbook.worksheets.map(sheet => readTable(sheet) ?? readPriceList(sheet)).filter((sheet): sheet is PriceSheet => !!sheet && sheet.rows.length > 0);
}
