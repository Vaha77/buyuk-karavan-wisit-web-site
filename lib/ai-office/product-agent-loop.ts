import "server-only";

import { createHash, randomUUID } from "node:crypto";
import OpenAI, { APIError } from "openai";
import type { ResponseInput, Tool } from "openai/resources/responses/responses";
import { z } from "zod";
import type { AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { normalizeSlug } from "@/lib/products/validation";
import { buildAgentProductCopy, buildAgentProductName, buildAgentProductTags, categorySimilarity, chatReplyClaimsWrite, containsForbiddenClaim, detectAgentProductKind, extractCondenserCode, extractDirectPrice, extractEvaporatorCode, extractProductModels, extractSeoTerms, normalizeMoney2, resolveAgentBrand, resolveAgentModel, unsupportedTechnicalTokens } from "./product-agent-rules";
import { getActivePriceList, normalizePriceModel, valueForKind, type PriceListKind } from "./price-list-parser";
import { rejectUnauthorizedProductAgentTool, ProductAgentProviderError, type ProductAgentStatus } from "./product-agent";
import { calculateFinalPrice, extractRequiredLocalTerms, type PreviewPayload, type PreviewRow } from "./product-agent-preview";

const MAX_TOOL_STEPS = 10;
const DEFAULT_MODEL = "gpt-4.1";
export const PRODUCT_AGENT_TOOL_NAMES = ["listCategories", "findProducts", "lookupPriceList", "proposeCategory", "buildProductDraft"] as const;
type AgentToolName = (typeof PRODUCT_AGENT_TOOL_NAMES)[number];

const kindSchema = z.enum(["compressor", "receiver", "water", "air", "water-kit", "air-kit"]);
const draftSchema = z.object({
  name: z.string().max(180), brand: z.string().max(100), model: z.string().max(120), categoryIdOrNewName: z.string().max(160), priceUsd: z.string().max(30), markupPercent: z.string().max(20),
  shortDescription: z.string().max(300), description: z.string().max(5000), specifications: z.array(z.object({ name: z.string().max(100), value: z.string().max(300) })).max(40),
  tags: z.array(z.string().max(80)).max(30), slug: z.string().max(180), availability: z.enum(["available", "order"]), isVisible: z.boolean(), seoTitle: z.string().max(180), seoDescription: z.string().max(500), requiredSeoTerms: z.array(z.string().max(80)).max(20),
});
type DraftInput = z.infer<typeof draftSchema>;
type Category = { id: string; name: string; slug?: string };
type LookupEvidence = { model: string; kind: PriceListKind; price: string; blockKey: string; blockLabel: string; sheetName: string; sourceRow: number; facts: Record<string, string> };

const draftProperties = {
  name: { type: "string" }, brand: { type: "string" }, model: { type: "string" }, categoryIdOrNewName: { type: "string" }, priceUsd: { type: "string" }, markupPercent: { type: "string" }, shortDescription: { type: "string" }, description: { type: "string" },
  specifications: { type: "array", items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } }, required: ["name", "value"], additionalProperties: false } },
  tags: { type: "array", items: { type: "string" } }, slug: { type: "string" }, availability: { type: "string", enum: ["available", "order"] }, isVisible: { type: "boolean" }, seoTitle: { type: "string" }, seoDescription: { type: "string" }, requiredSeoTerms: { type: "array", items: { type: "string" } },
} as const;
const tools: Tool[] = [
  { type: "function", name: "listCategories", description: "Faol mahsulot kategoriyalarini qaytaradi.", strict: true, parameters: { type: "object", properties: {}, required: [], additionalProperties: false } },
  { type: "function", name: "findProducts", description: "Nom, brend yoki model bo'yicha mavjud mahsulotlarni topadi.", strict: true, parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { type: "function", name: "lookupPriceList", description: "Faol price listdan deterministik narx/fakt oladi. model='hamma', 'barcha' yoki '*' bo'lsa tanlangan blokdagi barcha narxli qatorlarni qaytaradi.", strict: true, parameters: { type: "object", properties: { model: { type: "string" }, kind: { type: "string", enum: kindSchema.options }, block: { type: ["string", "null"] } }, required: ["model", "kind", "block"], additionalProperties: false } },
  { type: "function", name: "proposeCategory", description: "Faqat o'xshash mavjud kategoriya bo'lmasa yangi kategoriya draftini taklif qiladi.", strict: true, parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } },
  { type: "function", name: "buildProductDraft", description: "Bitta to'liq preview qatorini qo'shadi. Ko'p mahsulot uchun bu toolni har mahsulotga chaqir. markupPercentni albatta ber; yakuniy price-list narxini server hisoblaydi.", strict: true, parameters: { type: "object", properties: draftProperties, required: Object.keys(draftProperties), additionalProperties: false } },
];

