import "server-only";

import { createHash, randomUUID } from "node:crypto";
import OpenAI, { APIError } from "openai";
import type { ResponseInput, Tool } from "openai/resources/responses/responses";
import { z } from "zod";
import type { AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { normalizeSlug } from "@/lib/products/validation";
import { chatReplyClaimsWrite, normalizeMoney2, unsupportedTechnicalTokens } from "./product-agent-rules";
import { getActivePriceList, normalizePriceModel, valueForKind, type PriceListKind } from "./price-list-parser";
import { rejectUnauthorizedProductAgentTool, ProductAgentProviderError, type ProductAgentStatus } from "./product-agent";
import type { PreviewPayload, PreviewRow } from "./product-agent-preview";

const MAX_TOOL_STEPS = 6;
const DEFAULT_MODEL = "gpt-4.1";
const FORBIDDEN_CLAIMS = /yuqori sifatli|eng yaxshi|tejamkor|maishiy|uzoq xizmat qiladi|ishonchli/iu;

export const PRODUCT_AGENT_TOOL_NAMES = ["listCategories", "findProducts", "lookupPriceList", "proposeCategory", "buildProductDraft"] as const;
type AgentToolName = (typeof PRODUCT_AGENT_TOOL_NAMES)[number];

const kindSchema = z.enum(["compressor", "receiver", "water", "air", "water-kit", "air-kit"]);
const draftSchema = z.object({
  name: z.string().trim().min(2).max(180),
  brand: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(120),
  categoryIdOrNewName: z.string().trim().min(1).max(160),
  priceUsd: z.string().trim().min(1).max(30),
  shortDescription: z.string().trim().min(20).max(300),
  description: z.string().trim().min(80).max(5000),
  specifications: z.array(z.object({ name: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(300) })).max(40),
  tags: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  slug: z.string().trim().min(2).max(180),
  availability: z.enum(["available", "order"]),
  isVisible: z.boolean(),
  seoTitle: z.string().trim().min(20).max(180),
  seoDescription: z.string().trim().min(80).max(500),
  requiredSeoTerms: z.array(z.string().trim().min(1).max(80)).max(20),
});
type DraftInput = z.infer<typeof draftSchema>;

const tools: Tool[] = [
  { type: "function", name: "listCategories", description: "Faol mahsulot kategoriyalarini qaytaradi.", strict: true, parameters: { type: "object", properties: {}, required: [], additionalProperties: false } },
  { type: "function", name: "findProducts", description: "Nom, brend yoki model bo'yicha mavjud mahsulotlarni topadi.", strict: true, parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { type: "function", name: "lookupPriceList", description: "Faol price listdan model va mahsulot turi bo'yicha narx hamda texnik faktlarni deterministik oladi. Raqamlarni o'zingiz o'qimang.", strict: true, parameters: { type: "object", properties: { model: { type: "string" }, kind: { type: "string", enum: kindSchema.options }, block: { type: ["string", "null"] } }, required: ["model", "kind", "block"], additionalProperties: false } },
  { type: "function", name: "proposeCategory", description: "Yangi kategoriyani faqat draft sifatida taklif qiladi; bazaga yozmaydi.", strict: true, parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } },
  { type: "function", name: "buildProductDraft", description: "Barcha maydonlari to'ldirilgan mahsulot preview draftini quradi. Bazaga yozmaydi.", strict: true, parameters: { type: "object", properties: {
    name: { type: "string" }, brand: { type: "string" }, model: { type: "string" }, categoryIdOrNewName: { type: "string" }, priceUsd: { type: "string" }, shortDescription: { type: "string" }, description: { type: "string" },
    specifications: { type: "array", items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } }, required: ["name", "value"], additionalProperties: false } },
    tags: { type: "array", items: { type: "string" } }, slug: { type: "string" }, availability: { type: "string", enum: ["available", "order"] }, isVisible: { type: "boolean" }, seoTitle: { type: "string" }, seoDescription: { type: "string" }, requiredSeoTerms: { type: "array", items: { type: "string" } },
  }, required: ["name", "brand", "model", "categoryIdOrNewName", "priceUsd", "shortDescription", "description", "specifications", "tags", "slug", "availability", "isVisible", "seoTitle", "seoDescription", "requiredSeoTerms"], additionalProperties: false } },
];

export const PRODUCT_AGENT_TOOL_SYSTEM_PROMPT = `Sen BUYUK KARAVAN admin panelidagi Mahsulot agentisan. Foydalanuvchi odatda telefondan qisqa, xalqona va imlo xatoli yozadi.
Barcha mahsulot maydonlarini O'ZING to'ldir. Brend/modelni findProducts bilan mavjud mahsulotlardan top; topilmasa foydalanuvchi bergan faktlardan foydalan. Kategoriyalarni listCategories bilan tekshir, mos kategoriya bo'lmasa proposeCategory bilan yangisini taklif qil. Tavsif va SEO'ni o'zbekcha, faqat foydalanuvchi, mavjud mahsulot yoki lookupPriceList bergan faktlardan yoz. Texnik raqamlarni hech qachon taxmin qilma.
Narx xabarda aniq bo'lsa uni ishlat. Narx yo'q bo'lsa lookupPriceList ishlat. Foiz/ustama aytilgan bo'lsa price-list narxiga decimal-safe hisoblab yakuniy narxni buildProductDraftga ikki kasr bilan ber. Savol faqat narx umuman topilmasa beriladi; ko'pi bilan bitta savol. "Tavsifni o'zing yoz" va shunga o'xshash topshiriqlar sening ishing, rad etma.
Har bir mahsulot buyrug'ida buildProductDraft chaqir. buildProductDraft faqat preview yaratadi. "Yaratildi", ID yoki DB natijasini hech qachon o'ylab topma. Baza haqida muvaffaqiyat da'vosi qilma.`;

