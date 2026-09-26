import { notFound } from "next/navigation";
import { CalculationWorkspace } from "@/components/admin/calculation-workspace";
import {
  getCalculation,
  getProposalProductOptions,
} from "@/lib/calculations/queries";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import "@/components/admin/calculation-planner.css";
import "@/components/admin/calculation-proposal.css";
export default async function CalculationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    [row, products, rate] = await Promise.all([
      getCalculation(id),
      getProposalProductOptions(),
      getUsdUzsRate(),
    ]);
  if (!row) notFound();
  return (
    <CalculationWorkspace
      initial={row}
      products={products}
      exchangeRate={rate ? Number(rate.rate) : null}
    />
  );
}
