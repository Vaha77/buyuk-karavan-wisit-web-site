import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/require-admin";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { myCustomers, myPurchases } from "@/lib/customers/seller-queries";
import { PURCHASE_STATUS } from "@/lib/customers/seller-rules";
import { formatDecimal, formatUsd } from "@/lib/dashboard/format";
import { NotLinked } from "@/components/admin/bklead/not-linked";
import { PurchaseForm } from "@/components/admin/bklead/seller";

export const metadata: Metadata = { title: "Xarid kiritish | BUYUK KARAVAN" };

export default async function PurchasePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { user } = await requireSeller();
  if (!user.salesPersonId) return <NotLinked/>;
  const search = await searchParams;
  const [customers, purchases, rate] = await Promise.all([myCustomers(user), myPurchases(user), getUsdUzsRate()]);
  const active = customers.filter(customer => customer.isActive).map(customer => ({ id: customer.id, name: customer.name }));
  const preselected = active.find(customer => customer.id === search.customer);
  const ordered = preselected ? [preselected, ...active.filter(customer => customer.id !== preselected.id)] : active;
  return <div className="bk">
    <div className="bk-head"><div><h1>Xarid kiritish</h1><p className="bk-muted">Admin tasdiqlagach mijozning oylik savdosiga qo‘shiladi</p></div></div>
    <section className="bk-card"><PurchaseForm customers={ordered} uzsPerUsd={rate ? Number(rate.rate) : null}/></section>
    <section className="bk-card" aria-labelledby="sl-purchases-title">
      <div className="bk-card-head"><div><h2 id="sl-purchases-title">Mening xaridlarim</h2><span className="bk-muted">So‘nggi 30 ta</span></div></div>
      {purchases.length ? <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>Sana</th><th className="is-left">Mijoz</th><th>Summa</th><th>$</th><th className="is-left">Holat</th></tr></thead>
        <tbody>{purchases.map(row => <tr key={row.id}>
          <td>{row.date.toISOString().slice(0, 10)}</td><td className="is-left"><Link href={`/admin/my/customers/${row.customer.id}`}>{row.customer.name}</Link></td>
          <td>{formatDecimal(Number(row.amount), 2)} {row.currency === "UZS" ? "so‘m" : "$"}</td><td className="is-strong">{formatUsd(Number(row.amountUsd))}</td>
          <td className="is-left"><span className={`bk-badge${row.status === "APPROVED" ? "" : row.status === "REJECTED" ? " is-orange" : " is-soft"}`}>{PURCHASE_STATUS[row.status]}</span>{row.rejectReason && <small style={{ display: "block", whiteSpace: "normal" }}>Sabab: {row.rejectReason}</small>}</td>
        </tr>)}</tbody>
      </table></div> : <div className="bk-empty">Hali xarid kiritilmagan.</div>}
    </section>
  </div>;
}
