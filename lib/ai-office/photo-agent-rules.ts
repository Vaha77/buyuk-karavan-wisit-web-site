import { compactModel, detectAgentProductKind, extractProductModels, type AgentProductKind } from "./product-agent-rules";

export const PHOTO_AGENT_REFUSAL = "Uzr, men faqat mahsulot rasmlari bilan ishlayman. Mahsulot va narx uchun Mahsulot agentiga murojaat qiling.";
export const PHOTO_AGENT_NEEDS_IMAGE = "Rasm yuboring: kamera yoki galereyadan 1–6 ta rasm tanlang va mahsulot modelini yozing.";
export const PHOTO_AGENT_NOT_FOUND = "Mahsulot topilmadi, avval Mahsulot agenti orqali qo‘shing.";
export const PHOTO_AGENT_MAX_FILES = 6;
export const PHOTO_AGENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const PHOTO_AGENT_DEADLINE_MS = 90_000;

/** "br +20pg" = "BR +20PG" = "br20pg". */
export function normalizePhotoQuery(value: string) { return compactModel(value); }

// Requests outside image work are refused on the server; the LLM prompt carries no refusal text.
const OFF_DOMAIN_PATTERNS = [
  /\bnarx\p{L}*/iu, /\bnarh\p{L}*/iu, /\bprice\b/iu, /\bcena\b|\bцен/iu, /\$\s*\d|\d\s*(?:\$|usd|dollar|so['‘’]?m)\b/iu,
  /\btavsif\p{L}*/iu, /\bdescription\b/iu, /\bseo\b/iu, /\bteg(?:lar|ini|ni)?\b/iu, /\bkategoriya\p{L}*|\bkategorya\p{L}*/iu,
  // "mahsulot qo‘sh" (create a product) is refused; "rasmni mahsulotiga qo‘sh" (attach a photo) is image work.
  /\bmahsulot(?:lar)?\s+(?:qo['‘’]?sh|yarat|o['‘’]?chir)/iu, /\bmahsulot\p{L}*\s+nomini\b/iu, /\byangi\s+mahsulot/iu, /\bnom(?:i|ini)?\s+o['‘’]?zgartir/iu,
  /\bmavjud(?:lik)?\s+(?:holat|qil)/iu, /\byashir|\bko['‘’]?rinmas\s+qil/iu, /\blid\b|\bcrm\b|\bhisob-kitob\b|\breklama\s+matn/iu,
];
export function isPhotoAgentOffDomain(message: string) { return OFF_DOMAIN_PATTERNS.some(pattern => pattern.test(message)); }

export function wantsMainPlacement(message: string) { return /\basosiy\s*(?:rasm\p{L}*\s*)?(?:qil|qo['‘’]?y|bo['‘’]?lsin)|\basosiyga\b|\bmain\b/iu.test(message); }

/** Text the admin typed to identify the product, without placement words. */
export function photoSearchText(message: string) {
  return message.replace(/\basosiy\s*(?:rasm\p{L}*\s*)?(?:qil\p{L}*|qo['‘’]?y\p{L}*|bo['‘’]?lsin)|\basosiyga\b|\bgalereya\p{L}*\b|\brasm\p{L}*\b|\bfoto\p{L}*\b|\bshu\b|\bbu\b|\buchun\b|\bga\b|\bqo['‘’]?y\p{L}*|\bqo['‘’]?sh\p{L}*|\bmahsulot\p{L}*/giu, " ").replace(/\s+/g, " ").trim();
}

export type PhotoCandidate = { id: string; name: string; model: string; category: string; hasMainImage: boolean; mainImage: string | null };

/** Models literally present in the message must match; the product kind named in the message narrows further. */
export function narrowPhotoCandidates(candidates: PhotoCandidate[], message: string) {
  const models = extractProductModels(message).map(compactModel);
  let result = models.length ? candidates.filter(item => models.includes(compactModel(item.model))) : candidates;
  const requested = detectAgentProductKind({ categoryName: "", message });
  if (requested !== "other") {
    const byKind = result.filter(item => candidateKind(item) === requested);
    if (byKind.length) result = byKind;
  }
  return result;
}
export function candidateKind(item: Pick<PhotoCandidate, "name" | "category">): AgentProductKind { return detectAgentProductKind({ categoryName: item.category, message: item.name }); }

/** Recommended candidate first (from image analysis), the rest in their original order. */
export function orderChoices(candidates: PhotoCandidate[], recommendedId: string | null) {
  const recommended = candidates.find(item => item.id === recommendedId);
  return recommended ? [recommended, ...candidates.filter(item => item !== recommended)] : candidates;
}

/** Without a main image the first photo becomes main; "asosiy qil" replaces it (the old one moves to the gallery). Others go to the gallery. */
export function planPlacements(count: number, hasMainImage: boolean, wantsMain: boolean): Array<"main" | "gallery"> {
  const firstIsMain = wantsMain || !hasMainImage;
  return Array.from({ length: count }, (_, index) => index === 0 && firstIsMain ? "main" : "gallery");
}
