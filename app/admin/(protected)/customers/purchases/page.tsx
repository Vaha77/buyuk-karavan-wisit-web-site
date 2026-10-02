import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { PURCHASE_STATUS } from "@/lib/customers/seller-rules";
import { formatDecimal, formatUsd } from "@/lib/dashboard/format";
import { PurchaseReviewButtons } from "@/components/admin/bklead/purchase-review";

export const metadata: Metadata = { title: "Tasdiqlash kerak — Admin | BUYUK KARAVAN" };

const money = (amount: { toString(): string }, currency: string) => `${formatDecimal(Number(amount.toString()), 2)} ${currency === "UZS" ? "so‘m" : "$"}`;

export default async function PurchasesReviewPage() {
  await requireRole("SUPER_ADMIN", "ADMIN");
  const select = { id: true, date: true, amount: true, currency: true, amountUsd: true, note: true, status: true, rejectReason: true, createdAt: true, reviewedAt: true, customer: { select: { name: true } }, seller: { select: { name: true } }, reviewedBy: { select: { name: true } } } as const;
  const [pending, recent] = await Promise.all([
    getDb().customerPurchase.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select }),
    getDb().customerPurchase.findMany({ where: { status: { not: "PENDING" } }, orderBy: { reviewedAt: "desc" }, take: 20, select }),
  ]);
  return <div className="bk">
    <div className="bk-head"><div><h1>Tasdiqlash kerak</h1><p className="bk-muted">Tasdiqlangan xarid mijozning o‘sha oydagi savdosiga qo‘shiladi; rad etilsa sotuvchi sababni ko‘radi</p></div></div>
    <section className="bk-card" aria-labelledby="pr-pending-title">
      <div className="bk-card-head"><div><h2 id="pr-pending-title">Kutilayotgan xaridlar</h2><span className="bk-muted">{pending.length} ta · jami {formatUsd(pending.reduce((sum, row) => sum + Number(row.amountUsd), 0))}</span></div></div>
      {pending.length ? <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>Sana</th><th className="is-left">Mijoz</th><th className="is-left">Sotuvchi</th><th>Summa</th><th>$</th><th className="is-left">Izoh</th><th><span className="bk-sr-only">Amallar</span></th></tr></thead>
        <tbody>{pending.map(row => <tr key={row.id}>
          <td>{row.date.toISOString().slice(0, 10)}</td><td className="is-left is-strong">{row.customer.name}</td><td className="is-left">{row.seller?.name ?? "—"}</td>
          <td>{money(row.amount, row.currency)}</td><td className="is-strong">{formatUsd(Number(row.amountUsd))}</td><td className="is-left bk-muted" style={{ whiteSpace: "normal", minWidth: 120 }}>{row.note || "—"}</td>
          <td><PurchaseReviewButtons id={row.id} label={`${row.customer.name}: ${money(row.amount, row.currency)} (${row.date.toISOString().slice(0, 10)})`}/></td>
        </tr>)}</tbody>
      </table></div> : <div className="bk-empty">Tasdiqlash kutayotgan xarid yo‘q.</div>}
    </section>
    {recent.length > 0 && <section className="bk-card" aria-labelledby="pr-recent-title">
      <div className="bk-card-head"><div><h2 id="pr-recent-title">So‘nggi ko‘rib chiqilganlar</h2></div></div>
      <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>Sana</th><th className="is-left">Mijoz</th><th className="is-left">Sotuvchi</th><th>$</th><th className="is-left">Holat</th><th className="is-left">Kim</th></tr></thead>
        <tbody>{recent.map(row => <tr key={row.id}>
          <td>{row.date.toISOString().slice(0, 10)}</td><td className="is-left">{row.customer.name}</td><td className="is-left">{row.seller?.name ?? "—"}</td><td>{formatUsd(Number(row.amountUsd))}</td>
          <td className="is-left"><span className={`bk-badge${row.status === "APPROVED" ? "" : " is-orange"}`}>{PURCHASE_STATUS[row.status]}</span>{row.rejectReason && <small style={{ display: "block", whiteSpace: "normal" }}>{row.rejectReason}</small>}</td>
          <td className="is-left bk-muted">{row.reviewedBy?.name ?? "—"}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>;
}
