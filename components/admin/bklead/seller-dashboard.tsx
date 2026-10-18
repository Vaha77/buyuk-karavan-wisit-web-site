// Seller dashboard: only the viewer's own place reaches the page, never other sellers' names or percents.
import Link from "next/link";
import { Phone } from "lucide-react";
import { formatDayMonth, formatInt, formatPercent, formatUsd, MONTHS_LONG } from "@/lib/dashboard/format";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/sex/rules";
import type { myDashboard } from "@/lib/customers/seller-queries";
import { RegionLines } from "./charts";
import type { MyPlace } from "@/lib/sales-plan/seller-ranking";
import { zoneStyle } from "@/lib/sales-plan/zones";

/** "Sotuv rejasi reytingida siz N-o‘rindasiz" card on top of /admin/my. */
export function RankCard({ me, periodName }: { me: MyPlace | null; periodName: string | null }) {
  const zone = me && zoneStyle(me.zone);
  return <section className="bk-card" aria-label="Sotuv rejasi reytingidagi o‘rningiz" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", padding: "12px 16px" }}>
    {me && zone ? <>
      <strong>Sotuv rejasi reytingida siz {me.rank}-o‘rindasiz · {formatPercent(me.percent)}</strong>
      <span className="sl-zone" style={{ background: zone.color, color: zone.text }}>{zone.label}</span>
    </> : <strong>Sotuv rejangiz hali kiritilmagan</strong>}
    {periodName && <span className="bk-muted">{periodName}</span>}
  </section>;
}

type Dashboard = Awaited<ReturnType<typeof myDashboard>>;
const Kpi = ({ label, value, foot, href, alert }: { label: string; value: string; foot?: string; href?: string; alert?: boolean }) => {
  const body = <><div className="bk-kpi-top">{label}</div><strong className={alert ? "sl-alert" : undefined}>{value}</strong>{foot && <span className="bk-kpi-foot">{foot}</span>}</>;
  return href ? <Link href={href} className="bk-card bk-kpi sl-kpi-link">{body}</Link> : <div className="bk-card bk-kpi">{body}</div>;
};
const Head = ({ id, title, note }: { id: string; title: string; note?: string }) => <div className="bk-card-head"><div><h2 id={id}>{title}</h2>{note && <span className="bk-muted">{note}</span>}</div></div>;

/** 1. REJA: this month's share of the period plan. */
export function PlanBlock({ plan, month }: { plan: Dashboard["plan"]; month: number }) {
  return <section className="bk-card" aria-labelledby="md-plan"><Head id="md-plan" title={`Reja — ${MONTHS_LONG[month - 1]}`} note="Davr rejasining shu oyga to‘g‘ri keladigan qismi"/>
    {plan ? <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><strong>{formatUsd(plan.done)} / {formatUsd(plan.plan)}</strong><strong>{formatPercent(plan.percent)}</strong></div>
      <div className="bk-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, plan.percent))} aria-label="Oylik reja bajarilishi"><i style={{ width: `${Math.min(100, plan.percent)}%`, background: "var(--bk-primary)" }}/></div>
      <span className="bk-muted">{plan.remaining > 0 ? <>Oy oxirigacha {plan.daysLeft} kun · kuniga <b>{formatUsd(plan.dailyNeeded)}</b> kerak (qolgan {formatUsd(plan.remaining)})</> : <b>Oylik reja bajarildi!</b>}</span>
    </div> : <div className="bk-empty">Joriy davr uchun rejangiz hali kiritilmagan.</div>}
  </section>;
}

/** 2. BUGUN. */
export function TodayBlock({ due, pending, newLeads }: { due: number; pending: number; newLeads: number | null }) {
  return <div className="bk-grid-3">
    <Kpi label="Bugun qo‘ng‘iroq" value={formatInt(due)} foot="muddati kelgan mijozlar" href="/admin/my/today" alert={due > 0}/>
    <Kpi label="Javobsiz yangi lidlar" value={newLeads === null ? "—" : formatInt(newLeads)} foot={newLeads === null ? "Telegram agent bog‘lanmagan" : "Telegram botda javob bering"} alert={!!newLeads}/>
    <Kpi label="Tasdiqlash kutilmoqda" value={formatInt(pending)} foot="xaridlar" href="/admin/my/purchase"/>
  </div>;
}

