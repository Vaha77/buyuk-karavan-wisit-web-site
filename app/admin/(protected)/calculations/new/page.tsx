import { CalculationWorkspace } from "@/components/admin/calculation-workspace";
import { getProposalProductOptions } from "@/lib/calculations/queries";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import "@/components/admin/calculation-planner.css";
import "@/components/admin/calculation-proposal.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Yangi tijorat taklifi | BUYUK KARAVAN Admin" };
export default async function NewCalculationPage() {
  const [products, rate] = await Promise.all([
    getProposalProductOptions(),
    getUsdUzsRate(),
  ]);
  return (
    <CalculationWorkspace
      products={products}
      exchangeRate={rate ? Number(rate.rate) : null}
      exchangeRateDate={rate?.effectiveDate || null}
    />
  );
}
