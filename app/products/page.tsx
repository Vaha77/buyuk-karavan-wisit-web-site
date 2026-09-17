import type { Metadata } from "next";
import { Header } from "@/components/home/navigation";
import { Footer } from "@/components/home/home-page";
import { ProductsCatalog } from "@/components/products/products-catalog";
import "@/components/products/products.css";

export const metadata: Metadata = { title: "Mahsulotlar — BUYUK KARAVAN", description: "Professional sovutish uskunalari va komponentlari katalogi." };

export default function ProductsPage() {
  return <div className="products-shell"><Header onProducts/><main className="products-page"><ProductsCatalog/></main><Footer onProducts/></div>;
}