type LookupEvidence = { model: string; kind: PriceListKind; price: string; blockKey: string; blockLabel: string; sheetName: string; sourceRow: number; facts: Record<string, string> };

function safeJson(value: unknown) { return JSON.stringify(value); }
function parseArguments(value: string) { try { return JSON.parse(value) as unknown; } catch { throw new Error("TOOL_ARGUMENTS_INVALID"); } }
function selectBlock(active: Awaited<ReturnType<typeof getActivePriceList>>, requested: string | null) {
  if (!active) return undefined;
  if (!requested?.trim()) return active.parsed.blocks.find(block => block.key === active.blockKey) || active.parsed.blocks[0];
  const needle = requested.toLocaleLowerCase("uz-UZ").trim();
  return active.parsed.blocks.find(block => [block.key, block.label, block.sheetName].some(value => value.toLocaleLowerCase("uz-UZ").includes(needle)));
}

async function makePreview(args: { draft: DraftInput; adminId: string; sessionId: string; sourceText: string; evidence: LookupEvidence[] }): Promise<PreviewPayload> {
  const { draft } = args;
  const price = normalizeMoney2(draft.priceUsd);
  if (!price) throw new Error("Narx USD formatida va ko'pi bilan 2 kasrli bo'lishi kerak.");
  if (FORBIDDEN_CLAIMS.test(`${draft.shortDescription} ${draft.description} ${draft.seoTitle} ${draft.seoDescription}`)) throw new Error("Tasdiqlanmagan marketing da'vosi ishlatilgan.");
  for (const term of draft.requiredSeoTerms) if (!draft.tags.some(tag => tag.toLocaleLowerCase("uz-UZ").includes(term.toLocaleLowerCase("uz-UZ"))) || !`${draft.seoTitle} ${draft.seoDescription}`.toLocaleLowerCase("uz-UZ").includes(term.toLocaleLowerCase("uz-UZ"))) throw new Error(`Majburiy SEO ibora yetishmaydi: ${term}`);
  const evidenceText = `${args.sourceText}\n${safeJson(args.evidence)}`;
  const unsupported = unsupportedTechnicalTokens(draft.specifications, evidenceText);
  if (unsupported.length) throw new Error(`Manbasiz texnik qiymatlar: ${[...new Set(unsupported)].join(", ")}`);

  const categories = await getDb().productCategory.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  const category = categories.find(item => item.id === draft.categoryIdOrNewName || item.name.toLocaleLowerCase("uz-UZ") === draft.categoryIdOrNewName.toLocaleLowerCase("uz-UZ"));
  const existing = await getDb().product.findFirst({ where: { categoryId: category?.id || "__new__", model: { equals: draft.model, mode: "insensitive" } }, select: { id: true, priceUsd: true, slug: true } });
  const latest = [...args.evidence].reverse().find(item => normalizePriceModel(item.model) === normalizePriceModel(draft.model));
  const row: PreviewRow = {
    id: "row-1", name: draft.name, brand: draft.brand, model: draft.model, sourcePrice: latest?.price || price, currency: "USD", sourceLocation: latest ? `${latest.sheetName}, ${latest.blockLabel}, ${latest.sourceRow}-qator` : "Admin xabari",
    confidence: 1, ambiguous: false, categoryId: category?.id || null, categoryName: category?.name || draft.categoryIdOrNewName, shortDescription: draft.shortDescription, description: draft.description,
    tags: draft.tags, seoTitle: draft.seoTitle, seoDescription: draft.seoDescription, specifications: draft.specifications, markupPercent: latest && latest.price !== price ? "hisoblangan" : "0", rounding: "none", finalPrice: price,
    status: existing ? ("MAVJUD — narx o‘zgaradi" as PreviewRow["status"]) : "YANGI", existingProductId: existing?.id || null, oldPrice: existing?.priceUsd?.toString() || null,
    slug: existing?.slug || normalizeSlug(draft.slug), requiredLocalTerms: draft.requiredSeoTerms, seoKeywords: [...new Set([...draft.tags, ...draft.requiredSeoTerms])], seoText: draft.description,
    newCategoryName: category ? null : draft.categoryIdOrNewName, productKind: latest?.kind, priceListId: latest ? "active" : undefined, sourceBlock: latest?.blockKey,
    priceSource: "direct", directPrice: price,
  };
  const now = Date.now();
  return { id: randomUUID(), agentId: "product-agent-01", adminId: args.adminId, sessionId: args.sessionId, createdAt: now, expiresAt: now + 30 * 60_000, sourceRef: createHash("sha256").update(evidenceText).digest("hex").slice(0, 24), rows: [row] };
}

