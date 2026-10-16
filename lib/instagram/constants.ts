// Defaults shared by the server rules and the admin form (no Node imports, safe in client components).

/** Admin links keep the selected account (?account=<InstagramAccount.id>). */
export const withAccount = (href: string, accountId?: string | null) => accountId ? `${href}${href.includes("?") ? "&" : "?"}account=${encodeURIComponent(accountId)}` : href;
export const DEFAULT_KEYWORDS = ["narx", "narxi", "qancha", "nech pul", "нарх", "қанча", "канча", "цена", "сколько", "price", "+", "?"];
export const DEFAULT_DM_TEMPLATE = "Assalomu alaykum! {mahsulot} narxi — {narx_som} so'm. Batafsil: {havola}. Savollaringiz bo'lsa shu yerga yozing yoki qo'ng'iroq qiling: {telefon}";
export const DEFAULT_PUBLIC_REPLY = "Narxini Direct'ga yubordik ✅";
export const DEFAULT_PUBLIC_REPLY_VARIANTS = ["Narxini Direct'ga yubordik ✅", "Direct'ni tekshiring, narxini yubordik 📩", "Narx va batafsil ma'lumot Direct'da ✅"];
export const DEFAULT_GENERAL_REPLY = "Direct'ga yozing, mutaxassis javob beradi";
export const DEFAULT_QUESTION_REPLY = "Batafsil ma'lumotni Direct'ga yubordik 📩";
export const DEFAULT_QUESTION_DM = "Assalomu alaykum! Savolingiz bo'yicha mutaxassisimiz yordam beradi: {telefon}";
export const DEFAULT_DAILY_REPLY_LIMIT = 150;
export const PLACEHOLDERS = ["{mahsulot}", "{narx_som}", "{havola}", "{telefon}", "{username}"] as const;
/** Account contact details, usable in every template (empty when not filled in). */
export const CONTACT_PLACEHOLDERS = ["{telefon}", "{manzil}", "{moljal}", "{xarita}", "{ishVaqti}"] as const;
export const DEFAULT_NO_PRICE_DM = "Assalomu alaykum! Narxni telefon orqali aytamiz: {telefon}";

/** @eshikmaster on its first connect: AI reply to comments, one fixed Direct text for contact / price, nothing else. */
const ESHIKMASTER_DM = "Assalomu alaykum!\nTelefon: +998 91 185 30 23\nManzil (Google xarita):\nhttps://maps.app.goo.gl/1hSXYLYgBBeAgEZh6";
const withLine = (line: string) => ESHIKMASTER_DM.replace("\n", `\n${line}\n`);
export const ESHIKMASTER_PRESET = {
  label: "Eshik Master", brandName: "Eshik Master", phone: "+998 91 185 30 23", mapLink: "https://maps.app.goo.gl/1hSXYLYgBBeAgEZh6",
  contactRepliesEnabled: true, phoneDmTemplate: ESHIKMASTER_DM, addressDmTemplate: ESHIKMASTER_DM, hoursDmTemplate: withLine("Ish vaqtini telefon orqali aniqlab oling."), noPriceDmTemplate: withLine("Narxni telefon orqali aniqlab oling."),
  questionReplyText: "Ma'lumotni Direct'ga yubordik", priceEnabled: true, positiveEnabled: true, questionEnabled: true, negativeNotify: false,
  aiReplyAll: true, leadsEnabled: false, directEnabled: false,
  aiPrompt: `Sen Eshik Master Instagram sahifasi nomidan kommentga javob yozasan.
Qoidalar:
- 1–2 qisqa, samimiy, kommentga mos ijobiy gap.
- Kommentning tilida yoz: o'zbek → o'zbek, rus → rus.
- Narx va ish vaqtini HECH QACHON yozma (ular faqat telefon orqali aytiladi).
- Chegirma, raqam, vaqt, va'da, havola, @belgi YOZMA, hech narsani to'qima.
- Quyidagi oldingi javoblarni takrorlama, so'zlari ham boshqacha bo'lsin.
Faqat JSON qaytar: {"reply": "..."}`,
};
/** Second product (optional): lines with these are dropped from the DM when the post has none. */
export const SECOND_PLACEHOLDERS = ["{mahsulot2}", "{narx_som2}", "{havola2}"] as const;

export const COMMENT_KINDS = ["PRICE", "POSITIVE", "QUESTION", "NEGATIVE", "SPAM", "UNKNOWN", "PHONE", "ADDRESS", "HOURS"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];
/** Contact questions, only for accounts with contactRepliesEnabled (else they are plain QUESTIONs). */
export const CONTACT_KINDS = ["PHONE", "ADDRESS", "HOURS"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
export const KIND_LABELS: Record<CommentKind, string> = { PRICE: "Narx", POSITIVE: "Ijobiy", QUESTION: "Savol", NEGATIVE: "Salbiy", SPAM: "Spam", UNKNOWN: "Aniqlanmadi", PHONE: "Telefon", ADDRESS: "Manzil", HOURS: "Ish vaqti" };
