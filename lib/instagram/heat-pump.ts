// Teplonasos bot: pure rules (no DB / network), covered by tests/instagram-heat-pump.test.mjs. Only the first account
// ("global", @buyuk_karavan) ever uses them; @eshikmaster never does.
import { classifyByKeywords, normalizeText } from "./rules";
import { DEFAULT_KEYWORDS } from "./constants";

export const HEAT_PUMP_ACCOUNT_ID = "global";
export const isHeatPumpAccount = (accountId: string | null | undefined) => accountId === HEAT_PUMP_ACCOUNT_ID;

export const SPECIALIST_PHONE = "+998 99 520 99 99";
export const CALL_CENTER_PHONE = "+998 91 637 77 77";
export const MAX_BOT_REPLIES = 5;

// ---- Telegram: teplonasos messages go only to one private chat, never to a group --------------------------

export const HEAT_PUMP_TELEGRAM_PHONE = "998916377777";
/** The lead was made by the teplonasos bot (Lead.submissionKey "ighp:<igsid>"). */
export const isHeatPumpLead = (lead: { submissionKey?: string | null }) => !!lead.submissionKey?.startsWith("ighp:");
/** The shared contact is the sender's own and is +998 91 637 77 77. */
export const isHeatPumpContact = (contact: { phone_number?: string; user_id?: number } | undefined, fromId: number | undefined) =>
  !!contact && contact.user_id === fromId && contact.phone_number?.replace(/\D/g, "") === HEAT_PUMP_TELEGRAM_PHONE;

/** Sends to the private chat: no chat_id → logged, nothing sent; a failure → logged and retried 3 times. Never a group. */
export async function deliverPrivate<T>(chatId: string | null, send: (chatId: string) => Promise<T>, log: (message: string, details: Record<string, unknown>) => void = console.error, wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))): Promise<T | null> {
  if (!chatId) { log("Teplonasos Telegram: chat_id yo‘q — xabar yuborilmadi", { hint: "+998 91 637 77 77 botga “/start teplonasos” yozib, raqamini ulashsin" }); return null; }
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { return await send(chatId); }
    catch (error) {
      log("Teplonasos Telegram yuborilmadi", { attempt, type: error instanceof Error ? error.name : "UnknownError" });
      if (attempt < 4) await wait(attempt * 1000);
    }
  }
  return null;
}
export const HUMAN_MUTE_MS = 24 * 3_600_000;

// ---- m² from a comment / message ----------------------------------------------------------------------------

