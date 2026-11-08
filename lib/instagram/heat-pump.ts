// Teplonasos bot: pure rules (no DB / network), covered by tests/instagram-heat-pump.test.mjs. Only the first account
// ("global", @buyuk_karavan) ever uses them; @eshikmaster never does.
import { aiReplyProblem, classifyByKeywords, normalizeText } from "./rules";
import { DEFAULT_KEYWORDS } from "./constants";

export const HEAT_PUMP_ACCOUNT_ID = "global";
export const isHeatPumpAccount = (accountId: string | null | undefined) => accountId === HEAT_PUMP_ACCOUNT_ID;

export const SPECIALIST_PHONE = "+998 99 520 99 99";
export const CALL_CENTER_PHONE = "+998 91 637 77 77";
export const MAX_BOT_REPLIES = 5;
/** Calculations per person per post in 24 h (comments); more → the specialist's phone in the public reply. */
export const MAX_CALCS_PER_DAY = 5;

// ---- Telegram: teplonasos messages go only to one private chat, never to a group --------------------------

export const HEAT_PUMP_TELEGRAM_PHONE = "998916377777";
/** The lead was made by the teplonasos bot (Lead.submissionKey "ighp:<igsid>"). */
export const isHeatPumpLead = (lead: { submissionKey?: string | null }) => !!lead.submissionKey?.startsWith("ighp:");
/** The shared contact is the sender's own and is +998 91 637 77 77. */
export const isHeatPumpContact = (contact: { phone_number?: string; user_id?: number } | undefined, fromId: number | undefined) =>
  !!contact && contact.user_id === fromId && contact.phone_number?.replace(/\D/g, "") === HEAT_PUMP_TELEGRAM_PHONE;

export type BacklogLead = { customerName: string | null; dimensions: string | null; product: string | null; phone: string | null };
/** The leads that could not be sent while no chat was linked, in one message (Telegram's limit is 4096 chars). */
export function backlogText(leads: readonly BacklogLead[]) {
  const lines = leads.map((lead, index) => `${index + 1}. ${[lead.customerName ?? "Instagram", lead.dimensions, lead.product, lead.phone ? `📞 ${lead.phone}` : null].filter(Boolean).join(" · ")}`);
  let text = `📬 Ulanmagan paytdagi ${leads.length} ta xabar (teplonasos):\n\n`;
  for (const [index, line] of lines.entries()) {
    if (text.length + line.length > 3900) { text += `… va yana ${lines.length - index} ta (Mijoz so‘rovlarida)`; break; }
    text += `${line}\n`;
  }
  return text.trim();
}

/** 20:00 report: the teplonasos conversations still waiting, only for the private chat. */
export const heatWaitingText = (date: string, rows: ReadonlyArray<{ label: string; waited: string }>) =>
  [`🔥 Teplonasos Direct · ${date} — javob kutayotganlar: ${rows.length}`, ...rows.slice(0, 40).map((row, index) => `${index + 1}. ${row.label} — ${row.waited}`)].join("\n");

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

const UNIT = String.raw`(?:kv\.?\s*m|kvadrat\p{L}*|kwadrat\p{L}*|kvd|kv|m2|m²|metr\p{L}*|кв\.?\s*м|квадрат\p{L}*|кв|км|м2|м²|метр\p{L}*)(?!\p{L})`;
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
  // Rooms: "3.4 4ta xona", "3x4 4 ta xona" → 3 × 4 m each × 4 rooms = 48.
  const rooms = /(\d{1,2})\s*[x×х*.,]\s*(\d{1,2})(?!\d)\D{0,6}?(\d{1,2})\s*(?:ta|та)?\s*(?:xon|хон|комнат|room)\p{L}*/u.exec(text);
  if (rooms) return inRange(num(rooms[1]) * num(rooms[2]) * num(rooms[3]));
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