/** 3. MIJOZLAR: counts and the 60+ days list. */
export function CustomersBlock({ data }: { data: Dashboard }) {
  return <section className="bk-card" aria-labelledby="md-customers" style={{ display: "grid", gap: 12 }}><Head id="md-customers" title="Mijozlar"/>
    <div className="bk-tiles"><div className="bk-tile"><span>Faol mijozlar</span><strong>{formatInt(data.customers)}</strong></div><div className="bk-tile"><span>Bu oy xarid qilganlar</span><strong>{formatInt(data.purchases.boughtThisMonth)}</strong></div><div className="bk-tile"><span>60+ kun xarid qilmagan</span><strong>{formatInt(data.stale.length)}</strong></div></div>
    {data.stale.length > 0 && <div className="bk-list">{data.stale.map(customer => <div key={customer.id}>
      <div className="bk-grow"><b><Link href={`/admin/my/customers/${customer.id}`}>{customer.name}</Link></b><span>{customer.lastPurchaseAt ? `Oxirgi xarid: ${formatDayMonth(customer.lastPurchaseAt)}` : "Hali xarid qilmagan"} · {customer.days} kun</span></div>
      {customer.phone && <a className="bk-btn" href={`tel:${customer.phone}`} aria-label={`${customer.name}ga qo‘ng‘iroq`}><Phone size={14}/></a>}
    </div>)}</div>}
  </section>;
}

/** 4. DINAMIKA. */
export function DynamicsBlock({ data, now }: { data: Dashboard; now: { year: number; month: number } }) {
  const { purchases } = data;
  return <section className="bk-card" aria-labelledby="md-dyn" style={{ display: "grid", gap: 12 }}><Head id="md-dyn" title="Dinamika" note={`Oylik sotuv, ${now.year} va ${now.year - 1}`}/>
    <RegionLines series={[{ name: String(now.year), months: data.months.thisYear }, { name: String(now.year - 1), months: data.months.lastYear }]} lastMonth={now.month} label={`Oylik sotuv: ${now.year} va ${now.year - 1}`}/>
    <div className="bk-tiles"><div className="bk-tile"><span>O‘rtacha chek</span><strong>{formatUsd(purchases.average)}</strong></div><div className="bk-tile"><span>Eng katta xarid</span><strong>{formatUsd(purchases.biggest)}</strong></div><div className="bk-tile"><span>Eng ko‘p olgan mijoz</span><strong>{purchases.top ? `${purchases.top.name} · ${formatUsd(purchases.top.total)}` : "—"}</strong></div></div>
  </section>;
}

/** 5. LIDLAR (only with a linked Telegram agent). */
export function LeadsBlock({ leads }: { leads: NonNullable<Dashboard["leads"]> }) {
  return <section className="bk-card" aria-labelledby="md-leads"><Head id="md-leads" title="Lidlar — bu oy"/>
    <div className="bk-tiles"><div className="bk-tile"><span>Kelgan lidlar</span><strong>{formatInt(leads.count)}</strong></div><div className="bk-tile"><span>Sotuvga aylangan</span><strong>{formatInt(leads.won)} · {formatPercent(leads.conversion)}</strong></div><div className="bk-tile"><span>Manbalar</span><strong>Instagram {leads.sources.instagram} · Sayt {leads.sources.site} · Referal {leads.sources.referral}</strong></div></div>
  </section>;
}

/** 6. MARJA (hidden without data). */
export function MarjaBlock({ marja }: { marja: NonNullable<Dashboard["marja"]> }) {
  return <section className="bk-card" aria-labelledby="md-marja"><Head id="md-marja" title="Mening marjam"/>
    <div className="bk-tiles bk-tiles-2"><div className="bk-tile"><span>Bu oy</span><strong>{formatInt(marja.month)}</strong></div><div className="bk-tile"><span>Yil boshidan</span><strong>{formatInt(marja.year)}</strong></div></div>
  </section>;
}

/** 8. SEH ZAKAZLARI: the seller's open orders. */
export function OrdersBlock({ orders }: { orders: Dashboard["orders"] }) {
  return <section className="bk-card" aria-labelledby="md-orders"><div className="bk-card-head"><div><h2 id="md-orders">Seh zakazlari</h2><span className="bk-muted">Ochiq zakazlaringiz</span></div><Link href="/admin/seh">Hammasi</Link></div>
    {orders.length ? <div className="bk-list">{orders.map(order => <div key={order.id}>
      <div className="bk-grow"><b>#{String(order.number).padStart(4, "0")} · {TYPE_LABEL[order.type]}{order.customerName ? ` · ${order.customerName}` : ""}</b><span>{formatDayMonth(order.createdAt)}{order.dueDate ? ` · muddat ${formatDayMonth(order.dueDate)}` : ""}</span></div>
      <span className="bk-badge">{STATUS_LABEL[order.status]}</span>
    </div>)}</div> : <div className="bk-empty">Ochiq zakaz yo‘q.</div>}
  </section>;
}
