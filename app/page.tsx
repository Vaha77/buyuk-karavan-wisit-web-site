import { HomePage } from "@/components/home/home-page";
import { getPublicHomeContent } from "@/lib/home/content";
import { getPublicProducts } from "@/lib/products/queries";
import { getHomeProjects } from "@/lib/projects/queries";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site-url";
import { getPublicProductCategories } from "@/lib/product-categories/queries";
export const metadata: Metadata = {
  title: "Sovutish kameralari va sanoat sovutish tizimlari | BUYUK KARAVAN",
  description: "BUYUK KARAVAN sovutish kameralari, sanoat sovutish agregatlari va loyiha uchun uskunalarni tanlash bo‘yicha professional yechimlar taqdim etadi.",
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: SITE_URL, title: "BUYUK KARAVAN — sanoat sovutish tizimlari", description: "Sovutish kameralari, agregatlar va loyiha bo‘yicha hisob-kitob." },
  twitter: { card: "summary", title: "BUYUK KARAVAN — sanoat sovutish tizimlari", description: "Sovutish kameralari, agregatlar va loyiha bo‘yicha hisob-kitob." },
};
export default async function Home() { const [content,products,projects,categories]=await Promise.all([getPublicHomeContent(),getPublicProducts().catch(()=>[]),getHomeProjects().catch(()=>[]),getPublicProductCategories().catch(()=>[])]); return <HomePage content={content} products={products} projects={projects} categories={categories}/>; }