/** Ceiling height in m: "balandligi 3 metr", "высота 3.5 м" → 3 / 3.5, else null. */
export function extractHeight(input: string | null | undefined) {
  const match = /(?:balandlig\p{L}*|баландлиг\p{L}*|высот\p{L}*|потол\p{L}*|shift\p{L}*)\D{0,8}?(\d(?:[.,]\d+)?)\s*(?:m|м|metr|метр)?(?!\p{L})/u.exec(normalizeText(input ?? ""));
  return match ? num(match[1]) : null;
}

const kwValue = (text: string) => { const match = /(\d{1,5}(?:[.,]\d)?)\s*(?:kw|kvt|квт|кв\.?\s*т|kilovat\p{L}*|киловат\p{L}*)(?!\p{L})/u.exec(text); return match ? num(match[1]) : null; };
/** Needed heat power from a comment / message: "180KW", "180 квт", "12 kvt", "12,5 kW" → kW (1–500), else null. */
export function extractKw(input: string | null | undefined) {
  const value = kwValue(normalizeText(stripMentions(input ?? ""))) ?? NaN;
  return value >= 1 && value <= 500 ? Math.round(value) : null;
}

export type HeatValues = { m2: number | null; kw: number | null; absurd?: true; clarify?: number; power?: number };
const BARE_KV = /(\d{2,4})\s*(?:kv|кв)(?!\p{L}|\.?\s*[mм](?!\p{L}))/u;
const POWER = /(?:^|[^\p{L}])(?:tok|oyiga|sarf\p{L}*|свет\p{L}*|расход\p{L}*)(?!\p{L})/u;
/**
 * m² / kW of a comment or Direct message. The AI's number counts only when the person wrote it ("5,4" = 5.4), else the
 * parser's. kW > 500 or m² > 20 000 → `absurd` (a joke, no calculation); kW with "tok / oyiga / sarf / свет / расход" →
 * `power` (monthly use); a bare "170 кв" the AI read as kW → `clarify` (m² or kW?).
 */
export function directValues(text: string, ai: { m2: number | null; kw: number | null } | null): HeatValues {
  const clean = normalizeText(stripMentions(text));
  const said = new Set((clean.match(/\d+(?:[.,]\d+)?/g) ?? []).map(num));
  const aiKw = ai?.kw && said.has(ai.kw) ? ai.kw : null, aiM2 = ai?.m2 && said.has(ai.m2) ? ai.m2 : null;
  const rawKw = kwValue(clean) ?? aiKw, none = { m2: null, kw: null };
  if ((rawKw ?? 0) > 500 || (aiM2 ?? 0) > 20000) return { ...none, absurd: true };
  if (rawKw && POWER.test(clean)) return { ...none, power: rawKw };
  const kw = extractKw(text), m2 = (aiM2 ? inRange(aiM2) : null) ?? extractM2(text), bare = BARE_KV.exec(clean);
  if (!kw && aiKw && bare && num(bare[1]) === aiKw) return { ...none, clarify: aiKw };
  if (kw || (aiKw && aiKw >= 1 && !m2)) return { m2: null, kw: kw ?? Math.round(aiKw!) };
  return { m2, kw: null };
}
/** Monthly electricity of a `kw` pump: ≈ kW × 10 h × 30 days, approximate; the so'm price is the specialist's. */
export const powerText = (kw: number, lang: Lang = "uz") => T[lang].power(String(Number(kw.toFixed(1))), Math.round(kw * 300));

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
  if (!model) { const nominal = warm / 1000 / 0.66; return { big: true, hp: Math.round(nominal / 3), kw: Math.round(warm / 1000) }; }
  return { big: false, model, bigger: cold > watts(model.winterKw) ? list.find(item => watts(item.winterKw) >= cold) ?? null : null };
}

