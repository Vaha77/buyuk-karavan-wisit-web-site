import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { formatUsd } from "@/lib/prays/rules";
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
    user = await requireAdmin(),
    [row, products, kit] = await Promise.all([
      getCalculation(id),
      getProposalProductOptions(),
      // Price-list total and margin of a configurator offer: SUPER_ADMIN only.
      user.role === "SUPER_ADMIN" ? getDb().calculation.findUnique({ where: { id }, select: { configurator: true } }) : null,
    ]);
  if (!row) notFound();
  const snapshot = kit?.configurator as { baseTotal?: number; markupPercent?: number; clientPrice?: number; margin?: number; parts?: Array<{ name: string; price: number }> } | null | undefined;
  return (
    <>
    {snapshot?.baseTotal !== undefined && <p className="admin-panel" style={{ margin: "0 0 12px", padding: "10px 14px", fontSize: 13 }}>Komplekt konfiguratori · prays jami <b>{formatUsd(snapshot.baseTotal)}</b> ({snapshot.parts?.map(part => `${part.name} ${formatUsd(part.price)}`).join(" + ")}) · ustama {snapshot.markupPercent}% · marja <b>{formatUsd(snapshot.margin ?? null)}</b> · mijoz narxi <b>{formatUsd(snapshot.clientPrice ?? null)}</b></p>}
    <CalculationWorkspace
      initial={row}
      products={products}
      exchangeRate={null}
      exchangeRateDate={null}
    />
    </>
  );
}
