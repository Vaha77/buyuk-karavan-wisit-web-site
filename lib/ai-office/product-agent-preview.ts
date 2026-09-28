import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { normalizeSlug, type ProductInput } from "@/lib/products/validation";
import { createProduct, updateProduct } from "@/lib/products/mutations";
import { readSpecifications } from "@/lib/products/mapper";
import { writeAudit } from "@/lib/audit/service";
import type { AdminUser } from "@/generated/prisma/client";

const extractedRowSchema = z.object({
  name: z.string(), brand: z.string(), model: z.string(), sourcePrice: z.string(), currency: z.enum(["USD", "UZS", "UNKNOWN"]),
  sourceLocation: z.string(), confidence: z.number().min(0).max(1), ambiguous: z.boolean(), categoryId: z.string().nullable(),
  shortDescription: z.string(), description: z.string(), tags: z.array(z.string()), seoTitle: z.string(), seoDescription: z.string(),
  specifications: z.array(z.object({ name: z.string(), value: z.string() })),
});
const extractedSchema = z.object({ rows: z.array(extractedRowSchema).max(50), note: z.string() });

export type PreviewStatus = "YANGI" | "MAVJUD — narx o‘zgaradi" | "TEKSHIRING";
export type PreviewRow = z.infer<typeof extractedRowSchema> & {
  id: string; categoryName: string; markupPercent: string; rounding: "none" | "ceil" | "round" | "floor" | "clarify";
  finalPrice: string; status: PreviewStatus; existingProductId: string | null; oldPrice: string | null; slug: string;
  requiredLocalTerms: string[]; seoKeywords: string[]; seoText: string;
};
export type PreviewPayload = { id: string; agentId: "product-agent-01"; adminId: string; sessionId: string; createdAt: number; expiresAt: number; sourceRef: string; rows: PreviewRow[] };

const localTermPatterns = [/mahalliy\s+(?:tilda\s+)?(?:nomi|atamasi)\s*:\s*([^\n,;]+)/giu, /odamlar\s+buni\s+mahalliy\s+tilda\s+shunday\s+deb\s+ataydi\s*:\s*([^\n,;]+)/giu];
export function extractRequiredLocalTerms(message: string) { const terms: string[] = []; for (const pattern of localTermPatterns) for (const match of message.matchAll(pattern)) { const term = match[1].trim(); if (term && !terms.includes(term)) terms.push(term); } return terms; }
export function extractMarkup(message: string) { const match = message.match(/(?:ustama|ustiga)[^\d]{0,20}(\d+(?:[.,]\d+)?)\s*%/iu); return match ? match[1].replace(",", ".") : "0"; }
export function extractRounding(message: string): PreviewRow["rounding"] { if (!/butun\s+dollar/iu.test(message)) return "none"; if (/ceil|yuqoriga/iu.test(message)) return "ceil"; if (/floor|pastga/iu.test(message)) return "floor"; if (/round|yaqin/iu.test(message)) return "round"; return "clarify"; }

function decimalParts(value: string, scale: number) { const normalized = value.trim().replace(/,/g, "."); if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null; const [whole, fraction = ""] = normalized.split("."); const padded = (fraction + "0".repeat(scale)).slice(0, scale); return BigInt(whole) * BigInt(10) ** BigInt(scale) + BigInt(padded || "0"); }
export function calculateFinalPrice(source: string, markup: string, rounding: PreviewRow["rounding"]) {
  const cents = decimalParts(source, 2), basisPoints = decimalParts(markup, 2); if (cents === null || basisPoints === null) return "";
  const numerator = cents * (BigInt(10_000) + basisPoints), denominator = BigInt(10_000);
  let result = (numerator + denominator / BigInt(2)) / denominator;
  if (rounding !== "none" && rounding !== "clarify") { const dollars = result / BigInt(100), remainder = result % BigInt(100); result = (rounding === "ceil" ? dollars + (remainder ? BigInt(1) : BigInt(0)) : rounding === "floor" ? dollars : dollars + (remainder >= BigInt(50) ? BigInt(1) : BigInt(0))) * BigInt(100); }
  return `${result / BigInt(100)}.${String(result % BigInt(100)).padStart(2, "0")}`;
}

function exactTermGate(row: PreviewRow) { for (const term of row.requiredLocalTerms) if (!row.seoKeywords.some(value => value.includes(term)) || !row.seoText.includes(term)) throw new Error(`Required local SEO term missing: "${term}"`); }
function encode(value: unknown) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
export function signPreview(payload: PreviewPayload, sessionTokenHash: string) { const body = encode(payload); return `${body}.${createHmac("sha256", sessionTokenHash).update(body).digest("base64url")}`; }
export function verifyPreview(token: string, adminId: string, sessionId: string, sessionTokenHash: string): PreviewPayload {
  const [body, signature, extra] = token.split("."); if (!body || !signature || extra) throw new Error("PREVIEW_TOKEN_INVALID");
  const expected = createHmac("sha256", sessionTokenHash).update(body).digest(); const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("PREVIEW_TOKEN_INVALID");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewPayload;
  if (payload.adminId !== adminId || payload.sessionId !== sessionId || payload.agentId !== "product-agent-01" || payload.expiresAt < Date.now()) throw new Error("PREVIEW_TOKEN_INVALID");
  return payload;
}