const UNIT = String.raw`(?:kv\.?\s*m|kvadrat\p{L}*|kvd|kv|m2|m²|metr\p{L}*|кв\.?\s*м|квадрат\p{L}*|кв|км|м2|м²|метр\p{L}*)(?!\p{L})`;
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
  // Fallback: exactly one number of 20–1000 with an unclear unit is the area; percents and other units (land, weight,
  // volume, power, money) are not.
  if (/\d\s*(?:sotix|сотих|сотка|сотик|gektar|гектар|ga|га|kg|кг|tonna|тонна|litr|литр|kvt|квт|kw|hp|ot kuchi|от кучи|so'?m|sum|сум|сўм|\$)(?!\p{L})/u.test(text)) return null;
  const numbers = text.replace(/\d+\s*%/g, " ").match(/\d+(?:[.,]\d+)?/g) ?? [];
  return numbers.length === 1 && num(numbers[0]) >= 20 && num(numbers[0]) <= 1000 ? Math.round(num(numbers[0])) : null;
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

export type Lang = "uz" | "ru";
/**
 * Russian when the first text with letters is Cyrillic without the Uzbek-only letters ў қ ғ ҳ ("уй 150" in Uzbek
 * Cyrillic stays Uzbek); otherwise, and when no text has letters, Uzbek.
 */
export function langOf(...texts: Array<string | null | undefined>): Lang {
  const text = texts.find(item => item && /\p{L}/u.test(item));
  // A Cyrillic word of 3+ letters: a unit alone ("67км", "кв.м") does not make the comment Russian.
  return text && /[а-яё]{3}/i.test(text) && !/[ўқғҳ]/i.test(text) ? "ru" : "uz";
}

const T = {
  uz: {
    hello: "Assalomu alaykum!",
    footer: ["ℹ️ Bu hisob-kitob AI tomonidan internetdagi umumiy ma'lumotlar asosida berildi. Uyingizning uteplit holati va derazalariga qarab mutaxassis aniqroq maslahat va taklif beradi:", `👨‍🔧 Teplonasos mutaxassisi: ${SPECIALIST_PHONE}`, `🏪 Buyuk Karavan do'kon call-center: ${CALL_CENTER_PHONE}`, "", "📞 Telefon raqamingizni qoldiring — mutaxassis o'zi qo'ng'iroq qiladi."],
    big: (m2: number, hp: number, kw: number) => `${m2} m² uyingizni isitish uchun taxminan ${hp} HP · ${kw} kW quvvatli teplonasos kerak (qishki hisob, uy yaxshi uteplit qilingan bo'lsa). Uteplit sust bo'lsa, bundan ham kattaroq quvvat kerak bo'ladi. Bunday uy uchun loyiha individual tuziladi — narx va eng yaxshi variantni mutaxassis aytadi.`,
    title: (m2: number) => `${m2} m² uyingiz uchun mos teplonasos:`,
    heats: (m2: number) => `${m2} m² uyingizni isitadi, agar uyingiz yaxshi uteplit qilingan bo'lsa.`,
    bigger: (label: string) => ` Uteplitsiz bo'lsa, quvvat yetmay qolishi mumkin — unda ${label} kerak bo'ladi.`,
    price: "💵 Narxi:", som: (mln: string) => `~${mln} mln so'm`, rate: ", MB kursi bo'yicha", withBuffer: " — bufer bak bilan",
    noBuffer: (liters: number, usd: string, som: string) => `⚠️ Bufer bak narxga kirmaydi — ${liters} L, ${usd}${som}.`,
    volt: "⚡ Bu model 380V (3 faza) tokda ishlaydi.",
    fancoil: "⚠️ Narx faqat tashqi blok uchun. Xonalarga fankoyl (ichki blok) o'rnatish qo'shimcha.",
    delivery: "🚚 Butun O'zbekiston bo'ylab yetkazib beramiz (narxi kelishiladi).",
    m2Question: "Mos teplonasos va narxini aytishimiz uchun uyingiz necha m²?",
    replyCalc: (m2: number) => `${m2} m² uchun hisobni Direct'ga yubordik 📩`, replyAsk: "Uyingiz necha m²? Direct'ga yozdik 📩", replyQuestion: "Javobni Direct'ga yozdik 📩",
    offTopic: `Bu savol bo'yicha call-centerimizga murojaat qiling: ${CALL_CENTER_PHONE}`,
    limit: `Batafsil gaplashish uchun qo'ng'iroq qiling: ${SPECIALIST_PHONE}`, thanks: "Rahmat, mutaxassis tez orada qo'ng'iroq qiladi",
    friendly: "Rahmat! 🙌 Savollaringiz bo'lsa, Direct'ga yozing.",
  },
  ru: {
    hello: "Здравствуйте!",
    footer: ["ℹ️ Этот расчёт сделан ИИ на основе общих данных из интернета. С учётом утепления и окон вашего дома специалист даст более точную консультацию и предложение:", `👨‍🔧 Специалист по тепловым насосам: ${SPECIALIST_PHONE}`, `🏪 Call-центр магазина Buyuk Karavan: ${CALL_CENTER_PHONE}`, "", "📞 Оставьте номер телефона — специалист сам вам позвонит."],
    big: (m2: number, hp: number, kw: number) => `Для обогрева дома ${m2} м² нужен тепловой насос мощностью примерно ${hp} HP · ${kw} kW (зимний расчёт, если дом хорошо утеплён). При слабом утеплении понадобится ещё большая мощность. Для такого дома проект составляется индивидуально — цену и лучший вариант подскажет специалист.`,
    title: (m2: number) => `Подходящий тепловой насос для вашего дома ${m2} м²:`,
    heats: (m2: number) => `обогреет ваш дом ${m2} м², если дом хорошо утеплён.`,
    bigger: (label: string) => ` Если дом не утеплён, мощности может не хватить — тогда понадобится ${label}.`,
    price: "💵 Цена:", som: (mln: string) => `~${mln} млн сум`, rate: ", по курсу ЦБ", withBuffer: " — с буферным баком",
    noBuffer: (liters: number, usd: string, som: string) => `⚠️ Буферный бак не входит в цену — ${liters} л, ${usd}${som}.`,
    volt: "⚡ Эта модель работает от сети 380V (3 фазы).",
    fancoil: "⚠️ Цена только за наружный блок. Установка фанкойлов (внутренних блоков) в комнатах — дополнительно.",
    delivery: "🚚 Доставляем по всему Узбекистану (стоимость доставки по договорённости).",
    m2Question: "Чтобы подобрать тепловой насос и назвать цену, подскажите, какая площадь вашего дома в м²?",
    replyCalc: (m2: number) => `Расчёт для ${m2} м² отправили в Direct 📩`, replyAsk: "Какая площадь дома в м²? Написали вам в Direct 📩", replyQuestion: "Ответ отправили в Direct 📩",
    offTopic: `По этому вопросу обратитесь в наш call-центр: ${CALL_CENTER_PHONE}`,
    limit: `Чтобы обсудить подробнее, позвоните: ${SPECIALIST_PHONE}`, thanks: "Спасибо, специалист скоро вам позвонит",
    friendly: "Спасибо! 🙌 Если есть вопросы, пишите в Direct.",
  },
} as const;
export const texts = (lang: Lang) => T[lang];

export type HeatPumpCalc = { text: string; m2: number; big: boolean; summary: string; priceUsd: number | null };

/** The HISOB XABARI for m², in Uzbek or Russian (Instagram's limit is 1000 chars). */
export function calcMessage(m2: number, models: readonly HeatPumpRow[], rate: string | number | null, buffer: { usd: number; liters: number }, lang: Lang = "uz"): HeatPumpCalc {
  const t = T[lang], footer = t.footer.join("\n");
  const pick = pickHeatPump(m2, models);
  if (pick.big) return { text: `${t.hello} ${t.big(m2, pick.hp, pick.kw)}\n\n${footer}`, m2, big: true, summary: `Katta loyiha: ~${pick.hp} HP · ${pick.kw} kW`, priceUsd: null };
  const { model, bigger } = pick;
  const som = (usd: number) => mlnSom(usd, rate);
  const price = som(model.priceUsd), bufferSom = som(buffer.usd);
  const lines = [
    `${t.hello} ${t.title(m2)}`,
    `🔥 ${modelLabel(model)} — ${t.heats(m2)}${bigger ? t.bigger(modelLabel(bigger)) : ""}`,
    `${t.price} ${usdText(model.priceUsd)}${price ? ` (${t.som(price)}${t.rate})` : ""}${model.bufferIncluded ? t.withBuffer : ""}`,
    ...(model.bufferIncluded ? [] : [t.noBuffer(buffer.liters, usdText(buffer.usd), bufferSom ? ` (${t.som(bufferSom)})` : "")]),
    ...(model.voltage >= 380 ? [t.volt] : []),
    t.fancoil,
    t.delivery,
  ];
  return { text: `${lines.join("\n")}\n\n${footer}`, m2, big: false, summary: `${modelLabel(model)} — ${usdText(model.priceUsd)}`, priceUsd: model.priceUsd };
}

// ---- Comment on a teplonasos post -------------------------------------------------------------------------

export type HeatPumpIntent = "calc" | "ask" | "question" | "other";
export type HeatPumpComment = { kind: "HEAT_PUMP"; intent: HeatPumpIntent; m2: number | null } | { kind: "SPAM" | "NEGATIVE" | "POSITIVE" };

/** "@user @other 60 kvd qancha" → "60 kvd qancha": a reply starts with the people it answers. */
export const stripMentions = (text: string) => text.replace(/^\s*(?:@[\w.]+[\s,:]*)+/u, "").trim();

/** Keywords first: spam / negative, m², a price ask, praise; null = the AI decides. */
export function heatPumpByKeywords(input: string): HeatPumpComment | null {
  const text = stripMentions(input);
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

/**
 * One public reply and one Direct per person per post; an inactive post gets nothing. Exception (`lateM2`): the first m²
 * from a person who was answered without a calculation still gets the calculation and its public reply.
 */
export function heatPumpAction(rule: { isActive: boolean } | null, alreadyAnswered: boolean, underLimit: boolean, lateM2 = false) {
  if (rule && !rule.isActive) return { type: "skip" as const, reason: "Post uchun avto-javoblar o‘chirilgan" };
  if (alreadyAnswered && !lateM2) return { type: "skip" as const, reason: "Bu odamga shu postda javob berilgan — suhbat Direct’da" };
  return { type: "heatpump" as const, publicReply: underLimit };
}

/** A reply-comment is answered only on a teplonasos post, and only with m², a price ask or a teplonasos question. */
export const heatPumpReplyAnswered = (kind: string, intent: string | null, heatPumpPost: boolean) =>
  heatPumpPost && kind === "HEAT_PUMP" && (intent === "calc" || intent === "ask" || intent === "question");

/** Public reply and Direct text for a HEAT_PUMP comment; an off-topic one gets the call-center reply and no Direct. */
export function heatPumpOutgoing(intent: HeatPumpIntent, input: { m2?: number | null; calc?: string | null; answer?: string | null }, lang: Lang = "uz") {
  const t = T[lang];
  if (intent === "calc" && input.m2 && input.calc) return { reply: t.replyCalc(input.m2), dm: input.calc };
  if (intent === "ask") return { reply: t.replyAsk, dm: `${t.hello} ${t.m2Question}` };
  if (intent === "question") return { reply: t.replyQuestion, dm: `${t.hello} ${input.answer?.trim() ? `${input.answer.trim()}

` : ""}${t.m2Question}` };
  return { reply: t.offTopic, dm: null };
}

/** The Direct thread belongs to the recipient_id of the Private Reply's answer; the comment author's id is the fallback. */
export const threadIgsid = (fromId: string, sent: { recipient_id?: string | null } | null | undefined) => sent?.recipient_id?.trim() || fromId;

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
