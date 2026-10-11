// Defaults shared by the server rules and the admin form (no Node imports, safe in client components).
export const DEFAULT_KEYWORDS = ["narx", "narxi", "qancha", "nech pul", "цена", "сколько", "price", "+", "?"];
export const DEFAULT_DM_TEMPLATE = "Assalomu alaykum! {mahsulot} narxi — {narx_som} so'm. Batafsil: {havola}. Savollaringiz bo'lsa shu yerga yozing yoki qo'ng'iroq qiling: {telefon}";
export const DEFAULT_PUBLIC_REPLY = "Narxini Direct'ga yubordik ✅";
export const DEFAULT_GENERAL_REPLY = "Direct'ga yozing, mutaxassis javob beradi";
export const PLACEHOLDERS = ["{mahsulot}", "{narx_som}", "{havola}", "{telefon}", "{username}"] as const;