const group = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const short = (value: number) => String(Number(value.toFixed(1)));
// Only the winter kW goes to customers (8 HP → 15.8 kW), never the nominal.
export const modelLabel = (model: Pick<HeatPumpRow, "brand" | "hp" | "winterKw">) => `${model.brand} ${short(model.hp)} HP · ${short(model.winterKw)} kW`;
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
    limit: `Batafsil gaplashish uchun qo'ng'iroq qiling: ${SPECIALIST_PHONE}`, calcLimit: `Ko'proq hisob uchun mutaxassisga qo'ng'iroq qiling: ${SPECIALIST_PHONE}`, thanks: "Rahmat, mutaxassis tez orada qo'ng'iroq qiladi",
    friendly: "Rahmat! 🙌 Savollaringiz bo'lsa, Direct'ga yozing.",
    titleKw: (kw: number) => `${kw} kW issiqlik uchun mos teplonasos:`,
    givesKw: (kw: number) => `qishda (−12°C) ${kw} kW issiqlik beradi.`,
    bigKw: (kw: number, hp: number) => `${kw} kW issiqlik uchun taxminan ${hp} HP quvvatli teplonasos kerak (qishki hisob). Bunday loyiha individual tuziladi — narx va eng yaxshi variantni mutaxassis aytadi: ${SPECIALIST_PHONE}. Bino necha m² va qayerda joylashgan?`,
    replyKw: (kw: number) => `${kw} kW uchun hisobni Direct'ga yubordik 📩`, tall: "⚠️ Shift baland — mutaxassis aniq hisoblaydi.",
    joke: "😄 Bunchasi butun mahallani isitadi! Uyingiz necha m²?", clarify: (n: number) => `${n} m² mi yoki ${n} kW?`,
    power: (kw: string, kwh: number) => `⚡ ${kw} kW kuniga ~10 soat ishlasa: ~${kwh} kWh/oy (taxminan, ish rejimiga bog'liq). So'mdagi narxini mutaxassis aytadi: ${SPECIALIST_PHONE}`,
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
    limit: `Чтобы обсудить подробнее, позвоните: ${SPECIALIST_PHONE}`, calcLimit: `Для дополнительных расчётов позвоните специалисту: ${SPECIALIST_PHONE}`, thanks: "Спасибо, специалист скоро вам позвонит",
    friendly: "Спасибо! 🙌 Если есть вопросы, пишите в Direct.",
    titleKw: (kw: number) => `Подходящий тепловой насос на ${kw} kW тепла:`,
    givesKw: (kw: number) => `зимой (−12°C) даёт ${kw} kW тепла.`,
    bigKw: (kw: number, hp: number) => `Для ${kw} kW тепла нужен тепловой насос примерно на ${hp} HP (зимний расчёт). Такой проект составляется индивидуально — цену и лучший вариант подскажет специалист: ${SPECIALIST_PHONE}. Какая площадь здания в м² и где оно находится?`,
    replyKw: (kw: number) => `Расчёт для ${kw} kW отправили в Direct 📩`, tall: "⚠️ Потолок высокий — специалист рассчитает точно.",
    joke: "😄 Столько хватит на целый квартал! Какая площадь вашего дома в м²?", clarify: (n: number) => `${n} м² или ${n} kW?`,
    power: (kw: string, kwh: number) => `⚡ ${kw} kW при работе ~10 часов в день: ~${kwh} кВт·ч/мес (примерно, зависит от режима работы). Стоимость в сумах подскажет специалист: ${SPECIALIST_PHONE}`,
  },
} as const;
export const texts = (lang: Lang) => T[lang];

export type HeatPumpCalc = { text: string; m2: number; big: boolean; summary: string; priceUsd: number | null };

/** The HISOB XABARI for m², in Uzbek or Russian (Instagram's limit is 1000 chars). */
/** `hello`: only the chat's first message greets; `footer` (AI note, 2 phones, "leave your phone"): only the first calculation. */
export type CalcStyle = { hello?: boolean; footer?: boolean };
const styled = (t: (typeof T)[Lang], style: CalcStyle) => ({ hello: style.hello === false ? "" : `${t.hello} `, footer: style.footer === false ? "" : `\n\n${t.footer.join("\n")}` });

