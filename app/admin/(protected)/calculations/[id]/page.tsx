import { notFound } from "next/navigation";
import { CalculationWorkspace } from "@/components/admin/calculation-workspace";
import {
  getCalculation,
  getProposalProductOptions,
} from "@/lib/calculations/queries";
import "@/components/admin/calculation-planner.css";
import "@/components/admin/calculation-proposal.css";
import type { Metadata } from "next";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = await getCalculation(id);
  return { title: `${row?.proposalNumber || "Tijorat taklifi"} | BUYUK KARAVAN Admin` };
}
export default async function CalculationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    [row, products] = await Promise.all([
      getCalculation(id),
      getProposalProductOptions(),
    ]);
  if (!row) notFound();
  return (
    <CalculationWorkspace
      initial={row}
      products={products}
      exchangeRate={null}
      exchangeRateDate={null}
    />
  );
}
