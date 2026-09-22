import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { getAdminProductById } from "@/lib/products/queries";
import { getAdminProductCategories } from "@/lib/product-categories/queries";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import {getDb} from "@/lib/db";import {ProductAuditHistory} from "@/components/admin/product-audit-history";
type Props = { params: Promise<{ id: string }> };
export const metadata: Metadata = { title: "Mahsulotni tahrirlash — Admin | BUYUK KARAVAN" };
export default async function Page({ params }: Props) {
  const { id } = await params;
  const [product,categories,exchangeRate,logs] = await Promise.all([getAdminProductById(id),getAdminProductCategories(),getUsdUzsRate(),getDb().auditLog.findMany({where:{entityType:"PRODUCT",entityId:id},orderBy:{createdAt:"desc"},take:100})]);
  if (!product) notFound();
  return <><ProductForm product={product} categories={categories} exchangeRate={exchangeRate}/><ProductAuditHistory logs={logs}/></>;
}
