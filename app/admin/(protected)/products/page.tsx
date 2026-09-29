import type { Metadata } from "next";
import { AdminProductsPage } from "@/components/admin/admin-products";
import { getAdminProductsPage } from "@/lib/products/queries";
import { getAdminProductCategories } from "@/lib/product-categories/queries";
export const metadata: Metadata = { title: "Mahsulotlar — Admin | BUYUK KARAVAN" };
export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string; q?: string; category?: string; status?: string; page?: string }> }) {
  const params = await searchParams;
  const [result, categories] = await Promise.all([getAdminProductsPage({ q: params.q, category: params.category, status: params.status, page: Number(params.page || 1) }), getAdminProductCategories()]);
  return <AdminProductsPage {...result} categories={categories} filters={{ q: params.q || "", category: params.category || "all", status: params.status || "all" }} saved={params.saved === "created" ? "created" : params.saved === "updated" ? "updated" : undefined}/>;
}
