import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/product-form";
import { getAdminProductCategories } from "@/lib/product-categories/queries";
import { getUsdUzsRate } from "@/lib/currency/cbu";
export const metadata: Metadata = { title: "Yangi mahsulot — Admin | BUYUK KARAVAN" };
export default async function Page() { const [categories,exchangeRate]=await Promise.all([getAdminProductCategories(),getUsdUzsRate()]);return <ProductForm categories={categories} exchangeRate={exchangeRate}/>; }
