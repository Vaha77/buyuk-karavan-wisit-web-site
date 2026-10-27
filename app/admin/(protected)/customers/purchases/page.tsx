import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/require-admin";
import { orderNumber } from "@/lib/sex/rules";
import { getDb } from "@/lib/db";
import { PURCHASE_STATUS } from "@/lib/customers/seller-rules";
import { formatDecimal, formatUsd } from "@/lib/dashboard/format";
import { CorrectionReviewButtons, PurchaseReviewButtons, StoreDiffButton } from "@/components/admin/bklead/purchase-review";

export const metadata: Metadata = { title: "Tasdiqlash kerak — Admin | BUYUK KARAVAN" };

const money = (amount: { toString(): string }, currency: string) => `${formatDecimal(Number(amount.toString()), 2)} ${currency === "UZS" ? "so‘m" : "$"}`;

export default async function PurchasesReviewPage() {
  const user = await requireRole("SUPER_ADMIN", "ADMIN");
  const select = { id: true, date: true, amount: true, currency: true, amountUsd: true, note: true, status: true, rejectReason: true, createdAt: true, reviewedAt: true, customer: { select: { name: true } }, seller: { select: { name: true } }, reviewedBy: { select: { name: true } } } as const;
  const [pending, recent, corrections, storeDiffs, kassaDrafts] = await Promise.all([
    getDb().customerPurchase.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select }),
    getDb().customerPurchase.findMany({ where: { status: { not: "PENDING" } }, orderBy: { reviewedAt: "desc" }, take: 20, select }),
    user.role === "SUPER_ADMIN" ? getDb().workshopCorrectionRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { id: true, reason: true, createdAt: true, requester: { select: { name: true } }, order: { select: { id: true, monthKey: true, monthNo: true } } } }) : [],
    // Omborchi "Kamchilik bor / Soni boshqa" reports.
    user.role === "SUPER_ADMIN" ? getDb().workshopOrder.findMany({ where: { receivedNote: { not: null }, receivedCheckedAt: null }, orderBy: { receivedAt: "asc" }, select: { id: true, monthKey: true, monthNo: true, receivedAt: true, receivedQty: true, receivedNote: true, receivedBy: { select: { name: true } } } }) : [],
    user.role === "SUPER_ADMIN" ? getDb().kassaDraft.count({ where: { status: "PENDING" } }) : 0,
  ]);
  return <div className="bk">
    <div className="bk-head"><div><h1>Tasdiqlash kerak</h1><p className="bk-muted">Tasdiqlangan xarid mijozning o‘sha oydagi savdosiga qo‘shiladi; rad etilsa sotuvchi sababni ko‘radi</p></div></div>
    {kassaDrafts > 0 && <Link href="/admin/kassa" className="bk-card" style={{ display: "block" }}>Kassa boti: <b>{kassaDrafts} ta yozuv</b> tasdiqlash kutmoqda →</Link>}
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
    {corrections.length > 0 && <section className="bk-card" aria-labelledby="pr-fix-title">
      <div className="bk-card-head"><div><h2 id="pr-fix-title">Seh zakazini tuzatish so‘rovlari</h2><span className="bk-muted">Yopilgan oy zakazlari · faqat Super Admin tahrirlaydi</span></div></div>
      <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>Sana</th><th className="is-left">Zakaz</th><th className="is-left">Kim</th><th className="is-left">Sabab</th><th><span className="bk-sr-only">Amallar</span></th></tr></thead>
        <tbody>{corrections.map(row => <tr key={row.id}>
          <td>{row.createdAt.toISOString().slice(0, 10)}</td><td className="is-left is-strong">{orderNumber(row.order)}</td><td className="is-left">{row.requester.name}</td><td className="is-left" style={{ whiteSpace: "normal", minWidth: 160 }}>{row.reason}</td>
          <td><CorrectionReviewButtons id={row.id} href={`/admin/seh?month=${row.order.monthKey}&fix=${row.id}#order-${row.order.id}`} label={`${orderNumber(row.order)} · ${row.requester.name}: ${row.reason}`}/></td>
        </tr>)}</tbody>
      </table></div>
    </section>}
    {storeDiffs.length > 0 && <section className="bk-card" aria-labelledby="pr-store-title">
      <div className="bk-card-head"><div><h2 id="pr-store-title">Omborga kamchilik bilan qabul qilindi</h2><span className="bk-muted">Omborchi haqiqiy son va sababni yozgan</span></div></div>
      <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>Sana</th><th className="is-left">Zakaz</th><th className="is-left">Omborchi</th><th>Keldi</th><th className="is-left">Sabab</th><th><span className="bk-sr-only">Amallar</span></th></tr></thead>
        <tbody>{storeDiffs.map(row => <tr key={row.id}>
          <td>{row.receivedAt?.toISOString().slice(0, 10) ?? "—"}</td><td className="is-left is-strong">{orderNumber(row)}</td><td className="is-left">{row.receivedBy?.name ?? "—"}</td><td>{row.receivedQty ?? "—"} ta</td><td className="is-left" style={{ whiteSpace: "normal", minWidth: 160 }}>{row.receivedNote}</td>
          <td><StoreDiffButton id={row.id} label={`${orderNumber(row)}: ${row.receivedNote}`}/></td>
        </tr>)}</tbody>
      </table></div>
    </section>}
    {recent.length > 0 && <section className="bk-card" aria-labelledby="pr-recent-title">
      <div className="bk-card-head"><div><h2 id="pr-recent-title">So‘nggi ko‘rib chiqilganlar</h2></div></div>
      <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>Sana</th><th className="is-left">Mijoz</th><th className="is-left">Sotuvchi</th><th>$</th><th className="is-left">Holat</th><th className="is-left">Kim</th></tr></thead>
        <tbody>{recent.map(row => <tr key={row.id}>
          <td>{row.date.toISOString().slice(0, 10)}</td><td className="is-left">{row.customer.name}</td><td className="is-left">{row.seller?.name ?? "—"}</td><td>{formatUsd(Number(row.amountUsd))}</td>
          <td className="is-left"><span className={`pill ${row.status === "APPROVED" ? "pill-ok" : row.status === "REJECTED" ? "pill-red" : "pill-wait"}`}>{PURCHASE_STATUS[row.status]}</span>{row.rejectReason && <small style={{ display: "block", whiteSpace: "normal" }}>{row.rejectReason}</small>}</td>
          <td className="is-left bk-muted">{row.reviewedBy?.name ?? "—"}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>;
}
