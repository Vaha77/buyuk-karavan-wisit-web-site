import "server-only";
import OpenAI, { APIError } from "openai";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { z } from "zod";
import type { AdminUser } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit/service";
import { chatReplyClaimsWrite } from "./product-agent-rules";

export const PRODUCT_AGENT_ALLOWED_TOOLS = new Set([
  "readUpload", "getActivePriceList", "listCategories", "findProducts", "previewDraft", "createCategory", "createProduct", "updateProduct",
] as const);

export type ProductAgentTool = "readUpload" | "getActivePriceList" | "listCategories" | "findProducts" | "previewDraft" | "createCategory" | "createProduct" | "updateProduct";
export type ProductAgentStatus = "idle" | "reading" | "analyzing" | "awaiting_confirmation" | "writing" | "success" | "error";

export const PRODUCT_AGENT_FIELD_CAPABILITIES = {
  name: "Product.name", brand: "Product.brand", model: "Product.model", categoryId: "Product.categoryId",
  priceUsd: "Product.priceUsd (USD; existing currency preview converts to UZS)", shortDescription: "Product.shortDescription",
  description: "Product.description", specifications: "Product.specifications.rows", tags: "Product.tags + cardSpecs",
  availability: "Product.availability", isVisible: "Product.isVisible", order: "Product.order", slug: "Product.slug",
  seoTitle: "Product.seoTitle", seoDescription: "Product.seoDescription",
  images: "Intentionally unavailable to Product Agent; Photo Agent owns media",
  asset360: "Intentionally unavailable to Product Agent; Photo Agent owns media",
} as const;

const messageSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(5000) });
export const productAgentRequestSchema = z.object({ message: z.string().trim().min(1).max(5000), history: z.array(messageSchema).max(20) });

