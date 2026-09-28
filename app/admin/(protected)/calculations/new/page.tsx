import { CalculationWorkspace } from "@/components/admin/calculation-workspace";
import { getProposalProductOptions } from "@/lib/calculations/queries";
import "@/components/admin/calculation-planner.css";
import "@/components/admin/calculation-proposal.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Yangi tijorat taklifi | BUYUK KARAVAN Admin" };
export default async function NewCalculationPage() {
  const products = await getProposalProductOptions();
  return (
    <CalculationWorkspace
      products={products}
      exchangeRate={null}
      exchangeRateDate={null}
    />
  );
}
