import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/require-admin";
import { myCustomers, myStats, toRow } from "@/lib/customers/seller-queries";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { formatInt, formatUsd } from "@/lib/dashboard/format";
import { NotLinked } from "@/components/admin/bklead/not-linked";
import { NewCustomerButton, SellerCustomerList } from "@/components/admin/bklead/seller";

export const metadata: Metadata = { title: "Mening mijozlarim | BUYUK KARAVAN" };

export default async function MyCustomersPage() {
  const { user } = await requireSeller();
  if (!user.salesPersonId) return <NotLinked/>;
  const year = tashkentYearMonth().year;
  const [customers, stats] = await Promise.all([myCustomers(user), myStats(user, year)]);
  const rows = customers.map(customer => toRow(customer));
  return <div className="bk">
    <div className="bk-head"><div><h1>Mening mijozlarim</h1><p className="bk-muted">Faqat sizga biriktirilgan doimiy mijozlar</p></div><NewCustomerButton/></div>
    <div className="bk-grid-4">
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Faol mijozlar</div><strong>{formatInt(stats.customers)}</strong></div>
      <Link href="/admin/my/today" className="bk-card bk-kpi sl-kpi-link"><div className="bk-kpi-top">Bugun qo‘ng‘iroq</div><strong className={stats.due ? "sl-alert" : undefined}>{formatInt(stats.due)}</strong></Link>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">{year}-yil tasdiqlangan savdo</div><strong>{formatUsd(stats.approvedUsd)}</strong></div>
      <Link href="/admin/my/purchase" className="bk-card bk-kpi sl-kpi-link"><div className="bk-kpi-top">Tasdiqlash kutilmoqda</div><strong>{formatInt(stats.pendingCount)}</strong><span className="bk-kpi-foot">{formatUsd(stats.pendingUsd)} · statistikaga hali qo‘shilmagan</span></Link>
    </div>
    <section className="bk-card" aria-labelledby="sl-list-title" style={{ display: "grid", gap: 12 }}>
      <div className="bk-card-head" style={{ marginBottom: 0 }}><div><h2 id="sl-list-title">Mijozlar</h2><span className="bk-muted">{rows.length} ta · raqam = oxirgi xariddan beri kunlar (qizil — oraliq o‘tgan, sariq — kelishilgan qo‘ng‘iroq)</span></div></div>
      <SellerCustomerList customers={rows}/>
    </section>
  </div>;
}
