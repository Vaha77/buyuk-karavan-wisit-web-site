// Xolodilnik bot: pure rules (no DB / network), covered by tests/instagram-cooler.test.mjs. Only the "global" account
// (@buyuk_karavan), only on posts of the "Xolodilnik (tonna)" type; the Direct side reuses the teplonasos thread.
import { extractPhone } from "./direct-rules";
import { isHeatPumpAccount, mlnSom, stripMentions, texts as heatTexts, type Lang } from "./heat-pump";
import { sellPrice } from "../prays/rules";
import { normalizeText } from "./rules";

const UZ = {
  reply: "Rahmat! Batafsil hisobni direktingizga yozdim 📩",
  ask: "Assalomu alaykum! {tonna} tonnalik xolodilnik — zo'r 👍 Kamerani nechta qilmoqchisiz? Masalan: {kamera} ta 100 tonnalik.",
  kit: "{kamera} ta kamera uchun {komplekt}:\n{tarkib}\n\n💵 Bitta komplekt: {narx}\n💰 Jami ({kamera} ta): {jami}\n\nSiz faqat elektr kabelini olasiz, qolgan hammasi bizdan.",
  noKit: "{kamera} ta {hajm} tonnalik kamera uchun narxni sotuvchimiz aniq hisoblaydi.",
  final: "Qaysi viloyatdasiz? Telefon raqamingizni qoldiring, ustamiz bog'lanadi 📞",
  phone: "Rahmat! Telefon raqamingizni ham qoldiring, ustamiz bog'lanadi 📞",
  thanks: "Rahmat! Ustamiz tez orada bog'lanadi ✅",
  handoff: "Sotuvchimiz hozir yozadi",
  noPrice: "Narxni sotuvchimiz aniq aytadi",
};
export type CoolerTexts = typeof UZ;
export const COOLER_TEXTS: Record<Lang, CoolerTexts> = {
  uz: UZ,
  ru: {
    reply: "Спасибо! Подробный расчёт отправили вам в Direct 📩",
    ask: "Здравствуйте! Холодильник на {tonna} тонн — отлично 👍 Сколько камер планируете? Например: {kamera} камеры по 100 тонн.",
    kit: "Для {kamera} камер — {komplekt}:\n{tarkib}\n\n💵 Один комплект: {narx}\n💰 Итого ({kamera} шт): {jami}\n\nС вас только электрический кабель, всё остальное — от нас.",
    noKit: "Для {kamera} камер по {hajm} тонн цену точно рассчитает наш продавец.",
    final: "В какой вы области? Оставьте номер телефона, наш мастер свяжется 📞",
    phone: "Спасибо! Оставьте также номер телефона, наш мастер свяжется 📞",
    thanks: "Спасибо! Наш мастер скоро свяжется ✅",
    handoff: "Наш продавец сейчас напишет",
    noPrice: "Цену точно скажет наш продавец",
  },
};
export const COOLER_TEXT_KEYS = Object.keys(UZ) as Array<keyof CoolerTexts>;
/** Saved texts ({ uz: {...}, ru: {...} }) over the defaults; an empty saved text keeps the default. */
export function coolerTexts(saved: unknown): Record<Lang, CoolerTexts> {
  const pick = (lang: Lang) => {
    const value = ((saved as Record<string, unknown> | null)?.[lang] ?? {}) as Record<string, unknown>;
    return Object.fromEntries(COOLER_TEXT_KEYS.map(key => [key, typeof value[key] === "string" && value[key].trim() ? value[key].trim() : COOLER_TEXTS[lang][key]])) as CoolerTexts;
  };
  return { uz: pick("uz"), ru: pick("ru") };
}

/** Tonnage of a comment, only on a "Xolodilnik (tonna)" post of the "global" account; a teplonasos post never. */
export const coolerTons = (rule: { cooler: boolean; heatPump: boolean } | null, accountId: string, text: string) =>
  rule?.cooler && !rule.heatPump && isHeatPumpAccount(accountId) ? extractTons(text) : null;

const TON = String.raw`(?:t|tn|tonna\p{L}*|тонн\p{L}*|тн|т)(?!\p{L})`;
const inTons = (value: number) => value >= 5 && value <= 20_000 ? value : null;

