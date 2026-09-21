import type { Metadata } from "next";
import { AdminProductsPage } from "@/components/admin/admin-products";
import { getAdminProducts } from "@/lib/products/queries";
import { getAdminProductCategories } from "@/lib/product-categories/queries";
export const metadata: Metadata = { title: "Mahsulotlar — Admin | BUYUK KARAVAN" };
export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const [products, categories, params] = await Promise.all([getAdminProducts(), getAdminProductCategories(), searchParams]);
  return <AdminProductsPage products={products} categories={categories} saved={params.saved === "created" ? "created" : params.saved === "updated" ? "updated" : undefined}/>;
}
