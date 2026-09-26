import type { Metadata } from "next";
import { Header } from "@/components/home/navigation";
import { Footer } from "@/components/home/home-page";
import { ProductsCatalog } from "@/components/products/products-catalog";
import { getPublicProducts } from "@/lib/products/queries";
import { getPublicProductCategories } from "@/lib/product-categories/queries";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import "@/components/products/products.css";

export const metadata: Metadata = { title: "Mahsulotlar — BUYUK KARAVAN", description: "Professional sovutish uskunalari va komponentlari katalogi." };

export default async function ProductsPage() {
  const [products,categories,exchangeRate] = await Promise.all([getPublicProducts(),getPublicProductCategories(),getUsdUzsRate()]);
  return <div className="products-shell"><Header onProducts/><main className="products-page"><ProductsCatalog products={products} categories={categories} exchangeRate={exchangeRate?.rate??null}/></main><Footer onProducts/></div>;
}
