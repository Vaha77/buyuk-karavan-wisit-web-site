import { productTypes, projects, reasons, solutions } from "./home";

export type Visibility = { isVisible: boolean; order: number };
export type ManagedItem = Visibility & { id: string; title: string; description: string; icon: string; image: string | null };
export type ManagedProject = Visibility & { id: string; title: string; category: string; temperature: string; description: string; location: string; image: string | null };
export type ManagedReason = Visibility & { id: string; title: string; description: string };
export type FeaturedProductRef = Visibility & { productId: string };
export type HomeContent = {
  hero: Visibility & { eyebrow: string; headline: string; subtitle: string; primaryButton: string; secondaryButton: string; minimum: string; maximum: string; image: string | null };
  selector: Visibility & { eyebrow: string; title: string; description: string; items: ManagedItem[] };
  solutions: Visibility & { eyebrow: string; title: string; items: ManagedItem[] };
  featuredProducts: Visibility & { eyebrow: string; title: string; description: string; items: FeaturedProductRef[] };
  temperature: Visibility & { title: string; description: string; minimum: string; maximum: string; labels: string };
  projects: Visibility & { eyebrow: string; title: string; items: ManagedProject[] };
  reasons: Visibility & { eyebrow: string; headline: string; items: ManagedReason[] };
  cta: Visibility & { headline: string; description: string; primaryButton: string; secondaryButton: string };
  footer: Visibility & { companyDescription: string; location: string; phone: string; telegram: string; instagram: string };
};

export type HomeSectionKey = keyof HomeContent;
export const homeSectionMeta: { key: HomeSectionKey; name: string; description: string }[] = [
  { key: "hero", name: "Hero", description: "Birinchi ekran: sarlavha, tugmalar va fon rasmi" },
  { key: "selector", name: "Interaktiv tanlov", description: "Sovutish kamerasi variantlari" },
  { key: "solutions", name: "Sovutish yechimlari", description: "Yechimlar ro‘yxati va tasvirlar" },
  { key: "featuredProducts", name: "Mahsulotlar / uskunalar", description: "Bosh sahifada ko‘rsatiladigan mahsulotlar" },
  { key: "temperature", name: "Harorat diapazoni", description: "Harorat qiymatlari va izohlar" },
  { key: "projects", name: "Amalga oshirilgan loyihalar", description: "Loyiha kartochkalari va rasmlar" },
  { key: "reasons", name: "Nima uchun biz", description: "Sabablar va tavsiflar" },
  { key: "cta", name: "CTA", description: "Maslahatga chaqiruv bo‘limi" },
  { key: "footer", name: "Footer", description: "Kompaniya va aloqa ma’lumotlari" },
];

export const initialHomeContent: HomeContent = {
  hero: { isVisible: true, order: 1, eyebrow: "SANOAT SOVUTISH TIZIMLARI", headline: "SOVUQLIKNI\nBIZ BOSHQARAMIZ", subtitle: "−40°C dan +5°C gacha professional sovutish yechimlari", primaryButton: "Mahsulotlar", secondaryButton: "Loyihalarni ko‘rish", minimum: "−40°C", maximum: "+5°C", image: null },
  selector: { isVisible: true, order: 2, eyebrow: "Tanlov", title: "Sizga qanday sovutish kamerasi kerak?", description: "Mahsulot turini tanlang — sizga mos sovutish yechimini topamiz.", items: productTypes.map((item,index)=>({id:item.id,title:item.label,description:"",icon:item.icon,image:null,isVisible:true,order:index+1})) },
  solutions: { isVisible: true, order: 3, eyebrow: "Yechimlar", title: "Sovutish yechimlari", items: solutions.map(item=>({...item,image:null})) },
  featuredProducts: { isVisible: true, order: 4, eyebrow: "Mahsulotlar", title: "Sovutish uskunalari ekotizimi", description: "", items: ["p01","p02","p03","p04"].map((productId,index)=>({productId,isVisible:true,order:index+1})) },
  temperature: { isVisible: true, order: 5, title: "Muhandislik aniqligi", description: "Har bir mahsulot uchun to‘g‘ri harorat. Har bir loyiha uchun to‘g‘ri yechim.", minimum: "−40°C", maximum: "+5°C", labels: "Shok muzlatish · Chuqur muzlatish · Saqlash" },
  projects: { isVisible: true, order: 6, eyebrow: "Portfolio", title: "Amalga oshirilgan loyihalar", items: projects.map(item=>({id:item.id,title:item.title,category:"Sovutish kamerasi",temperature:item.temperature,description:item.description||"",location:"",image:item.image||null,isVisible:item.isVisible,order:item.order})) },
  reasons: { isVisible: true, order: 7, eyebrow: "Nima uchun biz", headline: "Avval maslahat.\nKeyin yechim.", items: reasons.map((item,index)=>({...item,isVisible:true,order:index+1})) },
  cta: { isVisible: true, order: 8, headline: "Sovutish loyihangizni birgalikda hisoblaymiz", description: "Talabingizni ayting — mos uskunalar va sovutish yechimini aniqlashga yordam beramiz.", primaryButton: "Bepul hisob-kitob olish", secondaryButton: "Mutaxassis bilan bog‘lanish" },
  footer: { isVisible: true, order: 9, companyDescription: "Namangan shahridan — sanoat sovutish agregatlari va kompressor uskunalari bo‘yicha professional yechimlar.", location: "Namangan, O‘zbekiston", phone: "[Telefon raqami]", telegram: "@buyuk_karavan", instagram: "@buyuk_karavan" },
};
