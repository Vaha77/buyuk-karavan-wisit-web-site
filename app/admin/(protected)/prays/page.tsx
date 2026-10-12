import type { Metadata } from "next";
import { PraysBoard } from "@/components/admin/sex/prays-board";
import { requireRole } from "@/lib/auth/require-admin";
import { getMarkupPercent, getPraysCategories, getPraysProducts, getPriceHistory, getSexParts, getStandardCondenserCategoryId } from "@/lib/prays/queries";
import "@/components/admin/sex/sex.css";

export const metadata: Metadata = { title: "Prays — Admin | BUYUK KARAVAN" };

export default async function PraysPage() {
  await requireRole("SUPER_ADMIN");
  const [products, parts, markup, history, categories, standardCondenserCategoryId] = await Promise.all([getPraysProducts(), getSexParts(), getMarkupPercent(), getPriceHistory(), getPraysCategories(), getStandardCondenserCategoryId()]);
  return <PraysBoard products={products} parts={parts} markup={markup} history={history} categories={categories} standardCondenserCategoryId={standardCondenserCategoryId}/>;
}