export const PRODUCT_AGENT_TOOL_SYSTEM_PROMPT = `Sen BUYUK KARAVAN admin panelidagi Mahsulot agentisan. Barcha mahsulot maydonlarini O'ZING to'ldir. Brend/modelni findProducts bilan top. Kategoriyani listCategories bilan tekshir; o'xshashi bo'lmasa proposeCategory. Nom, brend, model, tavsif, SEO va teglarni server faktlardan shablon bilan yozadi: bu maydonlarga marketing gap yozma, bilmasang bo'sh qoldir. Texnik raqamlarni taxmin qilma.
Narx xabarda aniq bo'lsa priceUsdga ber. Narx yo'q bo'lsa lookupPriceList ishlat. Foiz aytilsa markupPercentga faqat foizni ber; hisobni server qiladi. "hamma/barcha" buyruqlarida lookupPriceListga model="hamma" berib, qaytgan har qator uchun buildProductDraft chaqir. Bir nechta mahsulot bo'lsa buildProductDraftni bir necha marta chaqir.
Savol faqat narx foydalanuvchida ham, price-listda ham umuman topilmasa beriladi. "Tavsifni o'zing yoz" sening ishing. buildProductDraft faqat preview yaratadi. "Yaratildi", ID yoki DB natijasini o'ylab topma.`;

function safeJson(value: unknown) { return JSON.stringify(value); }
function parseArguments(value: string) { try { return JSON.parse(value) as unknown; } catch { throw new Error("Tool argumentlari JSON formatida emas."); } }
function similarCategory(categories: Category[], name: string): { item?: Category; score: number } { return categories.map(item => ({ item, score: categorySimilarity(item.name, name) })).sort((a, b) => b.score - a.score)[0] || { score: 0 }; }
function selectBlock(active: Awaited<ReturnType<typeof getActivePriceList>>, requested: string | null) { if (!active) return undefined; if (!requested?.trim()) return active.parsed.blocks.find(block => block.key === active.blockKey) || active.parsed.blocks[0]; const needle = requested.toLocaleLowerCase("uz-UZ").trim(); return active.parsed.blocks.find(block => [block.key, block.label, block.sheetName].some(value => value.toLocaleLowerCase("uz-UZ").includes(needle))); }
function sourceForEvidence(item: LookupEvidence) { return `${item.sheetName}, ${item.blockLabel}, ${item.sourceRow}-qator`; }

function capitalize(value: string) { return value ? `${value[0].toLocaleUpperCase("uz-UZ")}${value.slice(1)}` : value; }
function normalizedFactText(value: string) { return value.toLocaleLowerCase("uz-UZ").replace(/\s+/g, " ").trim(); }

