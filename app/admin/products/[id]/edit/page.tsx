import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { products } from "@/data/products";
type Props = { params: Promise<{ id: string }> };
export function generateStaticParams() { return products.map(product => ({ id: String(product.order) })); }
export const metadata: Metadata = { title: "Mahsulotni tahrirlash — Admin | BUYUK KARAVAN" };
export default async function Page({ params }: Props) {
  const { id } = await params;
  const product = products.find(item => String(item.order) === id);
  if (!product) notFound();
  return <ProductForm product={product}/>;
}
