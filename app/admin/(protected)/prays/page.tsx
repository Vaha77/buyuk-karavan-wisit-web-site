import type { Metadata } from "next";
import { PraysBoard } from "@/components/admin/sex/prays-board";
import { requireRole } from "@/lib/auth/require-admin";
import { getMarkupPercent, getPraysProducts, getPriceHistory, getSexParts } from "@/lib/prays/queries";
import "@/components/admin/sex/sex.css";

export const metadata: Metadata = { title: "Prays — Admin | BUYUK KARAVAN" };

export default async function PraysPage() {
  await requireRole("SUPER_ADMIN");
  const [products, parts, markup, history] = await Promise.all([getPraysProducts(), getSexParts(), getMarkupPercent(), getPriceHistory()]);
  return <PraysBoard products={products} parts={parts} markup={markup} history={history}/>;
}
