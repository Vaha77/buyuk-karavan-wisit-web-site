import { HomePage } from "@/components/home/home-page";
import { getPublicHomeContent } from "@/lib/home/content";
import { getPublicProducts } from "@/lib/products/queries";
import { getHomeProjects } from "@/lib/projects/queries";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site-url";
import { getPublicProductCategories } from "@/lib/product-categories/queries";
export async function generateMetadata(): Promise<Metadata> {
  const [content, projects] = await Promise.all([getPublicHomeContent().catch(() => null), getHomeProjects().catch(() => [])]);
  // Hero background first, otherwise the cover of a real completed project.
  const project = projects.find(item => item.coverImage || item.images[0]);
  const imageUrl = content?.hero.image || project?.coverImage || project?.images[0];
  const images = imageUrl ? [{ url: imageUrl, alt: content?.hero.image ? "BUYUK KARAVAN sovutish tizimlari" : `${project?.title} — BUYUK KARAVAN loyihasi` }] : undefined;
  return {
  title: "Sovutish kameralari va sanoat sovutish tizimlari | BUYUK KARAVAN",
  description: "BUYUK KARAVAN sovutish kameralari, sanoat sovutish agregatlari va loyiha uchun uskunalarni tanlash bo‘yicha professional yechimlar taqdim etadi.",
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: SITE_URL, title: "BUYUK KARAVAN — sanoat sovutish tizimlari", description: "Sovutish kameralari, agregatlar va loyiha bo‘yicha hisob-kitob.", images },
  twitter: { card: images ? "summary_large_image" : "summary", title: "BUYUK KARAVAN — sanoat sovutish tizimlari", description: "Sovutish kameralari, agregatlar va loyiha bo‘yicha hisob-kitob.", images },
  };
}
export default async function Home() { const [content,products,projects,categories]=await Promise.all([getPublicHomeContent(),getPublicProducts().catch(()=>[]),getHomeProjects().catch(()=>[]),getPublicProductCategories().catch(()=>[])]); return <HomePage content={content} products={products} projects={projects} categories={categories}/>; }
