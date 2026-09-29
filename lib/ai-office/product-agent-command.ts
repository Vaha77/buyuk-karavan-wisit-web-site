import "server-only";
import { getDb } from "@/lib/db";
import { normalizeSlug } from "@/lib/products/validation";
import { calculateFinalPrice, extractRequiredLocalTerms, type PreviewPayload, type PreviewRow } from "./product-agent-preview";
import { choosePriceBlock, normalizePriceModel, type ParsedPriceList, type ParsedPriceRow, type PriceListKind, valueForKind } from "./price-list-parser";
import { categoryMatches, normalizeMoney2, normalizeRuleText } from "./product-agent-rules";

const kindData: Record<PriceListKind, { category: string; synonyms: string[]; label: string }> = {
  compressor: { category: "Kompressor XUEYING", synonyms: ["kompressor xueying", "xueying kompressor"], label: "kompressor" },
  receiver: { category: "Resiver ustidagi kompressorlar", synonyms: ["resiver ustidagi kompressor", "resiver"], label: "kompressor resiver ustida" },
  water: { category: "Vadinoy agregatlar", synonyms: ["vadinoy agregat", "suvli agregat"], label: "vadinoy agregat" },
  air: { category: "Vazdushniy agregatlar", synonyms: ["vazdushniy agregat", "havoli agregat"], label: "vazdushniy agregat" },
  "water-kit": { category: "Vadinoy agregat komplektlari", synonyms: ["vadinoy agregat komplekti", "suvli agregat komplekti"], label: "vadinoy agregat komplekti" },
  "air-kit": { category: "Vazdushniy agregat komplektlari", synonyms: ["vazdushniy agregat komplekti", "havoli agregat komplekti"], label: "vazdushniy agregat komplekti" },
};
const forbiddenClaims = /yuqori sifatli|eng yaxshi|tejamkor|maishiy|uzoq xizmat qiladi|ishonchli/giu;
const norm = normalizeRuleText;

