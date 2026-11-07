// Teplonasos bot: pure rules (no DB / network), covered by tests/instagram-heat-pump.test.mjs. Only the first account
// ("global", @buyuk_karavan) ever uses them; @eshikmaster never does.
import { classifyByKeywords, normalizeText } from "./rules";
import { DEFAULT_KEYWORDS } from "./constants";

export const HEAT_PUMP_ACCOUNT_ID = "global";
export const isHeatPumpAccount = (accountId: string | null | undefined) => accountId === HEAT_PUMP_ACCOUNT_ID;

export const SPECIALIST_PHONE = "+998 99 520 99 99";
export const CALL_CENTER_PHONE = "+998 91 637 77 77";
export const OFF_TOPIC_TEXT = `Bu savol bo'yicha call-centerimizga murojaat qiling: ${CALL_CENTER_PHONE}`;
export const M2_QUESTION = "Mos teplonasos va narxini aytishimiz uchun uyingiz necha m²?";
export const ASK_DM = `Assalomu alaykum! ${M2_QUESTION}`;
export const LIMIT_TEXT = `Batafsil gaplashish uchun qo'ng'iroq qiling: ${SPECIALIST_PHONE}`;
export const PHONE_THANKS = "Rahmat, mutaxassis tez orada qo'ng'iroq qiladi";
export const MAX_BOT_REPLIES = 5;
export const HUMAN_MUTE_MS = 24 * 3_600_000;

// ---- m² from a comment / message ----------------------------------------------------------------------------

const UNIT = String.raw`(?:kv\.?\s*m|kvadrat\p{L}*|kv|m2|m²|metr\p{L}*|кв\.?\s*м|квадрат\p{L}*|кв|м2|м²|метр\p{L}*)(?!\p{L})`;
const num = (value: string) => Number(value.replace(",", "."));
const inRange = (value: number) => Number.isFinite(value) && value >= 20 && value <= 3000 ? Math.round(value) : null;
const isYear = (value: number) => value >= 1900 && value <= 2099;

/**
 * House area in m², or null: "150", "150 kv", "150m²", "150 метр", "уй 150", "10x12" → 120, "2 qavat 100 dan" → 200.
 * Phone numbers, prices ("1300$", "5 mln") and bare years are not areas; only 20–3000 m² counts.
 */
