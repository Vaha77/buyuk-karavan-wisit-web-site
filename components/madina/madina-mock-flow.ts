import type { LeadField, MadinaLead } from "./madina-types";

export const emptyLead: MadinaLead = {
  customerName: "", phone: "", telegram: "", requestType: "", product: "", dimensions: "",
  capacity: "", temperature: "", region: "", notes: "",
};

export const welcome = "Assalomu alaykum! 👋\nMen Madina, BUYUK KARAVAN AI yordamchisiman. Sizga nima yordam bera olaman?";

export const intents = ["Sovutish kamerasi kerak", "Uskuna tanlash", "Harorat bo‘yicha maslahat", "Loyiha hisoblash", "Boshqa savol"];
export const fieldOrder: LeadField[] = ["requestType", "product", "dimensions", "capacity", "temperature", "region", "customerName", "phone"];
export const fieldLabels: Record<LeadField, string> = {
  requestType: "So‘rov turi", product: "Mahsulot", dimensions: "O‘lcham", capacity: "Sig‘im",
  temperature: "Harorat", region: "Hudud", customerName: "Mijoz", phone: "Telefon",
};
export const questions: Record<LeadField, string> = {
  requestType: "Sizga qanday yordam kerak?",
  product: "Albatta. Ichida qanday mahsulot saqlamoqchisiz?",
  dimensions: "Yaxshi. Kamera o‘lchamini bilasizmi?",
  capacity: "Taxminan qancha mahsulot saqlamoqchisiz?",
  temperature: "Kerakli haroratni bilasizmi?",
  region: "Loyiha qaysi hududda?",
  customerName: "Siz bilan bog‘lanishimiz uchun ismingizni yozing.",
  phone: "Telefon raqamingizni kiriting.",
};
export const suggestions: Partial<Record<LeadField, string[]>> = {
  requestType: intents,
  product: ["Meva", "Sabzavot", "Go‘sht", "Muzqaymoq", "Boshqa"],
  dimensions: ["O‘lchamni kiritaman", "Hali bilmayman"],
  temperature: ["0°C / +2°C", "−18°C", "Hali bilmayman"],
};

export function normalizeAnswer(field: LeadField, value: string) {
  const trimmed = value.trim();
  if (field === "dimensions" && /^\d+(?:[.,]\d+)?\s*[x×*]\s*\d+(?:[.,]\d+)?\s*[x×*]\s*\d+(?:[.,]\d+)?$/i.test(trimmed)) {
    return `${trimmed.replace(/\s*[x×*]\s*/gi, " × ")} m`;
  }
  return trimmed;
}

export function isValidPhone(value: string) { return value.replace(/\D/g, "").length >= 9; }
