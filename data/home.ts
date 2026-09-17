export type Solution = { id: string; title: string; description: string; icon: "room" | "compressor" | "snow" | "building"; order: number; isVisible: boolean };
export type EquipmentItem = { id: string; title: string; subtitle?: string; icon: "compressor" | "pulse" | "condenser" | "snow" | "panel" | "door" | "pipe"; order: number; isVisible: boolean };
export type Project = { id: string; title: string; temperature: string; description?: string; image?: string; order: number; isVisible: boolean };
export const productTypes = [{ id: "meva", label: "Meva", icon: "fruit" }, { id: "sabzavot", label: "Sabzavot", icon: "moon" }, { id: "gosht", label: "Go‘sht", icon: "meat" }, { id: "muzqaymoq", label: "Muzqaymoq", icon: "ice" }, { id: "shok", label: "Shok muzlatish", icon: "snow" }, { id: "boshqa", label: "Boshqa", icon: "case" }] as const;
export const solutions: Solution[] = [
  { id: "rooms", title: "Sovutish kameralari", description: "Har xil harorat talablariga mos professional sovutish kameralari — mahsulot va hajmga qarab loyihalanadi.", icon: "room", order: 1, isVisible: true },
  { id: "aggregates", title: "Sanoat sovutish agregatlari", description: "Tijorat va sanoat maqsadlari uchun sovutish agregatlari va kompressor bloklari.", icon: "compressor", order: 2, isVisible: true },
  { id: "chillers", title: "Chiller tizimlari", description: "Suyuqlikni sanoat miqyosida sovutish uchun chiller tizimlari.", icon: "snow", order: 3, isVisible: true },
  { id: "installation", title: "Montaj va loyiha", description: "Loyihalashtirish, uskuna tanlash va montaj ishlari — boshidan oxirigacha.", icon: "building", order: 4, isVisible: true },
];
export const equipment: EquipmentItem[] = [
  { id: "compressors", title: "Kompressorlar", icon: "compressor", order: 1, isVisible: true },
  { id: "evaporators", title: "Evaporatorlar", subtitle: "DD / DJ", icon: "pulse", order: 2, isVisible: true },
  { id: "condensers", title: "Kondensatorlar", subtitle: "FN / FNW / FNH", icon: "condenser", order: 3, isVisible: true },
  { id: "chillers", title: "Chillerlar", icon: "snow", order: 4, isVisible: true },
  { id: "panels", title: "Sandwich panellar", icon: "panel", order: 5, isVisible: true },
  { id: "doors", title: "Sovutish eshiklari", icon: "door", order: 6, isVisible: true },
  { id: "pipes", title: "Mis quvurlar va aksessuarlar", icon: "pipe", order: 7, isVisible: true },
];
export const projects: Project[] = [
  { id: "produce", title: "Sabzavot va meva saqlash kamerasi", temperature: "0°C / +5°C", description: "Fermer xo‘jaliklari uchun", order: 1, isVisible: true },
  { id: "meat", title: "Go‘sht mahsulotlarini muzlatish kamerasi", temperature: "−18°C / −24°C", order: 2, isVisible: true },
  { id: "shock", title: "Shok muzlatish tizimi", temperature: "−35°C dan past", order: 3, isVisible: true },
];
export const reasons = [
  { id: "selection", title: "To‘g‘ri uskuna tanlash", description: "Mahsulot turi va hajmiga qarab eng mos uskunalarni tanlaymiz." },
  { id: "calculation", title: "Professional hisob-kitob", description: "Har bir loyiha uchun aniq texnik hisob-kitob taqdim etamiz." },
  { id: "installation", title: "Montaj va texnik yondashuv", description: "Montajdan keyingi texnik xizmat ko‘rsatishgacha birga boramiz." },
  { id: "quality", title: "Sifat bizdan boshlanadi", description: "Ishonchli uskunalar va puxta ishchilik — har bir loyihada." },
];
