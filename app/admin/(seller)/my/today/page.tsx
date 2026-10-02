import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/require-admin";
import { myDueCustomers, toRow } from "@/lib/customers/seller-queries";
import { formatDayMonth } from "@/lib/dashboard/format";
import { NotLinked } from "@/components/admin/bklead/not-linked";
import { ContactButton, DaysBadge } from "@/components/admin/bklead/seller";

export const metadata: Metadata = { title: "Bugun qo‘ng‘iroq | BUYUK KARAVAN" };

export default async function TodayPage() {
  const { user } = await requireSeller();
  if (!user.salesPersonId) return <NotLinked/>;
  const rows = (await myDueCustomers(user)).map(customer => toRow(customer)).sort((a, b) => (a.due === b.due ? b.days - a.days : a.due === "red" ? -1 : 1));
  return <div className="bk">
    <div className="bk-head"><div><h1>Bugun qo‘ng‘iroq</h1><p className="bk-muted">Qo‘ng‘iroq oralig‘i o‘tgan yoki bugunga kelishilgan mijozlar · {rows.length} ta</p></div></div>
    <div className="bk-legend"><span><i className="sl-dot is-red"/>Oraliq o‘tgan, xarid yo‘q</span><span><i className="sl-dot is-yellow"/>Kelishilgan qo‘ng‘iroq sanasi</span></div>
    {rows.length ? <div className="sl-cards">{rows.map(row => <article key={row.id} className={`bk-card sl-card is-${row.due}`}>
      <div className="sl-card-head"><div><Link href={`/admin/my/customers/${row.id}`}><b>{row.name}</b></Link><span className="bk-muted">{[row.phone, row.region].filter(Boolean).join(" · ")}</span></div><DaysBadge days={row.days} tone={row.due}/></div>
      <span className="bk-muted" style={{ fontSize: 12 }}>Oraliq: {row.callIntervalDays} kun{row.nextContact ? ` · kelishilgan sana: ${formatDayMonth(new Date(row.nextContact))}` : ""}</span>
      <div className="bk-actions">{row.phone && <a className="bk-btn" href={`tel:${row.phone}`}>Qo‘ng‘iroq qilish</a>}<ContactButton customerId={row.id} customerName={row.name}/></div>
    </article>)}</div> : <div className="bk-empty"><strong>Bugun qo‘ng‘iroq qilinadigan mijoz yo‘q</strong><span>Hammasi joyida.</span></div>}
  </div>;
}
