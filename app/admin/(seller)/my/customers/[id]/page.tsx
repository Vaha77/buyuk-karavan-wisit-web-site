import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSeller } from "@/lib/auth/require-admin";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { myCustomer, myCustomerHistory, toRow } from "@/lib/customers/seller-queries";
import { CONTACT_RESULTS, PURCHASE_STATUS } from "@/lib/customers/seller-rules";
import { formatDayMonth, formatDecimal, formatUsd } from "@/lib/dashboard/format";
import { ContactButton, DaysBadge, EditCustomerButton, PurchaseForm } from "@/components/admin/bklead/seller";

export const metadata: Metadata = { title: "Mijoz | BUYUK KARAVAN" };

export default async function MyCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSeller();
  const { id } = await params;
  // Scoped lookup: another seller's (or an unassigned) customer id is simply "not found".
  const customer = user.salesPersonId ? await myCustomer(user, id) : null;
  if (!customer) notFound();
  const [history, rate] = await Promise.all([myCustomerHistory(user, id), getUsdUzsRate()]);
  const row = toRow(customer);
  return <div className="bk">
    <Link className="bk-back" href="/admin/my"><ArrowLeft size={13} style={{ verticalAlign: "-2px" }}/> Mening mijozlarim</Link>
    <div className="bk-head">
      <div><h1>{customer.name}</h1><p className="bk-muted">{[row.phone, row.region, `oraliq ${customer.callIntervalDays} kun`].filter(Boolean).join(" · ")}</p>{customer.note && <p className="bk-muted">{customer.note}</p>}</div>
      <div className="bk-actions"><DaysBadge days={row.days} tone={row.due}/>{row.phone && <a className="bk-btn" href={`tel:${row.phone}`}>Qo‘ng‘iroq qilish</a>}<ContactButton customerId={customer.id} customerName={customer.name}/>
        <EditCustomerButton customer={{ id: customer.id, name: customer.name, phone: row.phone, country: customer.country, regionCode: customer.regionCode ?? "", note: customer.note ?? "", callIntervalDays: customer.callIntervalDays }}/></div>
    </div>
    <div className="bk-grid-main">
      <section className="bk-card" aria-labelledby="sl-history-title">
        <div className="bk-card-head"><div><h2 id="sl-history-title">Qo‘ng‘iroqlar</h2><span className="bk-muted">{customer.nextContactAt ? `Keyingi: ${formatDayMonth(customer.nextContactAt)}` : "Keyingi sana belgilanmagan"}</span></div></div>
        {history.contacts.length ? <div className="bk-list">{history.contacts.map(contact => <div key={contact.id}><div className="bk-grow"><b>{CONTACT_RESULTS[contact.result]}</b><span>{formatDayMonth(contact.at)}{contact.note ? ` · ${contact.note}` : ""}</span></div></div>)}</div> : <div className="bk-empty">Hali qo‘ng‘iroq yozilmagan.</div>}
      </section>
      <section className="bk-card" aria-labelledby="sl-buy-title" style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <h2 id="sl-buy-title">Xarid kiritish</h2>
        {customer.isActive ? <PurchaseForm customers={[{ id: customer.id, name: customer.name }]} fixedCustomerId={customer.id} uzsPerUsd={rate ? Number(rate.rate) : null}/> : <p className="bk-muted">Mijoz nofaol.</p>}
        {history.purchases.length > 0 && <div className="bk-list">{history.purchases.map(purchase => <div key={purchase.id}><div className="bk-grow"><b>{formatUsd(Number(purchase.amountUsd))} <small>({formatDecimal(Number(purchase.amount), 2)} {purchase.currency === "UZS" ? "so‘m" : "$"})</small></b><span>{purchase.date.toISOString().slice(0, 10)}{purchase.rejectReason ? ` · sabab: ${purchase.rejectReason}` : ""}</span></div><span className={`bk-badge${purchase.status === "APPROVED" ? "" : purchase.status === "REJECTED" ? " is-orange" : " is-soft"}`}>{PURCHASE_STATUS[purchase.status]}</span></div>)}</div>}
      </section>
    </div>
  </div>;
}
