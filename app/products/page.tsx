import type { Metadata } from "next";
import { Header } from "@/components/home/navigation";
import { Footer } from "@/components/home/home-page";
import { ProductsCatalog } from "@/components/products/products-catalog";
import { getPublicCatalogCategories, getPublicCatalogPage, sanitizeCatalogSeed } from "@/lib/products/queries";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import "@/components/products/products.css";

export const metadata: Metadata = { title: "Mahsulotlar — BUYUK KARAVAN", description: "Professional sovutish uskunalari va komponentlari katalogi.", alternates: { canonical: "/products" }, openGraph: { type: "website", url: "/products", title: "Mahsulotlar — BUYUK KARAVAN", description: "Professional sovutish uskunalari va komponentlari katalogi." } };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; seed?: string }> }) {
  const params = await searchParams;
  // No redirect here: with a streaming loading.tsx, redirect() becomes a client-side hop and the first HTML carries no cards.
  // A missing seed is generated per request; the client keeps using initial.seed for "Ko‘proq ko‘rsatish".
  const seed = sanitizeCatalogSeed(params.seed);
  const [categories, exchangeRate] = await Promise.all([getPublicCatalogCategories(), getUsdUzsRate()]);
  const category = categories.some(item => item.slug === params.category) ? params.category! : "all";
  const initial = await getPublicCatalogPage({ category, q: params.q || "", seed });
  return <div className="products-shell"><Header onProducts/><main className="products-page"><ProductsCatalog initial={initial} categories={categories} exchangeRate={exchangeRate?.rate ?? null} initialCategory={category} initialQuery={params.q || ""}/></main><Footer onProducts/></div>;
}