export async function buildProductPreview(args: { message: string; attachments: Array<{ bytes: Uint8Array; mime: string; name: string }>; adminId: string; sessionId: string }) {
  const [categories, products] = await Promise.all([
    getDb().productCategory.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
    getDb().product.findMany({ select: { id: true, name: true, model: true, slug: true, priceUsd: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  const markup = extractMarkup(args.message), rounding = extractRounding(args.message), requiredLocalTerms = extractRequiredLocalTerms(args.message);
  const content: OpenAI.Responses.ResponseInputContent[] = [{ type: "input_text", text: `Admin instruction: ${args.message}\nActive categories: ${JSON.stringify(categories)}\nExtract every explicit product row. Unknown/unclear characters must remain ambiguous=true; never repair OCR guesses. Generate concise Uzbek marketing content but never invent technical facts. categoryId only from active categories. Include each required local term literally in tags and description: ${JSON.stringify(requiredLocalTerms)}.` }];
  for (const file of args.attachments) { const data = Buffer.from(file.bytes).toString("base64"); content.push(file.mime.startsWith("image/") ? { type: "input_image", image_url: `data:${file.mime};base64,${data}`, detail: "high" } : { type: "input_file", file_data: data, filename: file.name }); }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  const response = await client.responses.parse({ model: process.env.OPENAI_PRODUCT_TEXT_MODEL?.trim() || "gpt-4.1-mini", store: false, input: [{ role: "system", content: "You are a strict price-list extraction engine. Return only sourced facts and safe Uzbek catalog copy. Never infer missing technical values." }, { role: "user", content }], text: { format: zodTextFormat(extractedSchema, "product_price_list_preview") } });
  const extracted = response.output_parsed; if (!extracted) throw new Error("EMPTY_PREVIEW");
  const categoryMap = new Map(categories.map(item => [item.id, item.name]));
  const rows: PreviewRow[] = extracted.rows.map((row, index) => {
    const normalizedModel = row.model.trim().toLocaleLowerCase("uz-UZ").replace(/\s+/g, ""); const candidateSlug = normalizeSlug(`${row.name} ${row.model}`);
    const exact = products.filter(product => product.model.trim().toLocaleLowerCase("uz-UZ").replace(/\s+/g, "") === normalizedModel || product.slug === candidateSlug);
    const finalPrice = row.currency === "USD" ? calculateFinalPrice(row.sourcePrice, markup, rounding) : "";
    const ambiguousDuplicate = exact.length > 1; const existing = exact.length === 1 ? exact[0] : null;
    const checking = row.ambiguous || row.confidence < .78 || !row.name.trim() || !row.brand.trim() || !row.model.trim() || !row.categoryId || !categoryMap.has(row.categoryId) || row.currency !== "USD" || !finalPrice || rounding === "clarify" || ambiguousDuplicate;
    const seoKeywords = [...new Set([...row.tags, ...requiredLocalTerms])]; const seoText = requiredLocalTerms.reduce((text, term) => text.includes(term) ? text : `${text}\n${term}`.trim(), row.description);
    return { ...row, id: `row-${index + 1}`, categoryName: row.categoryId ? categoryMap.get(row.categoryId) || "" : "", markupPercent: markup, rounding, finalPrice, status: checking ? "TEKSHIRING" : existing ? "MAVJUD — narx o‘zgaradi" : "YANGI", existingProductId: existing?.id || null, oldPrice: existing?.priceUsd?.toString() || null, slug: existing?.slug || candidateSlug, requiredLocalTerms, seoKeywords, seoText };
  });
  const sourceRef = createHash("sha256").update(args.attachments.map(file => `${file.name}:${file.bytes.byteLength}:${createHash("sha256").update(file.bytes).digest("hex")}`).join("|")).digest("hex").slice(0, 24);
  return { payload: { id: randomUUID(), agentId: "product-agent-01", adminId: args.adminId, sessionId: args.sessionId, createdAt: Date.now(), expiresAt: Date.now() + 30 * 60_000, sourceRef, rows } satisfies PreviewPayload, note: extracted.note };
}

function inputFromRow(row: PreviewRow, existing?: { specifications: unknown; tags: string[]; availability: string; isVisible: boolean; order: number; name: string; brand: string; model: string; shortDescription: string | null; description: string | null; seoTitle: string | null; seoDescription: string | null }) : ProductInput {
  const oldSpecs = existing ? readSpecifications(existing.specifications).rows : [];
  const sourcedSpecs = row.specifications.map((spec, index) => ({ id: `agent-spec-${index + 1}`, ...spec }));
  const sourcedNames = new Set(sourcedSpecs.map(spec => spec.name.trim().toLocaleLowerCase("uz-UZ")));
  const specifications = existing ? [...oldSpecs.filter(spec => !sourcedNames.has(spec.name.trim().toLocaleLowerCase("uz-UZ"))), ...sourcedSpecs] : sourcedSpecs;
  return { name: row.name || existing?.name || "", brand: row.brand || existing?.brand || "", model: row.model || existing?.model || "", slug: row.slug, categoryId: row.categoryId || "", priceUsd: row.finalPrice, shortDescription: row.shortDescription || existing?.shortDescription || "", description: row.seoText || existing?.description || "", specifications, tags: row.seoKeywords.length ? row.seoKeywords : existing?.tags || [], availability: existing?.availability === "ORDER" ? "order" : "available", isVisible: existing?.isVisible ?? false, order: existing?.order ?? 1, seoTitle: row.seoTitle || existing?.seoTitle || "", seoDescription: row.seoDescription || existing?.seoDescription || "" };
}

export async function confirmProductPreview(payload: PreviewPayload, actor: Pick<AdminUser, "id" | "name">) {
  const claimed = await getDb().auditLog.findFirst({ where: { action: "AI_PREVIEW_CONFIRMED", entityType: "AI_AGENT", entityId: payload.id } }); if (claimed) throw new Error("PREVIEW_ALREADY_CONFIRMED");
  await writeAudit(actor, { action: "AI_PREVIEW_CONFIRMED", entityType: "AI_AGENT", entityId: payload.id, entityName: "Mahsulot agenti 01", summary: "AI mahsulot preview tasdiqlandi", metadata: { agentId: payload.agentId, sourceRef: payload.sourceRef, rowCount: payload.rows.length } });
  const results: Array<{ name: string; model: string; action: "CREATE" | "UPDATE" | "SKIP" | "FAIL"; price: string; productId?: string; link?: string; error?: string }> = [];
  for (const row of payload.rows) {
    try {
      if (row.status === "TEKSHIRING") { results.push({ name: row.name, model: row.model, action: "SKIP", price: row.finalPrice, error: "TEKSHIRING qatori yozilmadi." }); continue; }
      if (row.currency !== "USD" || row.ambiguous || row.confidence < .78 || row.rounding === "clarify" || calculateFinalPrice(row.sourcePrice, row.markupPercent, row.rounding) !== row.finalPrice) throw new Error("Preview narx/provenance tekshiruvidan o‘tmadi.");
      exactTermGate(row);
      const category = await getDb().productCategory.findFirst({ where: { id: row.categoryId || "", isActive: true }, select: { id: true } }); if (!category) throw new Error("Kategoriya mavjud emas.");
      const current = row.existingProductId ? await getDb().product.findUnique({ where: { id: row.existingProductId } }) : null;
      if (row.status === "MAVJUD — narx o‘zgaradi" && !current) throw new Error("Mavjud mahsulot topilmadi.");
      if (!current) { const catalog = await getDb().product.findMany({ select: { id: true, model: true, slug: true } }); const normalizedModel = row.model.trim().toLocaleLowerCase("uz-UZ").replace(/\s+/g, ""); if (catalog.some(item => item.slug === row.slug || item.model.trim().toLocaleLowerCase("uz-UZ").replace(/\s+/g, "") === normalizedModel)) throw new Error("Tasdiqlash vaqtida duplicate mahsulot aniqlandi."); }
      const input = inputFromRow(row, current || undefined);
      const saved = current ? await updateProduct(current.id, input) : await createProduct(input, []);
      const action = current ? "UPDATE" as const : "CREATE" as const;
      await writeAudit(actor, { action: `AI_${action}`, entityType: "PRODUCT", entityId: saved.id, entityName: saved.name, summary: `Mahsulot agenti ${action}`, metadata: { agentId: payload.agentId, previewId: payload.id, sourceRef: payload.sourceRef, oldPrice: current?.priceUsd?.toString() || null, sourcePrice: row.sourcePrice, markupPercent: row.markupPercent, rounding: row.rounding, finalPrice: row.finalPrice, currency: row.currency, requiredLocalTerms: row.requiredLocalTerms, changedFields: Object.keys(input) } });
      results.push({ name: row.name, model: row.model, action, price: row.finalPrice, productId: saved.id, link: `/admin/products/${saved.id}/edit` });
    } catch (error) { const reason = error instanceof Error ? error.message : "Noma’lum xato"; await writeAudit(actor, { action: "AI_FAIL", entityType: "AI_AGENT", entityId: payload.id, entityName: row.name, summary: "Mahsulot agenti qatori bajarilmadi", metadata: { agentId: payload.agentId, sourceRef: payload.sourceRef, model: row.model, reason } }).catch(() => undefined); results.push({ name: row.name, model: row.model, action: "FAIL", price: row.finalPrice, error: reason }); }
  }
  return results;
}
