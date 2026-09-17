import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/home/navigation";
import { Footer } from "@/components/home/home-page";
import { ProductDetail } from "@/components/products/product-detail";
import { products } from "@/data/products";
import "@/components/products/products.css";
import "@/components/products/product-detail.css";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return products.filter(product => product.isVisible).map(product => ({ slug: product.slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = products.find(item => item.slug === slug && item.isVisible);
  return { title: product?.seoTitle || (product ? `${product.name} ${product.model} — BUYUK KARAVAN` : "Mahsulot topilmadi"), description: product?.seoDescription || product?.shortDescription || (product ? `${product.name} ${product.model} — sovutish uskunasi.` : undefined) };
}
export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const product = products.find(item => item.slug === slug && item.isVisible);
  if (!product) notFound();
  return <div className="products-shell detail-shell"><Header onProducts/><ProductDetail product={product}/><Footer onProducts/></div>;
}
