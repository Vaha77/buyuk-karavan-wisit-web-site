import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/product-form";
import { getAdminProductCategories } from "@/lib/product-categories/queries";
export const metadata: Metadata = { title: "Yangi mahsulot — Admin | BUYUK KARAVAN" };
export default async function Page() { return <ProductForm categories={await getAdminProductCategories()}/>; }
