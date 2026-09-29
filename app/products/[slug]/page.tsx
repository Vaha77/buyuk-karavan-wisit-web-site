import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/home/navigation";
import { Footer } from "@/components/home/home-page";
import { ProductDetail } from "@/components/products/product-detail";
import { getProductBySlug, getRelatedProducts } from "@/lib/products/queries";
import "@/components/products/products.css";
import "@/components/products/product-detail.css";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { SITE_URL } from "@/lib/site-url";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Mahsulot topilmadi" };
  const title = product.seoTitle || `${product.name} ${product.model} — BUYUK KARAVAN`;
  const description = product.seoDescription || product.shortDescription || `${product.name} ${product.model} mahsulot kartochkasi.`;
  const url = `/products/${encodeURIComponent(product.slug)}`;
  const images = product.image ? [{ url: product.image, alt: `${product.name} ${product.model}` }] : undefined;
  return { title, description, alternates: { canonical: url }, openGraph: { type: "website", url, title, description, images }, twitter: { card: images ? "summary_large_image" : "summary", title, description, images } };
}
export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const [related,exchangeRate] = await Promise.all([getRelatedProducts(product.id, product.category),getUsdUzsRate()]);
  const url = `${SITE_URL}/products/${encodeURIComponent(product.slug)}`;
  const jsonLd = { "@context": "https://schema.org", "@type": "Product", name: product.name, sku: product.model, model: product.model, brand: { "@type": "Brand", name: product.brand }, description: product.seoDescription || product.shortDescription || product.description, image: product.images?.length ? product.images : product.image ? [product.image] : undefined, category: product.categoryName, url, ...(product.priceUsd ? { offers: { "@type": "Offer", priceCurrency: "USD", price: product.priceUsd, availability: product.availability === "available" ? "https://schema.org/InStock" : "https://schema.org/PreOrder", url } } : {}) };
  return <div className="products-shell detail-shell"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}/><Header onProducts/><ProductDetail product={product} related={related} exchangeRate={exchangeRate?.rate??null}/><Footer onProducts/></div>;
}
