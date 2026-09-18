import type { Metadata } from "next";
import { AdminProductsPage } from "@/components/admin/admin-products";
import { getAdminProducts } from "@/lib/products/queries";
export const metadata: Metadata = { title: "Mahsulotlar — Admin | BUYUK KARAVAN" };
export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const [products, params] = await Promise.all([getAdminProducts(), searchParams]);
  return <AdminProductsPage products={products} saved={params.saved === "created" ? "created" : params.saved === "updated" ? "updated" : undefined}/>;
}