const OFF_DOMAIN = /(?:rasm(?:ni|ini)?\s+.*(?:qo['‘’]?y|joyla|biriktir)|rasm\s*(?:yarat|generat|qil)|dizayn|sayt\s*(?:ui|dizayn)|\blid\b|\bcrm\b|hisob-kitob|reklama|telegram|foto\s*agent|image\s*generation)/iu;
export const isProductAgentOffDomain = (message: string) => OFF_DOMAIN.test(message);
export const PRODUCT_AGENT_REFUSAL = "Uzr, men faqat mahsulot qo‘shish va narx yangilash bilan ishlayman. Rasm uchun Foto agentga murojaat qiling.";

export const PRODUCT_AGENT_SYSTEM_INSTRUCTION = `Sen BUYUK KARAVAN admin panelidagi “Mahsulot agenti 01”san. Faqat o‘zbek tilida javob ber. Mahsulot katalogi uchun ma’lumotlarni tushuntir, tavsif/description va maydonlarni tayyorlashga yordam ber. “Tavsif yoz”, “description yoz” va “o‘zing to‘ldir” sening vazifang hisoblanadi. Hech qachon mahsulot yoki kategoriya yaratildi, yangilandi, bazaga yozildi deb aytma; ID yoki DB natijasini uydirma. Oddiy chat faqat maslahat beradi. Real natija faqat strukturali preview va serverdagi Tasdiqlash actionidan keyin ko‘rsatiladi.

HECH QACHON texnik parametr o‘ylab topma yoki model nomidan xulosa qilma. HP, kW, voltage, refrigerant, temperature, cylinder count, displacement, capacity, dimensions, weight va boshqa texnik qiymatlarni faqat foydalanuvchi xabarida yoki biriktirilgan manbada aniq bo‘lsa ishlat; aks holda bo‘sh qoldir. Internetdan qidirmagin. Images, gallery, 360 va media doim bo‘sh/saqlanganicha qolsin. Ushbu bosqichda DB yozuvi yo‘q: faqat draft/preview tayyorla va tasdiq so‘ra. Mavjud form maydonlari: ${Object.keys(PRODUCT_AGENT_FIELD_CAPABILITIES).join(", ")}.`;

export class ProductAgentUploadError extends Error {}
export class ProductAgentProviderError extends Error {}

const allowedMime = new Set([
  "image/jpeg", "image/png", "image/webp", "text/csv", "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export const PRODUCT_AGENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const PRODUCT_AGENT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const PRODUCT_AGENT_MAX_FILES = 4;

export function sanitizeProductAgentFilename(value: string) {
  const base = value.normalize("NFKC").replace(/[\\/\0-\x1f\x7f]+/g, "-").replace(/[^\p{L}\p{N}._ -]+/gu, "-").replace(/\.{2,}/g, ".").trim();
  return (base || "upload").slice(0, 120);
}

function has(bytes: Uint8Array, values: number[], offset = 0) { return values.every((value, index) => bytes[offset + index] === value); }
function actualType(mime: string, bytes: Uint8Array) {
  if (mime === "image/jpeg") return has(bytes, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") return has(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (mime === "application/pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (mime === "text/csv") return !bytes.slice(0, 1024).includes(0);
  const zip = has(bytes, [0x50, 0x4b, 0x03, 0x04]);
  const headers = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 250_000)));
  if (mime.includes("spreadsheetml")) return zip && headers.includes("xl/");
  if (mime.includes("wordprocessingml")) return zip && headers.includes("word/");
  return false;
}

export async function validateProductAgentUploads(files: File[]) {
  if (files.length > PRODUCT_AGENT_MAX_FILES) throw new ProductAgentUploadError(`Ko‘pi bilan ${PRODUCT_AGENT_MAX_FILES} ta fayl biriktiring.`);
  if (files.reduce((sum, file) => sum + file.size, 0) > PRODUCT_AGENT_MAX_TOTAL_BYTES) throw new ProductAgentUploadError("Fayllarning umumiy hajmi 20 MB dan oshmasin.");
  return Promise.all(files.map(async (file) => {
    if (!(file instanceof File) || !allowedMime.has(file.type)) throw new ProductAgentUploadError("Fayl turi qo‘llab-quvvatlanmaydi.");
    if (!file.size || file.size > PRODUCT_AGENT_MAX_FILE_BYTES) throw new ProductAgentUploadError("Har bir fayl 10 MB dan oshmasin.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!actualType(file.type, bytes)) throw new ProductAgentUploadError("Faylning haqiqiy formati MIME turiga mos emas.");
    return { bytes, mime: file.type, name: sanitizeProductAgentFilename(file.name) };
  }));
}

export async function rejectUnauthorizedProductAgentTool(tool: string, actor: Pick<AdminUser, "id" | "name">) {
  if (PRODUCT_AGENT_ALLOWED_TOOLS.has(tool as ProductAgentTool)) return;
  await writeAudit(actor, { action: "AI_TOOL_DENIED", entityType: "AI_AGENT", entityId: "product-agent-01", entityName: "Mahsulot agenti 01", summary: "Ruxsatsiz AI tool chaqiruvi bloklandi", metadata: { requestedTool: tool } });
  throw new Error("PRODUCT_AGENT_TOOL_NOT_ALLOWED");
}

export async function runProductAgentChat(input: z.infer<typeof productAgentRequestSchema>, files: Awaited<ReturnType<typeof validateProductAgentUploads>>) {
  if (isProductAgentOffDomain(input.message)) return { reply: PRODUCT_AGENT_REFUSAL, status: "idle" as ProductAgentStatus };
  if (!process.env.OPENAI_API_KEY) throw new ProductAgentProviderError("OPENAI_NOT_CONFIGURED");
  const content: ResponseInputContent[] = [{ type: "input_text", text: input.message }];
  for (const file of files) {
    const data = Buffer.from(file.bytes).toString("base64");
    if (file.mime.startsWith("image/")) content.push({ type: "input_image", image_url: `data:${file.mime};base64,${data}`, detail: "auto" });
    else content.push({ type: "input_file", file_data: data, filename: file.name });
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 1 });
  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_PRODUCT_TEXT_MODEL?.trim() || "gpt-4.1-mini", store: false,
      input: [{ role: "system", content: PRODUCT_AGENT_SYSTEM_INSTRUCTION }, ...input.history, { role: "user", content }],
    });
    const reply = response.output_text.trim();
    if (!reply) throw new ProductAgentProviderError("EMPTY_AI_OUTPUT");
    return { reply: chatReplyClaimsWrite(reply) ? "Mahsulot hali yaratilmagan. Model, tur va narxni yuboring — men strukturali preview tayyorlayman; yozish faqat Tasdiqlash tugmasidan keyin bajariladi." : reply, status: "idle" as ProductAgentStatus };
  } catch (error) {
    if (error instanceof APIError) console.error("Product Agent OpenAI error", { status: error.status, code: error.code, type: error.type, message: error.message });
    throw error;
  }
}