async function makeRow(args: { draft: DraftInput; rowNumber: number; sourceText: string; evidence: LookupEvidence[]; categories: Category[] }): Promise<PreviewRow> {
  // Identity fields and copy are derived on the server; the LLM draft only proposes category, price and markup.
  const message = args.sourceText;
  const singleModelMessage = extractProductModels(message).length <= 1;
  const guessedModel = resolveAgentModel({ draftModel: args.draft.model, draftBrand: args.draft.brand, message });
  const evidence = [...args.evidence].reverse().find(item => normalizePriceModel(item.model) === normalizePriceModel(guessedModel));
  const model = resolveAgentModel({ draftModel: args.draft.model, draftBrand: args.draft.brand, message, evidenceModel: evidence?.model });
  const directPrice = normalizeMoney2(args.draft.priceUsd) || (singleModelMessage ? extractDirectPrice(message) : null);
  if (!evidence && !directPrice) throw new Error(`Narx topilmadi: ${model || "model"} uchun USD narxini yozing.`);
  const markup = normalizeMoney2(args.draft.markupPercent || "0") || "0.00";
  const finalPrice = evidence ? calculateFinalPrice(evidence.price, markup, "none") : directPrice!;
  if (!finalPrice) throw new Error(`Narx hisoblanmadi: ${model}.`);

  const exactCategory = args.categories.find(item => item.id === args.draft.categoryIdOrNewName);
  const similar = similarCategory(args.categories, args.draft.categoryIdOrNewName);
  const category = exactCategory || (similar.score >= .66 ? similar.item : undefined);
  const categoryName = category?.name || capitalize(args.draft.categoryIdOrNewName.trim().replace(/\s+/g, " ")) || "Mahsulotlar";
  const family = model.split(" ")[0];
  const products = await getDb().product.findMany({ where: { OR: [{ model: { contains: model, mode: "insensitive" } }, { model: { startsWith: family, mode: "insensitive" } }] }, select: { id: true, name: true, brand: true, model: true, slug: true, priceUsd: true, categoryId: true }, take: 50 });
  const sameModel = products.filter(item => normalizePriceModel(item.model) === normalizePriceModel(model));
  const exact = category ? sameModel.find(item => item.categoryId === category.id) : undefined;
  const brand = resolveAgentBrand({ model, existingBrands: sameModel.map(item => item.brand), draftBrand: args.draft.brand });
  const kind = detectAgentProductKind({ categoryName, evidenceKind: evidence?.kind, message });
  const facts = evidence?.facts;
  const condenser = (singleModelMessage ? extractCondenserCode(message) : "") || (kind === "air" || kind === "air-kit" ? extractCondenserCode(facts?.airCondenser || "") : "");
  const evaporator = (singleModelMessage ? extractEvaporatorCode(message) : "") || (kind.endsWith("kit") ? extractEvaporatorCode(facts?.evaporator || "") : "");
  const requiredTerms = [...new Set([...args.draft.requiredSeoTerms, ...extractSeoTerms(message), ...extractRequiredLocalTerms(message)].map(term => term.trim()).filter(term => term && !containsForbiddenClaim(term)))];
  const name = buildAgentProductName({ brand, model, kind, categoryName, condenser, evaporator, facts });
  const copy = buildAgentProductCopy({ name, brand, model, kind, categoryName, condenser, evaporator, facts, requiredTerms });
  const tags = buildAgentProductTags({ brand, model, kind, condenser, evaporator, requiredTerms });

  const serverSpecs = ([["Kondensator", condenser], ["Isparitel", evaporator], ["Freon", facts?.freon], ["Resiver", facts?.receiverLiters], ["Komplekt tarkibi", kind.endsWith("kit") ? facts?.kitParts : ""]] as Array<[string, string | undefined]>)
    .filter((entry): entry is [string, string] => !!entry[1]?.trim() && !containsForbiddenClaim(entry[1])).map(([specName, value]) => ({ name: specName, value: value.trim() }));
  const evidenceText = normalizedFactText(`${message}\n${Object.values(facts || {}).join("\n")}`);
  const specNames = new Set(serverSpecs.map(spec => spec.name.toLocaleLowerCase("uz-UZ")));
  const draftSpecs = args.draft.specifications.filter(spec => spec.name.trim() && spec.value.trim() && !specNames.has(spec.name.trim().toLocaleLowerCase("uz-UZ")) && !containsForbiddenClaim(`${spec.name} ${spec.value}`) && evidenceText.includes(normalizedFactText(spec.value)) && unsupportedTechnicalTokens([spec], evidenceText).length === 0);
  return {
    id: `row-${args.rowNumber}`, name, brand, model, sourcePrice: evidence?.price || directPrice!, currency: "USD", sourceLocation: evidence ? sourceForEvidence(evidence) : "Admin xabari", confidence: 1, ambiguous: false,
    categoryId: category?.id || null, categoryName, shortDescription: copy.shortDescription, description: copy.description, tags, seoTitle: copy.seoTitle, seoDescription: copy.seoDescription, specifications: [...serverSpecs, ...draftSpecs],
    markupPercent: evidence ? markup : "0.00", rounding: "none", finalPrice, status: exact ? "MAVJUD — narx o‘zgaradi" : "YANGI", existingProductId: exact?.id || null, oldPrice: exact?.priceUsd?.toString() || null,
    slug: exact?.slug || normalizeSlug(name), requiredLocalTerms: requiredTerms, seoKeywords: tags, seoText: copy.description, newCategoryName: category ? null : categoryName,
    productKind: evidence?.kind || kind, priceListId: evidence ? "active" : undefined, sourceBlock: evidence?.blockKey, priceSource: evidence ? "price-list" : "direct", directPrice: evidence ? null : directPrice,
  };
}

