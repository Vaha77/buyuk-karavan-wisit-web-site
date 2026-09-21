import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { getAdminProductById } from "@/lib/products/queries";
import { getAdminProductCategories } from "@/lib/product-categories/queries";
import { getUsdUzsRate } from "@/lib/currency/cbu";
type Props = { params: Promise<{ id: string }> };
export const metadata: Metadata = { title: "Mahsulotni tahrirlash — Admin | BUYUK KARAVAN" };
export default async function Page({ params }: Props) {
  const { id } = await params;
  const [product,categories,exchangeRate] = await Promise.all([getAdminProductById(id),getAdminProductCategories(),getUsdUzsRate()]);
  if (!product) notFound();
  return <ProductForm product={product} categories={categories} exchangeRate={exchangeRate}/>;
}
