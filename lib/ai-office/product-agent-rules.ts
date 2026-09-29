export type CategoryCandidate = { name: string; slug: string };

export function normalizeRuleText(value: string) {
  return value.toLocaleLowerCase("uz-UZ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function categoryMatches(candidate: CategoryCandidate, standardName: string, synonyms: string[]) {
  const values = [candidate.name, candidate.slug].map(normalizeRuleText);
  const targets = [standardName, ...synonyms].map(normalizeRuleText);
  return values.some(value => targets.some(target => value === target || value.includes(target) || target.includes(value)));
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
