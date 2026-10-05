import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ParsedPriceRow } from "@/lib/ai-office/price-list-parser";
import type { PriceListSheet } from "./excel";
import { detectBrand, detectFreon, parseListDate } from "./rules";

export class PriceImageError extends Error {}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const PRICE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

// Same columns as the supplier Excel price lists (lib/ai-office/price-list-parser.ts → ParsedPriceRow).
const cell = z.string().max(80);
const extractedSchema = z.object({
  title: z.string().max(300),
  rows: z.array(z.object({ model: z.string().max(60), compressorPrice: cell, receiverLiters: cell, receiverPrice: cell, waterCondenser: cell, waterPrice: cell, airCondenser: cell, airPrice: cell, waterKitPrice: cell, evaporator: cell, airKitPrice: cell })).max(120),
});

const money = (text: string) => { const cleaned = text.replace(/[$\s]/g, "").replace(",", "."); return /^\d+(?:\.\d{1,2})?$/.test(cleaned) ? cleaned : ""; };

/** A photo/screenshot of a supplier price list → the same structure an Excel import produces. */
export async function readPriceImage(file: File): Promise<PriceListSheet> {
  if (!IMAGE_TYPES.has(file.type)) throw new PriceImageError("Faqat JPG, PNG yoki WEBP rasm yuklang.");
  if (!file.size || file.size > PRICE_IMAGE_MAX_BYTES) throw new PriceImageError("Rasm 10 MB dan oshmasin.");
  if (!process.env.OPENAI_API_KEY) throw new PriceImageError("AI sozlanmagan (OPENAI_API_KEY yo‘q).");
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  const response = await client.responses.parse({
    model: process.env.OPENAI_PRODUCT_TEXT_MODEL?.trim() || "gpt-4.1",
    store: false,
    input: [
      { role: "system", content: "You are a strict price-list table reader. Copy cell values exactly as printed; leave a cell empty when it is empty or unreadable. Never guess numbers." },
      { role: "user", content: [
        { type: "input_text", text: "Read this refrigeration compressor price list. `title` = the heading above the table (date, brand, refrigerant). One row per compressor model. Columns: model (e.g. \"2FES+3\", \"BR +20PG\"), compressorPrice (Kompressor), receiverLiters (R/B, e.g. \"8л\"), receiverPrice (R/B ustida), waterCondenser (Vodinoy kondensator, e.g. \"3HP\"), waterPrice (Vodinoy agregat), airCondenser (Vozdushniy kondensator, e.g. \"FN22\"), airPrice (Vozdushniy agregat), waterKitPrice (Vodinoy agregat komplekt), evaporator (Isparitel, e.g. \"DD22\"), airKitPrice (Vozdushniy agregat komplekt). Prices are USD numbers without symbols." },
        { type: "input_image", image_url: `data:${file.type};base64,${data}`, detail: "high" },
      ] },
    ],
    text: { format: zodTextFormat(extractedSchema, "price_list_table") },
  });
  const parsed = response.output_parsed;
  if (!parsed?.rows.length) throw new PriceImageError("Rasmdan prays jadvali o‘qilmadi.");
  const freon = detectFreon(parsed.title);
  const rows: ParsedPriceRow[] = parsed.rows.map((row, index) => ({ model: row.model.trim(), freon: freon ?? "", compressorPrice: money(row.compressorPrice), receiverLiters: row.receiverLiters, receiverPrice: money(row.receiverPrice), waterCondenser: row.waterCondenser, waterPrice: money(row.waterPrice), airCondenser: row.airCondenser, airPrice: money(row.airPrice), waterKitPrice: money(row.waterKitPrice), evaporator: row.evaporator, airKitPrice: money(row.airKitPrice), kitParts: "", sourceRow: index + 1 }));
  return { kind: "price-list", sheetName: file.name, title: parsed.title, brand: detectBrand(parsed.title), freon, listDate: parseListDate(parsed.title), rows: rows.filter(row => row.model) };
}
