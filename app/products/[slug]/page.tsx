import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/home/navigation";
import { Footer } from "@/components/home/home-page";
import { ProductDetail } from "@/components/products/product-detail";
import { getProductBySlug, getRelatedProducts } from "@/lib/products/queries";
import { connection } from "next/server";
import { getReadyProduct360Asset } from "@/lib/product-360/queries";
import "@/components/products/products.css";
import "@/components/products/product-detail.css";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return { title: product?.seoTitle || product?.name || "Mahsulot topilmadi", description: product?.seoDescription || product?.shortDescription };
}
export default async function ProductDetailPage({ params }: Props) {
  await connection();
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const [related, asset360] = await Promise.all([getRelatedProducts(product.id, product.category), getReadyProduct360Asset(product.id)]);
  return <div className="products-shell detail-shell"><Header onProducts/><ProductDetail product={product} related={related} asset360={asset360}/><Footer onProducts/></div>;
}
