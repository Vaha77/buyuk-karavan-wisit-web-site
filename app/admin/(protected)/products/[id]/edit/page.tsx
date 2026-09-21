import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { getAdminProductById } from "@/lib/products/queries";
import { getAdminProductCategories } from "@/lib/product-categories/queries";
type Props = { params: Promise<{ id: string }> };
export const metadata: Metadata = { title: "Mahsulotni tahrirlash — Admin | BUYUK KARAVAN" };
export default async function Page({ params }: Props) {
  const { id } = await params;
  const [product,categories] = await Promise.all([getAdminProductById(id),getAdminProductCategories()]);
  if (!product) notFound();
  return <ProductForm product={product} categories={categories}/>;
}