function buildPayload(rows: PreviewRow[], args: { adminId: string; sessionId: string; message: string }): PreviewPayload { const now = Date.now(); return { id: randomUUID(), agentId: "product-agent-01", adminId: args.adminId, sessionId: args.sessionId, createdAt: now, expiresAt: now + 30 * 60_000, sourceRef: createHash("sha256").update(args.message).digest("hex").slice(0, 24), rows }; }

export async function runProductAgentLoop(args: { message: string; history: Array<{ role: "user" | "assistant"; content: string }>; adminId: string; sessionId: string; actor: Pick<AdminUser, "id" | "name"> }) {
  if (!process.env.OPENAI_API_KEY) throw new ProductAgentProviderError("OPENAI_NOT_CONFIGURED");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  const input: ResponseInput = [{ role: "system", content: PRODUCT_AGENT_TOOL_SYSTEM_PROMPT }, ...args.history, { role: "user", content: args.message }];
  const evidence: LookupEvidence[] = [], rows: PreviewRow[] = [], errors: string[] = [];
  let categories: Category[] | null = null, toolRounds = 0, forceDraft = false, forcedOnce = false, priceUnavailable = false, priceKnown = false;
  const getCategories = async () => categories ||= await getDb().productCategory.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true }, orderBy: [{ order: "asc" }, { name: "asc" }] });
  try {
    while (toolRounds < MAX_TOOL_STEPS) {
      toolRounds += 1;
      const toolChoice = forceDraft ? { type: "function" as const, name: "buildProductDraft" } : "auto" as const;
      const response = await client.responses.create({ model: process.env.OPENAI_PRODUCT_AGENT_MODEL?.trim() || DEFAULT_MODEL, store: false, input, tools, tool_choice: toolChoice });
      input.push(...response.output as unknown as ResponseInput);
      const calls = response.output.filter(item => item.type === "function_call");
      if (!calls.length) {
        if (rows.length) break;
        if (!forcedOnce) { forcedOnce = true; forceDraft = true; continue; }
        const reply = response.output_text.trim(); errors.push(chatReplyClaimsWrite(reply) ? "Agent draft toolini chaqirmadi." : reply || "Agent draft toolini chaqirmadi."); break;
      }
      forceDraft = false;
      for (const call of calls) {
        const name = call.name as AgentToolName; await rejectUnauthorizedProductAgentTool(name, args.actor); let output: unknown;
        try {
          const raw = parseArguments(call.arguments);
          if (name === "listCategories") output = await getCategories();
          else if (name === "findProducts") { const query = z.object({ query: z.string().trim().min(1).max(120) }).parse(raw).query; output = await getDb().product.findMany({ where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { brand: { contains: query, mode: "insensitive" } }, { model: { contains: query, mode: "insensitive" } }] }, select: { id: true, name: true, brand: true, model: true, slug: true, categoryId: true }, take: 20 }); }
          else if (name === "proposeCategory") { const proposed = z.object({ name: z.string().trim().min(2).max(160) }).parse(raw); const similar = similarCategory(await getCategories(), proposed.name); output = similar.score >= .66 && similar.item ? { proposed: false, existingCategory: similar.item, similarity: similar.score } : { proposed: true, name: proposed.name, persisted: false }; }
          else if (name === "lookupPriceList") {
            const lookup = z.object({ model: z.string().trim().min(1).max(120), kind: kindSchema, block: z.string().nullable() }).parse(raw), active = await getActivePriceList(), block = selectBlock(active, lookup.block);
            if (!active) { priceUnavailable = true; output = { found: false, reason: "NO_ACTIVE_PRICE_LIST" }; }
            else if (!block) output = { found: false, reason: "BLOCK_NOT_FOUND", availableBlocks: active.parsed.blocks.map(item => ({ key: item.key, label: item.label, sheetName: item.sheetName })) };
            else {
              const all = /^(?:hamma|barcha|\*)$/iu.test(lookup.model); const matched = all ? block.rows : block.rows.filter(item => normalizePriceModel(item.model) === normalizePriceModel(lookup.model));
              const found = matched.flatMap(row => { const price = normalizeMoney2(valueForKind(row, lookup.kind)); if (!price) return []; const item = { model: row.model, kind: lookup.kind, price, blockKey: block.key, blockLabel: block.label, sheetName: block.sheetName, sourceRow: row.sourceRow, facts: { freon: row.freon, receiverLiters: row.receiverLiters, waterCondenser: row.waterCondenser, airCondenser: row.airCondenser, evaporator: row.evaporator, kitParts: row.kitParts } } satisfies LookupEvidence; evidence.push(item); return [item]; });
              if (!found.length) priceUnavailable = true; else priceKnown = true; output = found.length ? { found: true, rows: found } : { found: false, reason: "MODEL_OR_PRICE_NOT_FOUND", block: block.key };
            }
          } else {
            const draft = draftSchema.parse(raw); if (normalizeMoney2(draft.priceUsd)) priceKnown = true;
            const row = await makeRow({ draft, rowNumber: rows.length + 1, sourceText: args.message, evidence, categories: await getCategories() });
            const duplicate = rows.some(item => item.categoryName === row.categoryName && normalizePriceModel(item.model) === normalizePriceModel(row.model)); if (!duplicate) rows.push(row);
            output = { accepted: true, rowNumber: rows.length, previewOnly: true, persisted: false, normalizedModel: row.model, finalPrice: row.finalPrice };
          }
        } catch (error) { const message = error instanceof Error ? error.message : "Tool bajarilmadi."; errors.push(message); if (/Narx topilmadi|Narx hisoblanmadi/iu.test(message)) priceUnavailable = true; output = { error: message, retryable: true }; }
        input.push({ type: "function_call_output", call_id: call.call_id, output: safeJson(output) });
      }
    }
    if (rows.length) return { payload: buildPayload(rows, args), reply: `${rows.length} ta mahsulot preview tayyorlandi. Hali bazaga yozilmadi.`, status: "awaiting_confirmation" as ProductAgentStatus };
    const missingPrice = priceUnavailable && !priceKnown;
    const message = errors.at(-1) || (missingPrice ? "Narx topilmadi. Narxni USDda yozing." : "Mahsulot draftini tayyorlab bo'lmadi.");
    return { reply: message, status: "idle" as ProductAgentStatus, question: missingPrice ? { text: message, options: [] } : undefined };
  } catch (error) { if (error instanceof APIError) console.error("Product Agent tool loop OpenAI error", { status: error.status, code: error.code, type: error.type, message: error.message }); throw error; }
}