/** Tonnage from a comment: "300", "300 tonna", "300t", "300 тонна", "@user 300 tonnalik" → 300; phones / no number → null. */
export function extractTons(input: string | null | undefined) {
  if (!input) return null;
  const text = normalizeText(stripMentions(input)).replace(/\+?\d[\d\s\-().]{7,}\d/g, match => match.replace(/\D/g, "").length >= 9 ? " " : match);
  const unit = new RegExp(String.raw`(\d{1,5})\s*${TON}`, "u").exec(text);
  if (unit) return inTons(Number(unit[1]));
  // One number without another unit (m², kg, money, power, %) is the tonnage: "300 kerak" → 300.
  if (/\d\s*(?:kv|m2|m²|metr|кв|м2|метр|sotix|сотих|kg|кг|\$|so'?m|сум|сўм|mln|млн|ming|минг|hp|kw|kvt|квт|%)/u.test(text)) return null;
  const numbers = text.match(/\d+/g) ?? [];
  return numbers.length === 1 ? inTons(Number(numbers[0])) : null;
}

const WORDS: Array<[RegExp, number]> = [
  [/^(?:bitta|bir|битта|бир|один|одна|одну)$/u, 1], [/^(?:ikkita|ikki|иккита|икки|два|две)$/u, 2], [/^(?:uchta|uch|учта|уч|три)$/u, 3],
  [/^(?:to'rtta|to'rt|тўртта|четыре)$/u, 4], [/^(?:beshta|besh|бешта|пять)$/u, 5], [/^(?:oltita|olti|шесть)$/u, 6],
];
const wordNumber = (text: string) => text.split(/[^\p{L}']+/u).map(word => WORDS.find(([pattern]) => pattern.test(word))?.[1]).find(Boolean) ?? null;

/** Chambers from a Direct answer: "3", "3 ta", "3 ta 100 dan", "2 ta 150 dan", "3x100", "bitta" → { count, size | null }. */
export function extractChambers(input: string | null | undefined) {
  if (!input) return null;
  const text = normalizeText(input);
  const dims = /(\d{1,2})\s*[xх×*]\s*(\d{2,5})/u.exec(text);
  if (dims) return { count: Number(dims[1]), size: Number(dims[2]) };
  const size = /(\d{2,5})\s*(?:t|tn|tonna\p{L}*|тонн\p{L}*|тн|т)?\s*(?:dan|дан|tadan|тадан|lik|лик)(?!\p{L})|по\s*(\d{2,5})/u.exec(text);
  const rest = size ? text.replace(size[0], " ") : text;
  const counted = /(\d{1,2})\s*(?:ta|та|dona|дона|шт|kamera\p{L}*|камер\p{L}*)(?!\p{L})/u.exec(rest);
  const numbers = rest.match(/\d+/g) ?? [];
  const count = counted ? Number(counted[1]) : numbers.length === 1 && (size || !/\p{L}{3}/u.test(rest)) ? Number(numbers[0]) : !numbers.length ? wordNumber(rest) : null;
  return count && count >= 1 && count <= 50 ? { count, size: size ? Number(size[1] ?? size[2]) : null } : null;
}

export type CoolerKitRow = { minTons: number; maxTons: number; name: string; items: string[]; priceUsd: number | null; isActive: boolean };
/** The active kit whose tonnage range holds one chamber; the narrowest range wins. */
export const pickKit = (tons: number, kits: readonly CoolerKitRow[]) =>
  kits.filter(kit => kit.isActive && kit.minTons <= tons && tons <= kit.maxTons).sort((a, b) => (a.maxTons - a.minTons) - (b.maxTons - b.minTons))[0] ?? null;
/**
 * Selling price of a kit: the linked Prays product's base price + the site markup (10 %), rounded up to whole dollars
 * (4454 → $4 900), else its selling price; the kit's own price only as a fallback; null = no price.
 */
export function kitPrice(kit: { priceUsd: number | null }, product: { basePriceUsd: number | null; priceUsd: number | null; archivedAt: Date | null } | null, markup: number) {
  if (product && !product.archivedAt) {
    if (product.basePriceUsd && product.basePriceUsd > 0) return sellPrice(product.basePriceUsd, markup);
    if (product.priceUsd && product.priceUsd > 0) return product.priceUsd;
  }
  return kit.priceUsd && kit.priceUsd > 0 ? kit.priceUsd : null;
}

const usd = (value: number) => `$${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
/** "$4 900 (~62.5 mln so'm)"; without a CBU rate only the dollars. */
export function priceText(value: number, rate: string | number | null, lang: Lang = "uz") {
  const mln = mlnSom(value, rate);
  return `${usd(value)}${mln ? ` (${heatTexts(lang).som(mln)})` : ""}`;
}
/** Kit price × chambers; null when the kit has no price. */
export const totalUsd = (kit: Pick<CoolerKitRow, "priceUsd">, chambers: number) => kit.priceUsd && kit.priceUsd > 0 ? kit.priceUsd * chambers : null;

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (match, key: string) => key in values ? String(values[key]) : match);
export const askText = (texts: CoolerTexts, tons: number) => fill(texts.ask, { tonna: tons, kamera: Math.max(1, Math.round(tons / 100)) });

/** The kit message (without a price: {narx} = noPrice text, the {jami} line dropped) + the final questions. */
export function kitText(texts: CoolerTexts, kit: CoolerKitRow, chambers: number, rate: string | number | null = null, lang: Lang = "uz") {
  const total = totalUsd(kit, chambers);
  const template = total === null ? texts.kit.split("\n").filter(line => !line.includes("{jami}")).join("\n") : texts.kit;
  return `${fill(template, { kamera: chambers, komplekt: kit.name, tarkib: kit.items.map(item => `✅ ${item}`).join("\n"), narx: total === null ? texts.noPrice : priceText(kit.priceUsd!, rate, lang), jami: total === null ? "" : priceText(total, rate, lang) })}\n\n${texts.final}`;
}

const REGIONS: Array<[string, RegExp]> = [
  ["Qoraqalpog'iston", /qoraqalpo|қорақалпо|каракалпа|nukus|нукус/u],
  ["Toshkent", /toshkent|тошкент|ташкент|tashkent/u],
  ["Samarqand", /samarqand|самарқанд|самарканд/u],
  ["Buxoro", /buxoro|бухоро|бухар/u],
  ["Andijon", /andijon|андижо|андижа/u],
  ["Farg'ona", /farg'?ona|фарғона|фергана|qo'qon|қўқон|коканд/u],
  ["Namangan", /namangan|наманган/u],
  ["Qashqadaryo", /qashqadaryo|қашқадарё|кашкадарь|qarshi|қарши|карши/u],
  ["Surxondaryo", /surxondaryo|сурхондарё|сурхандарь|termiz|термиз|термез/u],
  ["Xorazm", /xorazm|хоразм|хорезм|urganch|урганч|ургенч/u],
  ["Navoiy", /navoi|навоий|навои/u],
  ["Jizzax", /jizzax|жиззах|джизак/u],
  ["Sirdaryo", /sirdaryo|сирдарё|сырдарь|guliston|гулистон/u],
];
export const extractRegion = (input: string | null | undefined) => {
  const text = normalizeText(input ?? "");
  return REGIONS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
};

export type CoolerState = { step: string | null; tons: number | null; chambers: number | null; region: string | null; misses: number };
export type CoolerTurn = { reply: string | null; data: Partial<CoolerState & { model: string; phone: string }>; lead?: boolean; handoff?: boolean };

const miss = (thread: CoolerState, texts: CoolerTexts, again: string): CoolerTurn =>
  thread.misses + 1 >= 2 ? { reply: texts.handoff, data: { step: "handoff", misses: thread.misses + 1 }, lead: true, handoff: true } : { reply: again, data: { misses: thread.misses + 1 } };

/**
 * One customer message → the bot's answer and the new state. chambers: kamera soni → kit + total; a chamber size with
 * no kit → no price, "the seller calculates" + lead. contact: phone → lead (region kept when given). Two unclear
 * answers → the seller takes over (lead).
 */
export function coolerTurn(thread: CoolerState, text: string, kits: readonly CoolerKitRow[], texts: CoolerTexts, rate: string | number | null = null, lang: Lang = "uz"): CoolerTurn {
  if (thread.step === "chambers" && thread.tons) {
    const parsed = extractChambers(text);
    if (!parsed) return miss(thread, texts, askText(texts, thread.tons));
    const size = parsed.size ?? Math.round(thread.tons / parsed.count);
    const kit = pickKit(size, kits);
    if (!kit) return { reply: `${fill(texts.noKit, { kamera: parsed.count, hajm: size })}\n\n${texts.final}`, data: { step: "contact", chambers: parsed.count, model: `${parsed.count} × ${size} t — komplekt jadvalda yo‘q`, misses: 0 }, lead: true };
    const total = totalUsd(kit, parsed.count);
    return { reply: kitText(texts, kit, parsed.count, rate, lang), data: { step: "contact", chambers: parsed.count, model: `${parsed.count} × ${kit.name}${total === null ? "" : ` = ${usd(total)}`}`, misses: 0 } };
  }
  if (thread.step === "contact") {
    const phone = extractPhone(text), region = extractRegion(text) ?? thread.region;
    if (phone) return { reply: texts.thanks, data: { step: "done", phone, region }, lead: true };
    if (region && region !== thread.region) return { reply: texts.phone, data: { region } };
    return miss(thread, texts, texts.final);
  }
  return { reply: null, data: {} };
}

/** One public reply + DM flow per person per post (a comment is claimed once); an inactive post gets nothing. */
export function coolerAction(rule: { isActive: boolean } | null, alreadyAnswered: boolean, underLimit: boolean) {
  if (rule && !rule.isActive) return { type: "skip" as const, reason: "Post uchun avto-javoblar o‘chirilgan" };
  if (alreadyAnswered) return { type: "skip" as const, reason: "Bu odamga shu postda javob berilgan — suhbat Direct’da" };
  return { type: "cooler" as const, publicReply: underLimit };
}

/** The lead was made by the xolodilnik bot (Lead.submissionKey "igcool:<igsid>"): Telegram → the Instagram admins. */
export const isCoolerLead = (lead: { submissionKey?: string | null }) => !!lead.submissionKey?.startsWith("igcool:");