export async function runProductAgentLoop(args: { message: string; history: Array<{ role: "user" | "assistant"; content: string }>; adminId: string; sessionId: string; actor: Pick<AdminUser, "id" | "name"> }) {
  if (!process.env.OPENAI_API_KEY) throw new ProductAgentProviderError("OPENAI_NOT_CONFIGURED");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  const input: ResponseInput = [{ role: "system", content: PRODUCT_AGENT_TOOL_SYSTEM_PROMPT }, ...args.history, { role: "user", content: args.message }];
  const evidence: LookupEvidence[] = [];
  let payload: PreviewPayload | undefined;
  let callsUsed = 0;
  try {
    while (callsUsed < MAX_TOOL_STEPS && !payload) {
      const response = await client.responses.create({ model: process.env.OPENAI_PRODUCT_AGENT_MODEL?.trim() || DEFAULT_MODEL, store: false, input, tools, tool_choice: "auto" });
      input.push(...response.output as unknown as ResponseInput);
      const calls = response.output.filter(item => item.type === "function_call");
      if (!calls.length) {
        const reply = response.output_text.trim();
        const safeReply = chatReplyClaimsWrite(reply) ? "Hali bazaga hech narsa yozilmadi. Mahsulotni preview orqali tayyorlashim uchun narxni USDda yozing." : reply || "Narxni USDda yozing.";
        return { reply: safeReply, status: "idle" as ProductAgentStatus, question: { text: safeReply, options: [] } };
      }
      for (const call of calls) {
        callsUsed += 1;
        if (callsUsed > MAX_TOOL_STEPS) break;
        const name = call.name as AgentToolName;
        await rejectUnauthorizedProductAgentTool(name, args.actor);
        let output: unknown;
        try {
          const raw = parseArguments(call.arguments);
          if (name === "listCategories") output = await getDb().productCategory.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true }, orderBy: [{ order: "asc" }, { name: "asc" }] });
          else if (name === "findProducts") { const query = z.object({ query: z.string().trim().min(1).max(120) }).parse(raw).query; output = await getDb().product.findMany({ where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { brand: { contains: query, mode: "insensitive" } }, { model: { contains: query, mode: "insensitive" } }] }, select: { id: true, name: true, brand: true, model: true, slug: true, categoryId: true }, take: 12 }); }
          else if (name === "proposeCategory") { const category = z.object({ name: z.string().trim().min(2).max(160) }).parse(raw); output = { proposed: true, name: category.name, persisted: false }; }
          else if (name === "lookupPriceList") {
            const lookup = z.object({ model: z.string().trim().min(1).max(120), kind: kindSchema, block: z.string().nullable() }).parse(raw);
            const active = await getActivePriceList(); const block = selectBlock(active, lookup.block);
            const row = block?.rows.find(item => normalizePriceModel(item.model) === normalizePriceModel(lookup.model)); const foundPrice = row ? normalizeMoney2(valueForKind(row, lookup.kind)) : null;
            if (!active) output = { found: false, reason: "NO_ACTIVE_PRICE_LIST" };
            else if (!block) output = { found: false, reason: "BLOCK_NOT_FOUND", availableBlocks: active.parsed.blocks.map(item => ({ key: item.key, label: item.label, sheetName: item.sheetName })) };
            else if (!row || !foundPrice) output = { found: false, reason: "MODEL_OR_PRICE_NOT_FOUND", block: block.key };
            else { const facts = { freon: row.freon, receiverLiters: row.receiverLiters, waterCondenser: row.waterCondenser, airCondenser: row.airCondenser, evaporator: row.evaporator, kitParts: row.kitParts }; const item = { model: row.model, kind: lookup.kind, price: foundPrice, blockKey: block.key, blockLabel: block.label, sheetName: block.sheetName, sourceRow: row.sourceRow, facts } satisfies LookupEvidence; evidence.push(item); output = { found: true, ...item }; }
          } else {
            const draft = draftSchema.parse(raw);
            payload = await makePreview({ draft, adminId: args.adminId, sessionId: args.sessionId, sourceText: args.message, evidence });
            output = { accepted: true, previewOnly: true, persisted: false };
          }
        } catch (error) { output = { error: error instanceof Error ? error.message : "TOOL_FAILED" }; }
        input.push({ type: "function_call_output", call_id: call.call_id, output: safeJson(output) });
      }
    }
    if (payload) return { payload, reply: "To'liq mahsulot preview tayyorlandi. Hali bazaga yozilmadi.", status: "awaiting_confirmation" as ProductAgentStatus };
    return { reply: "Narx topilmadi. Narxni USDda yozing.", status: "idle" as ProductAgentStatus, question: { text: "Narx topilmadi. Narxni USDda yozing.", options: [] } };
  } catch (error) {
    if (error instanceof APIError) console.error("Product Agent tool loop OpenAI error", { status: error.status, code: error.code, type: error.type, message: error.message });
    throw error;
  }
}