export function extractM2(input: string | null | undefined) {
  if (!input) return null;
  let text = normalizeText(input);
  // Phone numbers (9+ digits in one run) and prices go first.
  text = text.replace(/\+?\d[\d\s\-().]{7,}\d/g, match => match.replace(/\D/g, "").length >= 9 ? " " : match);
  text = text.replace(/\$\s*\d[\d\s.,]*|\d[\d.,]*\s*(?:\$|usd|dollar|доллар|у\.?е|so'?m|сум|сўм|ming|минг|тыс|mln|млн)/gu, " ");
  const floors = new RegExp(String.raw`(\d{1,2})\s*(?:qavat\p{L}*|этаж\p{L}*|etaj\p{L}*)\D{0,20}?(\d{2,4})`, "u").exec(text);
  if (floors) return inRange(num(floors[1]) * num(floors[2]));
  const dims = /(\d{1,3}(?:[.,]\d)?)\s*[xх×*]\s*(\d{1,3}(?:[.,]\d)?)/u.exec(text);
  if (dims) return inRange(num(dims[1]) * num(dims[2]));
  const unit = new RegExp(String.raw`(\d{2,4}(?:[.,]\d)?)\s*${UNIT}`, "u").exec(text);
  if (unit) return inRange(num(unit[1]));
  const house = /(?:^|[^\p{L}])(?:uy|уй|дом|dom|hovli|ҳовли)\p{L}{0,3}\s*(\d{2,4})(?!\d)/u.exec(text);
  if (house) return isYear(num(house[1])) ? null : inRange(num(house[1]));
  const bare = /^\D*?(\d{2,4})\D*$/u.exec(text);
  if (bare && !/\p{L}/u.test(text)) return isYear(num(bare[1])) ? null : inRange(num(bare[1]));
  return null;
}

// ---- Model choice ------------------------------------------------------------------------------------------

export type HeatPumpRow = { brand: string; hp: number; nominalKw: number; winterKw: number; voltage: number; priceUsd: number; bufferIncluded: boolean; isActive: boolean };
export type HeatPumpPick = { big: false; model: HeatPumpRow; bigger: HeatPumpRow | null } | { big: true; hp: number; kw: number };

const watts = (kw: number) => Math.round(kw * 1000);
/**
 * Winter need: m² × 80 W (well insulated), m² × 130 W (not insulated). The smallest active model whose winter kW covers
 * the insulated need; `bigger` = the smallest that covers the uninsulated need when the chosen one does not. When no
 * model is enough: nominal kW = need ÷ 0.66, HP ≈ nominal ÷ 3 (no price).
 */
export function pickHeatPump(m2: number, models: readonly HeatPumpRow[]): HeatPumpPick {
  const list = models.filter(item => item.isActive).sort((a, b) => a.winterKw - b.winterKw);
  const warm = m2 * 80, cold = m2 * 130;
  const model = list.find(item => watts(item.winterKw) >= warm);
  if (!model) { const nominal = warm / 1000 / 0.66; return { big: true, hp: Math.round(nominal / 3), kw: Math.round(nominal) }; }
  return { big: false, model, bigger: cold > watts(model.winterKw) ? list.find(item => watts(item.winterKw) >= cold) ?? null : null };
}

const group = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const short = (value: number) => String(Number(value.toFixed(1)));
export const modelLabel = (model: Pick<HeatPumpRow, "brand" | "hp" | "nominalKw">) => `${model.brand} ${short(model.hp)} HP · ${short(model.nominalKw)} kW`;
export const usdText = (usd: number) => `$${group(usd)}`;
/** $ × CBU rate in million so‘m, one decimal ("33.8"); null without a rate. */
export const mlnSom = (usd: number, rate: string | number | null | undefined) => rate && Number(rate) > 0 ? (usd * Number(rate) / 1e6).toFixed(1) : null;

const FOOTER = [
  "ℹ️ Bu hisob-kitob AI tomonidan internetdagi umumiy ma'lumotlar asosida berildi. Uyingizning uteplit holati va derazalariga qarab mutaxassis aniqroq maslahat va taklif beradi:",
  `👨‍🔧 Teplonasos mutaxassisi: ${SPECIALIST_PHONE}`,
  `🏪 Buyuk Karavan do'kon call-center: ${CALL_CENTER_PHONE}`,
  "",
  "📞 Telefon raqamingizni qoldiring — mutaxassis o'zi qo'ng'iroq qiladi.",
].join("\n");

export type HeatPumpCalc = { text: string; m2: number; big: boolean; summary: string; priceUsd: number | null };

/** The HISOB XABARI for m² (Instagram's limit is 1000 chars). */
export function calcMessage(m2: number, models: readonly HeatPumpRow[], rate: string | number | null, buffer: { usd: number; liters: number }): HeatPumpCalc {
  const pick = pickHeatPump(m2, models);
  if (pick.big) {
    const body = `${m2} m² uyingizni isitish uchun taxminan ${pick.hp} HP · ${pick.kw} kW quvvatli teplonasos kerak (qishki hisob, uy yaxshi uteplit qilingan bo'lsa). Uteplit sust bo'lsa, bundan ham kattaroq quvvat kerak bo'ladi. Bunday uy uchun loyiha individual tuziladi — narx va eng yaxshi variantni mutaxassis aytadi.`;
    return { text: `Assalomu alaykum! ${body}\n\n${FOOTER}`, m2, big: true, summary: `Katta loyiha: ~${pick.hp} HP · ${pick.kw} kW`, priceUsd: null };
  }
  const { model, bigger } = pick;
  const som = (usd: number) => mlnSom(usd, rate);
  const price = som(model.priceUsd), bufferSom = som(buffer.usd);
  const lines = [
    `Assalomu alaykum! ${m2} m² uyingiz uchun mos teplonasos:`,
    `🔥 ${modelLabel(model)} — ${m2} m² uyingizni isitadi, agar uyingiz yaxshi uteplit qilingan bo'lsa.${bigger ? ` Uteplitsiz bo'lsa, quvvat yetmay qolishi mumkin — unda ${modelLabel(bigger)} kerak bo'ladi.` : ""}`,
    `💵 Narxi: ${usdText(model.priceUsd)}${price ? ` (~${price} mln so'm, MB kursi bo'yicha)` : ""}${model.bufferIncluded ? " — bufer bak bilan" : ""}`,
    ...(model.bufferIncluded ? [] : [`⚠️ Bufer bak narxga kirmaydi — ${buffer.liters} L, ${usdText(buffer.usd)}${bufferSom ? ` (~${bufferSom} mln so'm)` : ""}.`]),
    ...(model.voltage >= 380 ? ["⚡ Bu model 380V (3 faza) tokda ishlaydi."] : []),
    "⚠️ Narx faqat tashqi blok uchun. Xonalarga fankoyl (ichki blok) o'rnatish qo'shimcha.",
    "🚚 Butun O'zbekiston bo'ylab yetkazib beramiz (narxi kelishiladi).",
  ];
  return { text: `${lines.join("\n")}\n\n${FOOTER}`, m2, big: false, summary: `${modelLabel(model)} — ${usdText(model.priceUsd)}`, priceUsd: model.priceUsd };
}

// ---- Comment on a teplonasos post -------------------------------------------------------------------------

export type HeatPumpIntent = "calc" | "ask" | "question" | "other";
export type HeatPumpComment = { kind: "HEAT_PUMP"; intent: HeatPumpIntent; m2: number | null } | { kind: "SPAM" | "NEGATIVE" | "POSITIVE" };

/** Keywords first: spam / negative, m², a price ask, praise; null = the AI decides. */
export function heatPumpByKeywords(text: string): HeatPumpComment | null {
  const keywords = classifyByKeywords(text, DEFAULT_KEYWORDS);
  if (keywords.fallback === "SPAM" || keywords.fallback === "NEGATIVE") return { kind: keywords.fallback };
  const m2 = extractM2(text);
  if (m2) return { kind: "HEAT_PUMP", intent: "calc", m2 };
  if (keywords.matched.includes("PRICE")) return { kind: "HEAT_PUMP", intent: "ask", m2: null };
  if (keywords.definite === "POSITIVE") return { kind: "POSITIVE" };
  return null;
}

/** The AI's { m2, topic } → the comment's kind. */
export function heatPumpFromAi(ai: { m2: number | null; topic: "heatpump" | "other" | "praise" | "spam" }): HeatPumpComment {
  const m2 = ai.m2 === null ? null : inRange(ai.m2);
  if (ai.topic === "spam") return { kind: "SPAM" };
  if (m2) return { kind: "HEAT_PUMP", intent: "calc", m2 };
  if (ai.topic === "praise") return { kind: "POSITIVE" };
  return { kind: "HEAT_PUMP", intent: ai.topic === "heatpump" ? "question" : "other", m2: null };
}

/** One public reply and one Direct per person per post; an inactive post gets nothing. */
export function heatPumpAction(rule: { isActive: boolean } | null, alreadyAnswered: boolean, underLimit: boolean) {
  if (rule && !rule.isActive) return { type: "skip" as const, reason: "Post uchun avto-javoblar o‘chirilgan" };
  if (alreadyAnswered) return { type: "skip" as const, reason: "Bu odamga shu postda javob berilgan — suhbat Direct’da" };
  return { type: "heatpump" as const, publicReply: underLimit };
}

/** Public reply and Direct text for a HEAT_PUMP comment; an off-topic one gets the call-center reply and no Direct. */
export function heatPumpOutgoing(intent: HeatPumpIntent, input: { m2?: number | null; calc?: string | null; answer?: string | null }) {
  if (intent === "calc" && input.m2 && input.calc) return { reply: `${input.m2} m² uchun hisobni Direct'ga yubordik 📩`, dm: input.calc };
  if (intent === "ask") return { reply: "Uyingiz necha m²? Direct'ga yozdik 📩", dm: ASK_DM };
  if (intent === "question") return { reply: "Javobni Direct'ga yozdik 📩", dm: `Assalomu alaykum! ${input.answer?.trim() ? `${input.answer.trim()}\n\n` : ""}${M2_QUESTION}` };
  return { reply: OFF_TOPIC_TEXT, dm: null };
}

// ---- Direct thread -----------------------------------------------------------------------------------------

/** Up to 5 bot replies, then the "call us" line once, then silence; a person's message in the thread mutes it for 24 h. */
export function directBotStep(thread: { botReplies: number; mutedUntil: Date | null }, now = new Date()): "reply" | "limit" | "silent" {
  if (thread.mutedUntil && thread.mutedUntil > now) return "silent";
  if (thread.botReplies < MAX_BOT_REPLIES) return "reply";
  return thread.botReplies === MAX_BOT_REPLIES ? "limit" : "silent";
}

/** Our echo is the bot's own message (same id, or the same text within 15 min); anything else was written by a person. */
export const isBotEcho = (echo: { mid: string; text: string | null; time: Date }, thread: { lastBotMid: string | null; lastBotText: string | null; lastBotAt: Date | null }) =>
  echo.mid === thread.lastBotMid || (!!echo.text && !!thread.lastBotText && echo.text.trim() === thread.lastBotText.trim() && !!thread.lastBotAt && Math.abs(thread.lastBotAt.getTime() - echo.time.getTime()) < 15 * 60_000);
