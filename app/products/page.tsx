import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "@/components/home/navigation";
import { Footer } from "@/components/home/home-page";
import { ProductsCatalog } from "@/components/products/products-catalog";
import { getPublicCatalogPage, sanitizeCatalogSeed } from "@/lib/products/queries";
import { getPublicProductCategories } from "@/lib/product-categories/queries";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import "@/components/products/products.css";

export const metadata: Metadata = { title: "Mahsulotlar — BUYUK KARAVAN", description: "Professional sovutish uskunalari va komponentlari katalogi." };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; seed?: string }> }) {
  const params = await searchParams;
  if (!params.seed || sanitizeCatalogSeed(params.seed) !== params.seed) {
    const next = new URLSearchParams(); if (params.category) next.set("category", params.category); if (params.q) next.set("q", params.q); next.set("seed", sanitizeCatalogSeed()); redirect(`/products?${next}`);
  }
  const [categories, exchangeRate] = await Promise.all([getPublicProductCategories(), getUsdUzsRate()]);
  const category = categories.some(item => item.slug === params.category) ? params.category! : "all";
  const initial = await getPublicCatalogPage({ category, q: params.q || "", seed: params.seed });
  return <div className="products-shell"><Header onProducts/><main className="products-page"><ProductsCatalog initial={initial} categories={categories} exchangeRate={exchangeRate?.rate ?? null} initialCategory={category} initialQuery={params.q || ""}/></main><Footer onProducts/></div>;
}