export function inferProductKind(command: string): PriceListKind | null {
  const text = command.toLocaleLowerCase("uz-UZ"); const kit = /komplekt|\b(?:dd|dj)\s*\d/i.test(text);
  if (/kompressorni?\s*o['‘’]?zi|\bkompressor\b/iu.test(text) && !/agregat/iu.test(text)) return "compressor";
  if (/resiver|bachok/iu.test(text) && !/agregat/iu.test(text)) return "receiver";
  if (/vazdush|havoli|\bfnv?\s*\d/i.test(text)) return kit ? "air-kit" : "air";
  if (/vadinoy|suvli|\d+\s*hp/iu.test(text)) return kit ? "water-kit" : "water";
  return null;
}
export function extractCommandModels(command: string) { return [...command.toUpperCase().matchAll(/\b(?:BR|BF)\s*[+-]?\s*\d+\s*[A-Z]{1,3}(?:\/\d+)?/g)].map(match => normalizePriceModel(match[0])); }
function explicitPrice(command: string) { return command.match(/narx(?:i)?\s*[:=-]?\s*(\d+(?:[.,]\d+)?)/iu)?.[1]?.replace(",", ".") || null; }
function markup(command: string) { return command.match(/(?:ustiga\s*)?(\d+(?:[.,]\d+)?)\s*(?:%|foiz)/iu)?.[1]?.replace(",", ".") || "0"; }
function localTerms(command: string) { const base = extractRequiredLocalTerms(command); const seo = command.match(/seo\s*ga\s+(.+?)\s+(?:deyish|deb|yozish|kerak)/iu)?.[1]?.trim(); return seo && !base.includes(seo) ? [...base, seo] : base; }
function standardTags(kind: PriceListKind, row: ParsedPriceRow, terms: string[]) { const synonyms = kind === "air" || kind === "air-kit" ? ["agregat", "havoli agregat", "vazdushniy agregat", "sovutish agregati", "minusovoy agregat"] : kind === "water" || kind === "water-kit" ? ["agregat", "vadinoy agregat", "suvli agregat", "sovutish agregati"] : ["kompressor", "yarim germetik kompressor", "XUEYING kompressor", "sovutish kompressori"]; return [...new Set(["XUEYING", row.model, ...synonyms, row.airCondenser, row.waterCondenser, row.evaporator, ...terms].filter(Boolean))]; }
function productName(kind: PriceListKind, row: ParsedPriceRow) { const model = row.model; if (kind === "compressor") return `XUEYING ${model} yarim germetik kompressor`; if (kind === "receiver") return `XUEYING ${model} kompressor resiver ustida${row.receiverLiters ? ` (${row.receiverLiters.replace(/л/giu, " l")})` : ""}`; if (kind === "water") return `XUEYING ${model} vadinoy agregat${row.waterCondenser ? ` (${row.waterCondenser} kondensator)` : ""}`; if (kind === "air") return `XUEYING ${model} vazdushniy agregat${row.airCondenser ? ` ${row.airCondenser}` : ""}`; if (kind === "water-kit") return `XUEYING ${model} vadinoy agregat komplekti`; return `XUEYING ${model} vazdushniy agregat komplekti${row.airCondenser ? ` ${row.airCondenser}` : ""}${row.evaporator ? ` + ${row.evaporator}` : ""}`; }
function descriptions(kind: PriceListKind, row: ParsedPriceRow) { const name = productName(kind, row); const facts = [`Kompressor modeli: ${row.model}`, row.freon && `Freon: ${row.freon}`, row.receiverLiters && `Resiver: ${row.receiverLiters}`, (kind === "air" || kind === "air-kit") && row.airCondenser && `Havoli kondensator: ${row.airCondenser}`, (kind === "water" || kind === "water-kit") && row.waterCondenser && `Suvli kondensator: ${row.waterCondenser}`, kind === "air-kit" && row.evaporator && `Isparitel: ${row.evaporator}`, (kind === "air-kit" || kind === "water-kit") && row.kitParts && `Komplekt qismlari: ${row.kitParts}`].filter(Boolean); return { short: `${name}. Sanoat sovutish kameralari uchun katalog mahsuloti.`, full: `${name} sanoat sovutish kameralari tizimlarida qo‘llash uchun mo‘ljallangan.\n${facts.join("\n")}`.replace(forbiddenClaims, "") };
}

export async function interpretPriceListCommand(args: { command: string; parsed: ParsedPriceList; priceListId: string; filename: string; adminId: string; sessionId: string }): Promise<{ payload?: PreviewPayload; question?: { text: string; options: string[] }; activeLabel: string }> {
  const block = choosePriceBlock(args.parsed, args.command); if (!block) return { question: { text: "So‘ralgan price-list varag‘i topilmadi. Mavjud varaq nomini tanlang.", options: args.parsed.blocks.map(item => item.sheetName).filter((value, index, all) => all.indexOf(value) === index) }, activeLabel: args.filename }; const kind = inferProductKind(args.command); const activeLabel = `${args.filename} (${block.sheetName}, ${block.label})`;
  if (!kind) return { question: { text: "Qaysi agregat turini tanlaysiz?", options: ["Vazdushniy", "Vadinoy"] }, activeLabel };
  const requested = extractCommandModels(args.command); const all = /\bhamma|barcha/iu.test(args.command); const selected = all ? block.rows : requested.length ? block.rows.filter(row => requested.some(model => norm(model) === norm(row.model))) : [];
  if (!selected.length) return { question: { text: explicitPrice(args.command) ? "Model faol price listda topilmadi. Qo‘lda draft tayyorlash uchun mahsulot turini va modelni tekshiring." : "Model faol price listda topilmadi. Narxni yozing.", options: [] }, activeLabel };
  const [categories, products] = await Promise.all([getDb().productCategory.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true } }), getDb().product.findMany({ select: { id: true, model: true, categoryId: true, slug: true, priceUsd: true } })]);
  const definition = kindData[kind]; const category = categories.find(item => categoryMatches(item, definition.category, definition.synonyms));
  const direct = explicitPrice(args.command), percent = markup(args.command), terms = localTerms(args.command); const rows: PreviewRow[] = selected.map((source, index) => {
    const sourcePrice = valueForKind(source, kind); const normalizedDirect = direct ? normalizeMoney2(direct) : null; const finalPrice = normalizedDirect || calculateFinalPrice(sourcePrice, percent, "round"); const inferredMarkup = normalizedDirect && sourcePrice ? String(Math.round((Number(normalizedDirect) / Number(sourcePrice) - 1) * 10_000) / 100) : percent;
    const name = productName(kind, source), copy = descriptions(kind, source), tags = standardTags(kind, source, terms); const seoPhrase = terms[0] || definition.label; const seoTitle = `${name} — ${seoPhrase} narxi | BUYUK KARAVAN`.slice(0, 160); let seoDescription = `${name}. ${source.freon ? `${source.freon}, ` : ""}${kind === "air" ? source.airCondenser : kind === "water" ? source.waterCondenser : ""} asosidagi sanoat sovutish kamerasi uskunasi. Narx va buyurtma uchun bog‘laning.`; if (seoDescription.length < 100) seoDescription += " BUYUK KARAVAN katalogida.";
    const existing = category ? products.find(item => norm(item.model) === norm(source.model) && item.categoryId === category.id) : undefined;
    const specifications = [{ name: "Freon", value: source.freon }, { name: "Resiver", value: source.receiverLiters }, { name: "Kondensator", value: kind.startsWith("air") ? source.airCondenser : source.waterCondenser }, { name: "Isparitel", value: kind === "air-kit" ? source.evaporator : "" }, { name: "Komplekt qismlari", value: kind.endsWith("kit") ? source.kitParts : "" }].filter(item => item.value);
    return { id: `row-${index + 1}`, name, brand: "XUEYING", model: source.model, sourcePrice, currency: "USD", sourceLocation: `${block.sheetName} · ${block.label} · ${source.sourceRow}-qator`, confidence: 1, ambiguous: false, categoryId: category?.id || null, categoryName: category?.name || definition.category, markupPercent: inferredMarkup, rounding: "round", finalPrice, status: category ? existing ? "MAVJUD — narx o‘zgaradi" : "YANGI" : "YANGI" , existingProductId: existing?.id || null, oldPrice: existing?.priceUsd?.toString() || null, slug: existing?.slug || normalizeSlug(name), requiredLocalTerms: terms, seoKeywords: tags, seoText: terms.reduce((text, term) => text.includes(term) ? text : `${text}\n${term}`, copy.full), shortDescription: copy.short, description: copy.full, tags, seoTitle, seoDescription, specifications, newCategoryName: category ? null : definition.category, productKind: kind, priceListId: args.priceListId, sourceBlock: block.label, priceSource: normalizedDirect ? "direct" : "price-list", directPrice: normalizedDirect } as PreviewRow;
  });
  return { payload: { id: crypto.randomUUID(), agentId: "product-agent-01", adminId: args.adminId, sessionId: args.sessionId, createdAt: Date.now(), expiresAt: Date.now() + 30 * 60_000, sourceRef: args.priceListId, rows }, activeLabel };
}