export function calcMessage(m2: number, models: readonly HeatPumpRow[], rate: string | number | null, buffer: { usd: number; liters: number }, lang: Lang = "uz", style: CalcStyle = {}): HeatPumpCalc {
  const t = T[lang], { hello, footer } = styled(t, style);
  const pick = pickHeatPump(m2, models);
  if (pick.big) return { text: `${hello}${t.big(m2, pick.hp, pick.kw)}${footer}`, m2, big: true, summary: `Katta loyiha: ~${pick.hp} HP · ${pick.kw} kW`, priceUsd: null };
  const { model, bigger } = pick;
  const lines = [`${hello}${t.title(m2)}`, `🔥 ${modelLabel(model)} — ${t.heats(m2)}${bigger ? t.bigger(modelLabel(bigger)) : ""}`, ...modelLines(model, rate, buffer, lang)];
  return { text: `${lines.join("\n")}${footer}`, m2, big: false, summary: `${modelLabel(model)} — ${usdText(model.priceUsd)}`, priceUsd: model.priceUsd };
}

/** Price (with the CBU so‘m), buffer tank, 380V, fan-coil and delivery lines of one model. */
function modelLines(model: HeatPumpRow, rate: string | number | null, buffer: { usd: number; liters: number }, lang: Lang) {
  const t = T[lang], price = mlnSom(model.priceUsd, rate), bufferSom = mlnSom(buffer.usd, rate);
  return [
    `${t.price} ${usdText(model.priceUsd)}${price ? ` (${t.som(price)}${t.rate})` : ""}${model.bufferIncluded ? t.withBuffer : ""}`,
    ...(model.bufferIncluded ? [] : [t.noBuffer(buffer.liters, usdText(buffer.usd), bufferSom ? ` (${t.som(bufferSom)})` : "")]),
    ...(model.voltage >= 380 ? [t.volt] : []),
    t.fancoil,
    t.delivery,
  ];
}

/**
 * The HISOB XABARI for a needed winter heat power (kW): the smallest active model whose winter kW covers it, with its
 * price; more than any model → big project: nominal ≈ kW ÷ 0.66, HP ≈ nominal ÷ 3, no price, the specialist, m² + place.
 */
export function calcKwMessage(kw: number, models: readonly HeatPumpRow[], rate: string | number | null, buffer: { usd: number; liters: number }, lang: Lang = "uz", style: CalcStyle = {}): HeatPumpCalc {
  const t = T[lang], { hello, footer } = styled(t, style);
  const model = models.filter(item => item.isActive).sort((a, b) => a.winterKw - b.winterKw).find(item => item.winterKw >= kw);
  if (!model) {
    const hp = Math.round(kw / 0.66 / 3);
    return { text: `${hello}${t.bigKw(kw, hp)}${footer}`, m2: 0, big: true, summary: `${kw} kW → katta loyiha: ~${hp} HP`, priceUsd: null };
  }
  const lines = [`${hello}${t.titleKw(kw)}`, `🔥 ${modelLabel(model)} — ${t.givesKw(Number(short(model.winterKw)))}`, ...modelLines(model, rate, buffer, lang)];
  return { text: `${lines.join("\n")}${footer}`, m2: 0, big: false, summary: `${kw} kW → ${modelLabel(model)} — ${usdText(model.priceUsd)}`, priceUsd: model.priceUsd };
}

// ---- Comment on a teplonasos post -------------------------------------------------------------------------

export type HeatPumpIntent = "calc" | "kw" | "ask" | "question" | "other";
export type HeatPumpComment = { kind: "HEAT_PUMP"; intent: HeatPumpIntent; m2: number | null; kw?: number | null } | { kind: "SPAM" | "NEGATIVE" | "POSITIVE" };

/** "@user @other 60 kvd qancha" → "60 kvd qancha": a reply starts with the people it answers. */
export const stripMentions = (text: string) => text.replace(/^\s*(?:@[\w.]+[\s,:]*)+/u, "").trim();

