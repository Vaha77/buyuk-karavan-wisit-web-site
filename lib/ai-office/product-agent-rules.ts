export type CategoryCandidate = { name: string; slug: string };

export function normalizeRuleText(value: string) {
  return value.toLocaleLowerCase("uz-UZ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function categoryMatches(candidate: CategoryCandidate, standardName: string, synonyms: string[]) {
  const values = [candidate.name, candidate.slug].map(canonicalCategoryCore).filter(Boolean);
  const targets = [standardName, ...synonyms].map(canonicalCategoryCore).filter(Boolean);
  return values.some(value => targets.includes(value));
}

export function normalizeMoney2(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}

export function moneyEquals(left: string, right: string) {
  const a = normalizeMoney2(left), b = normalizeMoney2(right);
  return a !== null && b !== null && a === b;
}

export function directPriceIsValid(finalPrice: string, directPrice: string | null | undefined) {
  return !!directPrice && moneyEquals(finalPrice, directPrice);
}

export function hasPriceListCommandIntent(message: string) {
  return /\b(?:BR|BF)\s*[+-]?\s*\d/iu.test(message) || /\b(?:hamma|barcha)\b/iu.test(message);
}

export function hasDirectProductCommandIntent(message: string) {
  return /\b(?:BR|BF)\s*[+-]?\s*\d/iu.test(message) && /\bnarx(?:i)?\s*[:=-]?\s*\d/iu.test(message);
}

export function chatReplyClaimsWrite(message: string) {
  return /(?:mahsulot|kategoriya).{0,30}(?:yaratildi|qo['‘’]?shildi|yangilandi)|\b(?:product|category)[ _-]?id\b|\bdb\s*(?:ga|da)|bazaga\s+(?:yozildi|saqlandi)/iu.test(message);
}

export function findModelHeaderColumns(rows: string[][]) {
  const columns = new Set<number>();
  rows.slice(0, 15).forEach(row => row.forEach((value, index) => { if (/model/i.test(value.trim())) columns.add(index + 1); }));
  return [...columns].sort((a, b) => a - b);
}

export function requestedSheetNumber(message: string) {
  const match = message.match(/(?:(\d+)\s*[- ]*(?:list|лист)|(?:list|лист)\s*[- ]?(\d+))/iu);
  return match ? Number(match[1] || match[2]) : null;
}

function technicalNumericTokens(value: string) {
  return value.match(/[A-Za-z]*\d+(?:[.,]\d+)?(?:\s*[%°]|\s*[A-Za-z]+)?/g)?.map(item => item.toLocaleLowerCase("uz-UZ").replace(/\s+/g, "").replace(",", ".")) || [];
}

export function unsupportedTechnicalTokens(specifications: Array<{ value: string }>, sourceText: string) {
  const normalizedSource = sourceText.toLocaleLowerCase("uz-UZ").replace(/\s+/g, "").replace(/,/g, ".");
  return specifications.flatMap(spec => technicalNumericTokens(spec.value)).filter(token => !normalizedSource.includes(token));
}

// (BR|BF)\s*[+-]?\s*\d+\s*[A-Z]{1,3}; letters that start a condenser/evaporator code (FN43, DD160) are not part of the model.
const MODEL_PATTERN = /\b(BR|BF)\s*([+-]?)\s*(\d+)(?:\s*(?!FNV?\s*\d|D[DJ]\s*\d)([A-Z]{1,3})(?![A-Z]))?/gu;
export function extractProductModels(text: string) {
  const models = [...text.toUpperCase().matchAll(MODEL_PATTERN)].map(match => `${match[1]} ${match[2]}${match[3]}${match[4] || ""}`);
  return [...new Set(models)];
}
export function normalizeAgentModel(value: string) {
  return extractProductModels(value)[0] || value.trim().replace(/\s+/g, " ");
}
export function compactModel(value: string) { return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, ""); }
export function extractCondenserCode(text: string) { const match = text.match(/\b(FNV?)\s*-?\s*(\d+)\b/iu); return match ? `${match[1].toUpperCase()}${match[2]}` : ""; }
export function extractEvaporatorCode(text: string) { const match = text.match(/\b(D[DJ])\s*-?\s*(\d+)\b/iu); return match ? `${match[1].toUpperCase()}${match[2]}` : ""; }
export function extractDirectPrice(text: string) { const match = text.match(/\bnarx(?:i)?\s*[:=-]?\s*(\d+(?:[.,]\d{1,2})?)\b/iu); return match ? normalizeMoney2(match[1]) : null; }
export function extractSeoTerms(text: string) {
  const match = text.match(/\bseo\s*(?:ga|da|uchun)?\s+["“']?(.+?)["”']?\s+(?:deyish|deb\s+(?:yoz|ayt)\p{L}*|yozish|qo['‘’]?shish)\s+kerak/iu);
  const term = match?.[1]?.trim();
  return term && term.length <= 60 ? [term] : [];
}

/** The LLM model is trusted only when it agrees with a model literally present in the admin message. */
export function resolveAgentModel(args: { draftModel: string; draftBrand: string; message: string; evidenceModel?: string }) {
  if (args.evidenceModel) return normalizeAgentModel(args.evidenceModel);
  const inMessage = extractProductModels(args.message);
  const fromDraft = extractProductModels(args.draftModel)[0] || extractProductModels(`${args.draftBrand} ${args.draftModel}`)[0];
  if (fromDraft && (!inMessage.length || inMessage.some(model => compactModel(model) === compactModel(fromDraft)))) return fromDraft;
  if (inMessage.length === 1) return inMessage[0];
  return fromDraft || args.draftModel.trim().replace(/\s+/g, " ");
}

/** Brand comes from an existing product with the same model; BR/BF defaults to XUEYING. The LLM brand is a last resort. */
export function resolveAgentBrand(args: { model: string; existingBrands: string[]; draftBrand: string }) {
  const existing = args.existingBrands.map(brand => brand.trim()).find(Boolean);
  if (existing) return /^xueing$/iu.test(existing) ? "XUEYING" : existing;
  if (/^(?:BR|BF)\b/u.test(args.model)) return "XUEYING";
  const draft = args.draftBrand.trim();
  return draft && !/^(?:BR|BF)$/iu.test(draft) ? draft : "BUYUK KARAVAN";
}

export type AgentProductKind = "air" | "water" | "compressor" | "receiver" | "air-kit" | "water-kit" | "other";
const PRICE_LIST_KINDS = ["air", "water", "compressor", "receiver", "air-kit", "water-kit"];
export function detectAgentProductKind(args: { categoryName: string; evidenceKind?: string; message?: string }): AgentProductKind {
  if (args.evidenceKind && PRICE_LIST_KINDS.includes(args.evidenceKind)) return args.evidenceKind as AgentProductKind;
  const fromText = (value: string): AgentProductKind | null => {
    const text = normalizeRuleText(value); const kit = /\bkomplekt/.test(text);
    const air = /\b(?:vazdush|vozdush|havo)/.test(text), water = /\b(?:vadin|vodyan|suvli\b|suv\b)/.test(text);
    if (kit) return water && !air ? "water-kit" : air ? "air-kit" : null;
    if (air) return "air";
    if (water) return "water";
    if (/\bresiver/.test(text) && !/\bagregat/.test(text)) return "receiver";
    if (/\bkompressor/.test(text) && !/\bagregat/.test(text)) return "compressor";
    return null;
  };
  return fromText(args.categoryName) || fromText(args.message || "") || "other";
}

const KIND_LABEL: Record<AgentProductKind, string> = { air: "vazdushniy agregat", water: "vadinoy agregat", compressor: "yarim germetik kompressor", receiver: "kompressor resiver ustida", "air-kit": "vazdushniy agregat komplekti", "water-kit": "vadinoy agregat komplekti", other: "" };
export function productKindLabel(kind: AgentProductKind, categoryName: string) {
  return KIND_LABEL[kind] || normalizeRuleText(categoryName).replace(/\b(?:xueying|xueing)\b/g, "").replace(/\bagregatlar\b/g, "agregat").replace(/\s+/g, " ").trim();
}

function dedupeWords(value: string) {
  const seen = new Set<string>();
  return value.split(/\s+/).filter(word => { const key = word.toLocaleLowerCase("en-US").replace(/[()]/g, ""); if (!key || seen.has(key)) return false; seen.add(key); return true; }).join(" ");
}

export type AgentProductFacts = { freon?: string; receiverLiters?: string; waterCondenser?: string; airCondenser?: string; evaporator?: string; kitParts?: string };
export function buildAgentProductName(args: { brand: string; model: string; kind: AgentProductKind; categoryName: string; condenser: string; evaporator: string; facts?: AgentProductFacts }) {
  const label = productKindLabel(args.kind, args.categoryName);
  const hp = args.facts?.waterCondenser?.trim();
  let tail = "";
  if (args.kind === "air" || args.kind === "air-kit") tail = [args.condenser, args.kind === "air-kit" ? args.evaporator : ""].filter(Boolean).join(" ");
  else if (args.kind === "water") tail = hp ? `(${/kondensator/iu.test(hp) ? hp : `${hp} kondensator`})` : "";
  else if (args.kind === "receiver") tail = args.facts?.receiverLiters ? `(${args.facts.receiverLiters})` : "";
  else if (args.kind === "other") tail = [args.condenser, args.evaporator].filter(Boolean).join(" ");
  return dedupeWords(`${args.brand} ${args.model} ${label} ${tail}`.replace(/\s+/g, " ").trim());
}

export const FORBIDDEN_MARKETING_WORDS = ["samarali", "samaradorlik", "chidamli", "zamonaviy", "yuqori", "sifatli", "ishonchli", "tejamkor", "eng", "maishiy"] as const;
const FORBIDDEN_PATTERN = new RegExp(`(?:^|[^\\p{L}])(?:${FORBIDDEN_MARKETING_WORDS.join("|")})(?=$|[^\\p{L}])`, "iu");
export function containsForbiddenClaim(value: string) { return FORBIDDEN_PATTERN.test(value); }

function factSentences(args: { kind: AgentProductKind; condenser: string; evaporator: string; facts?: AgentProductFacts }) {
  const facts = args.facts || {};
  const clean = (value?: string) => { const text = value?.trim() || ""; return text && !containsForbiddenClaim(text) ? text : ""; };
  const air = args.kind === "air" || args.kind === "air-kit", water = args.kind === "water" || args.kind === "water-kit", kit = args.kind.endsWith("kit");
  return [
    args.condenser && `Kondensator: ${args.condenser}`,
    !args.condenser && air && clean(facts.airCondenser) && `Havoli kondensator: ${clean(facts.airCondenser)}`,
    water && clean(facts.waterCondenser) && `Suvli kondensator: ${clean(facts.waterCondenser)}`,
    args.evaporator ? `Isparitel: ${args.evaporator}` : kit && clean(facts.evaporator) ? `Isparitel: ${clean(facts.evaporator)}` : "",
    clean(facts.freon) && `Freon: ${clean(facts.freon)}`,
    clean(facts.receiverLiters) && `Resiver: ${clean(facts.receiverLiters)}`,
    kit && clean(facts.kitParts) && `Komplekt tarkibi: ${clean(facts.kitParts)}`,
  ].filter((item): item is string => !!item);
}

/** Deterministic, fact-only copy: the LLM never writes descriptions or SEO text. */
export function buildAgentProductCopy(args: { name: string; brand: string; model: string; kind: AgentProductKind; categoryName: string; condenser: string; evaporator: string; facts?: AgentProductFacts; requiredTerms?: string[] }) {
  const facts = factSentences(args);
  const shortDescription = `${args.name}. Brend: ${args.brand}, model: ${args.model}.`;
  const description = [`${args.name} — “${args.categoryName}” kategoriyasidagi mahsulot.`, `Brend: ${args.brand}.`, `Model: ${args.model}.`, ...facts.map(item => `${item}.`), "Narx va mavjudlik holati mahsulot kartochkasida ko‘rsatilgan."].join("\n");
  let seoTitle = `${args.name} — BUYUK KARAVAN`;
  let seoDescription = `${args.name}. Brend: ${args.brand}, model: ${args.model}${facts.length ? `, ${facts.join(", ")}` : ""}. Narx va buyurtma — BUYUK KARAVAN katalogida.`;
  for (const term of args.requiredTerms || []) {
    const lower = term.toLocaleLowerCase("uz-UZ");
    if (!seoTitle.toLocaleLowerCase("uz-UZ").includes(lower)) seoTitle = `${seoTitle} | ${term}`;
    if (!seoDescription.toLocaleLowerCase("uz-UZ").includes(lower)) seoDescription = `${seoDescription} ${term}.`;
  }
  if (seoDescription.length < 90) seoDescription = `${seoDescription} Sovutish uskunalari katalogi.`;
  return { shortDescription: shortDescription.slice(0, 300), description: description.slice(0, 5000), seoTitle: seoTitle.slice(0, 160), seoDescription: seoDescription.slice(0, 500) };
}

export function buildAgentProductTags(args: { brand: string; model: string; kind: AgentProductKind; condenser: string; evaporator: string; requiredTerms?: string[] }) {
  const byKind: Record<AgentProductKind, string[]> = {
    air: ["agregat", "vazdushniy agregat", "havoli agregat", "sovutish agregati"],
    "air-kit": ["agregat", "vazdushniy agregat", "havoli agregat", "agregat komplekti", "sovutish agregati"],
    water: ["agregat", "vadinoy agregat", "suvli agregat", "sovutish agregati"],
    "water-kit": ["agregat", "vadinoy agregat", "suvli agregat", "agregat komplekti", "sovutish agregati"],
    compressor: ["kompressor", "yarim germetik kompressor", "sovutish kompressori"],
    receiver: ["kompressor", "resiver", "sovutish kompressori"],
    other: [],
  };
  const seen = new Set<string>();
  return [args.brand, args.model, args.condenser, args.evaporator, ...byKind[args.kind], ...(args.requiredTerms || [])].map(item => item.trim()).filter(item => {
    const key = item.toLocaleLowerCase("uz-UZ"); if (!item || seen.has(key)) return false; seen.add(key); return true;
  });
}

export function normalizedCategoryCore(value: string) {
  return normalizeRuleText(value).replace(/\b(?:xueying|xueing)\b/g, "").replace(/\ba?g+regat(?:lar)?\b/g, "agregat").replace(/\s+/g, " ").trim();
}

// Synonyms collapse to one token; kind tokens (air / water / kit / compressor / receiver) must agree for categories to match.
const CATEGORY_SYNONYMS: Array<[RegExp, string]> = [[/^(?:vazdushniy|vozdushniy|vazdushnyy|havoli|havo)$/, "air"], [/^(?:vadinoy|vodyanoy|suvli|suv)$/, "water"], [/^komplekt(?:i|lari|lar)?$/, "kit"], [/^kompressor(?:lar|i)?$/, "compressor"], [/^resiver(?:lar|i)?$/, "receiver"], [/^agregat(?:i|lar)?$/, "agregat"]];
const KIND_TOKENS = new Set(["air", "water", "kit", "compressor", "receiver"]);
function canonicalTokens(value: string) { return normalizedCategoryCore(value).split(" ").filter(Boolean).map(token => CATEGORY_SYNONYMS.find(([pattern]) => pattern.test(token))?.[1] || token); }
export function canonicalCategoryCore(value: string) { return [...new Set(canonicalTokens(value))].sort().join(" "); }

export function categorySimilarity(left: string, right: string) {
  const aa = new Set(canonicalTokens(left)), bb = new Set(canonicalTokens(right));
  if (!aa.size || !bb.size) return 0;
  const kinds = (set: Set<string>) => [...set].filter(token => KIND_TOKENS.has(token)).sort().join(" ");
  if (kinds(aa) !== kinds(bb)) return 0;
  const intersection = [...aa].filter(token => bb.has(token)).length;
  return intersection / Math.max(aa.size, bb.size);
}
