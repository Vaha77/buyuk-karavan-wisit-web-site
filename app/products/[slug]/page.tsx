import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/home/navigation";
import { Footer } from "@/components/home/home-page";
import { ProductDetail } from "@/components/products/product-detail";
import { getProductBySlug, getRelatedProducts } from "@/lib/products/queries";
import "@/components/products/products.css";
import "@/components/products/product-detail.css";
import { getUsdUzsRate } from "@/lib/currency/cbu";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return { title: product?.seoTitle || product?.name || "Mahsulot topilmadi", description: product?.seoDescription || product?.shortDescription };
}
export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const [related,exchangeRate] = await Promise.all([getRelatedProducts(product.id, product.category),getUsdUzsRate()]);
  return <div className="products-shell detail-shell"><Header onProducts/><ProductDetail product={product} related={related} exchangeRate={exchangeRate?.rate??null}/><Footer onProducts/></div>;
}