/** Keywords first: spam / negative, m², a price ask, praise; null = the AI decides. */
export function heatPumpByKeywords(input: string): HeatPumpComment | null {
  const text = stripMentions(input);
  const keywords = classifyByKeywords(text, DEFAULT_KEYWORDS);
  if (keywords.fallback === "SPAM" || keywords.fallback === "NEGATIVE") return { kind: keywords.fallback };
  const kw = extractKw(text);
  if (kw) return { kind: "HEAT_PUMP", intent: "kw", m2: null, kw };
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

// ---- AI-first ("odamdek"): the AI understands, the code calculates ------------------------------------------

export const HEAT_AI_INTENTS = ["AREA_M2", "POWER_KW", "QUESTION", "BANTER", "PRAISE", "OTHER_PRODUCT", "SPAM_INSULT"] as const;
export type HeatAi = { intent: (typeof HEAT_AI_INTENTS)[number]; m2: number | null; kw: number | null; topic: string | null; lang: Lang; public_reply: string; dm_extra: string; specialist?: boolean };
const EMOJI = /\p{Extended_Pictographic}/gu;

/**
 * An AI text that may go out, or "". Both: no "AI", no link / @mention, no number except our two phones (prices, HP and
 * kW come only from the code). A public reply: also no phone, price, promise (aiReplyProblem; emoji-only is fine) and at
 * most 2 emoji.
 */
export function safeAiText(text: string | null | undefined, max: number, isPublic = false) {
  const value = (text ?? "").trim().slice(0, max);
  if (!value) return "";
  const withoutPhones = value.replaceAll(SPECIALIST_PHONE, "").replaceAll(CALL_CENTER_PHONE, "");
  if (/\d|@|https?:|www\./.test(withoutPhones) || /(?:^|[^\p{L}])(?:ai|ии|chatgpt|gpt)(?!\p{L})|sun'iy intellekt|сунъий интеллект|искусственн/iu.test(value)) return "";
  if (isPublic && ((/\p{L}/u.test(value) && aiReplyProblem(value)) || (value.match(EMOJI)?.length ?? 0) > 2)) return "";
  return value;
}

/**
 * The AI's answer → the comment's kind for the existing flow. m² / kW (the code calculates) win over the intent; a
 * question beside them goes to the DM as `extra`. BANTER / PRAISE → POSITIVE with the AI's reply; OTHER_PRODUCT → the
 * call-center reply; SPAM_INSULT → no reply.
 */
export function heatPumpFromAiReply(ai: HeatAi, text = ""): { result: HeatPumpComment; reply: string; extra: string; lang: Lang; tag: string; specialist: boolean } {
  const lang: Lang = ai.lang === "ru" ? "ru" : "uz", tag = `AI:${ai.intent}`.slice(0, 20), specialist = !!ai.specialist && ai.intent === "QUESTION";
  // A question no fact answers (material / service price…): the smooth "the specialist will answer" in the DM.
  const extra = specialist ? specialistReply(ai.dm_extra, lang) : safeAiText(ai.dm_extra, 400), reply = safeAiText(ai.public_reply, 150, true);
  // The AI's numbers only when written in the comment; the parser backs them up ("3.4 4ta xonw" → 48, "Uyim 180" → 180).
  const values = directValues(text, ai), { m2, kw } = values, t = T[lang];
  const out = (result: HeatPumpComment, values: { reply?: string; extra?: string } = {}) => ({ result, reply: values.reply ?? "", extra: values.extra ?? "", lang, tag, specialist: specialist && !!values.extra });
  if (ai.intent === "SPAM_INSULT") return out({ kind: "SPAM" });
  if (values.absurd) return out({ kind: "POSITIVE" }, { reply: t.joke });
  if (values.clarify) return out({ kind: "HEAT_PUMP", intent: "question", m2: null }, { extra: t.clarify(values.clarify) });
  if (values.power) return out({ kind: "HEAT_PUMP", intent: "question", m2: null }, { extra: powerText(values.power, lang) });
  if (kw) return out({ kind: "HEAT_PUMP", intent: "kw", m2: null, kw }, { extra });
  if (m2) return out({ kind: "HEAT_PUMP", intent: "calc", m2 }, { extra });
  if (ai.intent === "BANTER" || ai.intent === "PRAISE") return out({ kind: "POSITIVE" }, { reply });
  if (ai.intent === "OTHER_PRODUCT") return out({ kind: "HEAT_PUMP", intent: "other", m2: null });
  return out({ kind: "HEAT_PUMP", intent: "question", m2: null }, { extra });
}

/**
 * An inactive post gets nothing. A comment with m² (`calc`): every new m² of the person on this post gets its own
 * calculation and public reply; an m² already calculated there is silent; the 6th calculation in 24 h gets only the
 * specialist line (`limit`). Other comments: one public reply and one Direct per person per post.
 */
export function heatPumpAction(rule: { isActive: boolean } | null, alreadyAnswered: boolean, underLimit: boolean, calc?: { m2: number; previous: readonly number[]; today: number; unit?: "m²" | "kW" }) {
  if (rule && !rule.isActive) return { type: "skip" as const, reason: "Post uchun avto-javoblar o‘chirilgan" };
  if (calc) {
    if (calc.previous.includes(calc.m2)) return { type: "skip" as const, reason: `Takroriy ${calc.unit ?? "m²"} — javobsiz` };
    if (calc.today >= MAX_CALCS_PER_DAY) return underLimit ? { type: "heatpump" as const, publicReply: true, limit: true } : { type: "skip" as const, reason: "Sutkalik hisob limiti va kunlik javob limiti" };
    return { type: "heatpump" as const, publicReply: underLimit };
  }
  if (alreadyAnswered) return { type: "skip" as const, reason: "Bu odamga shu postda javob berilgan — suhbat Direct’da" };
  return { type: "heatpump" as const, publicReply: underLimit };
}

/** "Aire 8 HP · 24 kW — $3 250 (~41.4 mln so'm)" for a model asked by its HP in Direct; null when the table has none. */
export function hpPriceLine(hp: number, models: readonly HeatPumpRow[], rate: string | number | null, lang: Lang = "uz") {
  const model = models.find(item => item.isActive && Math.abs(item.hp - hp) < 0.05);
  if (!model) return null;
  const mln = mlnSom(model.priceUsd, rate);
  return `🔥 ${modelLabel(model)} — ${usdText(model.priceUsd)}${mln ? ` (${T[lang].som(mln)}${T[lang].rate})` : ""}${model.bufferIncluded ? T[lang].withBuffer : ""}`;
}

const AMOUNT = String.raw`(\d{1,3}(?:[  ]\d{3})+|\d+)`;
/**
 * A money sum in an AI text ($ / so'm / mln) that is none of the code's sums (`usdSums`: table prices, buffer tank, and
 * their CBU mln so'm) → true; a plain so'm sum never comes from the code. No sum → false.
 */
export function inventedMoney(text: string, usdSums: readonly number[], rate: string | number | null) {
  const value = normalizeText(text);
  const usd = new Set(usdSums.map(Math.round)), mln = new Set(usdSums.map(sum => mlnSom(sum, rate)).filter(Boolean));
  for (const match of value.matchAll(new RegExp(String.raw`\$\s*${AMOUNT}|${AMOUNT}\s*(?:\$|usd|dollar\p{L}*|доллар\p{L}*)`, "gu"))) if (!usd.has(Number((match[1] ?? match[2]).replace(/\s/g, "")))) return true;
  for (const match of value.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:mln|млн)/gu)) if (!mln.has(match[1].replace(",", "."))) return true;
  return new RegExp(String.raw`\d\s*(?:so'?m|сум|сўм)(?!\p{L})`, "u").test(value.replace(/(\d+(?:[.,]\d+)?)\s*(?:mln|млн)\s*(?:so'?m|сум|сўм)?/gu, " "));
}

const SPECIALIST_TEXT = {
  uz: `Bu savolga mutaxassisimiz aniq javob beradi — ozgina kuting 🙏 Tezroq bo'lishi uchun qo'ng'iroq qilsangiz ham bo'ladi: ${SPECIALIST_PHONE}`,
  ru: `На этот вопрос точно ответит наш специалист — подождите немного 🙏 Чтобы быстрее, можно позвонить: ${SPECIALIST_PHONE}`,
};
/** The AI's own "the specialist will answer" words when safe and with the specialist's phone; else the fixed text. */
export const specialistReply = (aiReply: string | null | undefined, lang: Lang = "uz") => {
  const text = safeAiText(aiReply, 400);
  return text && text.includes(SPECIALIST_PHONE) ? text : SPECIALIST_TEXT[lang];
};
/** Telegram (teplonasos private chat): the question no table answers. */
export const specialistNotice = (input: { username: string | null; igsid: string; question: string; calc: string | null; link: string }) =>
  ["🧑‍🔧 Mutaxassis javobi kerak (teplonasos Direct)", input.username ? `@${input.username}` : `Instagram ${input.igsid}`, `Savol: «${input.question.slice(0, 500)}»`, `Oxirgi hisob: ${input.calc ?? "—"}`, `Suhbat: ${input.link}`].join("\n");

export const MAX_REPLIES_PER_DAY = 8;
/**
 * Teplonasos post: every new comment of a person is answered by its own intent; the same text again is silent and a
 * person gets at most 8 answers on a post in 24 h. `answered`: the person's earlier answered comments there. null = go.
 */
export function heatPumpGate(text: string, answered: ReadonlyArray<{ text: string; at: Date }>, now = new Date()) {
  const key = normalizeText(stripMentions(text));
  if (answered.some(row => normalizeText(stripMentions(row.text)) === key)) return "Takroriy matn — javobsiz";
  if (answered.filter(row => now.getTime() - row.at.getTime() < 86_400_000).length >= MAX_REPLIES_PER_DAY) return "24 soatda 8 ta javob — chegara";
  return null;
}

/** "450, 200 m²": the lead's m² list with `m2` added once (new m² never opens a second lead). */
export function m2List(dimensions: string | null | undefined, m2: number | null | undefined) {
  const list = (dimensions?.match(/\d+/g) ?? []).map(Number);
  if (m2 && !list.includes(m2)) list.push(m2);
  return list.length ? `${list.join(", ")} m²` : null;
}

/** A reply-comment is answered only on a teplonasos post, and only with m², a price ask or a teplonasos question. */
export const heatPumpReplyAnswered = (kind: string, intent: string | null, heatPumpPost: boolean) =>
  heatPumpPost && kind === "HEAT_PUMP" && (intent === "calc" || intent === "kw" || intent === "ask" || intent === "question");

/** Public reply and Direct text for a HEAT_PUMP comment; an off-topic one gets the call-center reply and no Direct. */
export function heatPumpOutgoing(intent: HeatPumpIntent, input: { m2?: number | null; kw?: number | null; calc?: string | null; answer?: string | null; extra?: string | null }, lang: Lang = "uz") {
  const t = T[lang];
  // A question asked beside the m² / kW ("ustanovka qilasizlarmi") is answered under the calculation (1000 chars max).
  const withExtra = (calc: string) => input.extra?.trim() ? `${calc}\n\n${input.extra.trim()}`.slice(0, 1000) : calc;
  if (intent === "kw" && input.kw && input.calc) return { reply: t.replyKw(input.kw), dm: withExtra(input.calc) };
  if (intent === "calc" && input.m2 && input.calc) return { reply: t.replyCalc(input.m2), dm: withExtra(input.calc) };
  if (intent === "ask") return { reply: t.replyAsk, dm: `${t.hello} ${t.m2Question}` };
  // A clarifying answer ("170 m² mi yoki 170 kW?") is the whole question.
  const answer = input.answer?.trim() ?? "";
  if (intent === "question") return { reply: t.replyQuestion, dm: `${t.hello} ${answer.endsWith("?") ? answer : `${answer ? `${answer}\n\n` : ""}${t.m2Question}`}` };
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
