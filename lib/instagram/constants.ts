// Defaults shared by the server rules and the admin form (no Node imports, safe in client components).
export const DEFAULT_KEYWORDS = ["narx", "narxi", "qancha", "nech pul", "нарх", "қанча", "канча", "цена", "сколько", "price", "+", "?"];
export const DEFAULT_DM_TEMPLATE = "Assalomu alaykum! {mahsulot} narxi — {narx_som} so'm. Batafsil: {havola}. Savollaringiz bo'lsa shu yerga yozing yoki qo'ng'iroq qiling: {telefon}";
export const DEFAULT_PUBLIC_REPLY = "Narxini Direct'ga yubordik ✅";
export const DEFAULT_PUBLIC_REPLY_VARIANTS = ["Narxini Direct'ga yubordik ✅", "Direct'ni tekshiring, narxini yubordik 📩", "Narx va batafsil ma'lumot Direct'da ✅"];
export const DEFAULT_GENERAL_REPLY = "Direct'ga yozing, mutaxassis javob beradi";
export const DEFAULT_QUESTION_REPLY = "Batafsil ma'lumotni Direct'ga yubordik 📩";
export const DEFAULT_QUESTION_DM = "Assalomu alaykum! Savolingiz bo'yicha mutaxassisimiz yordam beradi: {telefon}";
export const DEFAULT_DAILY_REPLY_LIMIT = 150;
export const PLACEHOLDERS = ["{mahsulot}", "{narx_som}", "{havola}", "{telefon}", "{username}"] as const;

export const COMMENT_KINDS = ["PRICE", "POSITIVE", "QUESTION", "NEGATIVE", "SPAM", "UNKNOWN"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];
export const KIND_LABELS: Record<CommentKind, string> = { PRICE: "Narx", POSITIVE: "Ijobiy", QUESTION: "Savol", NEGATIVE: "Salbiy", SPAM: "Spam", UNKNOWN: "Aniqlanmadi" };
