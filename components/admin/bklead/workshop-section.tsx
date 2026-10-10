import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Factory, PackageCheck, Timer, Wrench } from "lucide-react";
import { delta } from "@/lib/dashboard/rules";
import { formatDayMonth, formatInt, formatPercent, formatUsd } from "@/lib/dashboard/format";
import { getWorkshopDashboard } from "@/lib/dashboard/workshop-queries";
import { formatPrepTime } from "@/lib/dashboard/workshop-rules";
import { orderNumber, STATUS_LABEL, when } from "@/lib/sex/rules";
import { WeeklyLines } from "./charts";

type Period = { from: Date; to: Date; prevFrom: Date; label: string };
const initials = (name: string) => name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
const orderHref = (id: string) => `/admin/seh#order-${id}`;

/** "Seh zakazlari" block of the dashboard (SUPER_ADMIN / ADMIN). Streams in on its own behind <WorkshopSectionSkeleton/>. */
export async function WorkshopSection({ period }: { period: Period }) {
  const now = new Date();
  const { kpis, weekly, sellers, products, attention } = await getWorkshopDashboard(period, now);
  const change = delta(kpis.total, kpis.prev);
  const DeltaIcon = change.direction === "down" ? ArrowDownRight : ArrowUpRight;
  const inShop = kpis.now.new + kpis.now.accepted + kpis.now.started;
  const maxQty = Math.max(1, ...products.map(product => product.qty));

  return <section className="bk-section" aria-labelledby="bk-sex-title">
    <div className="bk-section-head">
      <div><h2 id="bk-sex-title">Seh zakazlari</h2><span className="bk-muted">Agregat va zapchast zakazlari · {period.label.toLocaleLowerCase("uz-UZ")} · bekor qilinganlar hisobga olinmagan</span></div>
      <Link className="bk-btn" href="/admin/seh">Seh zakazlari →</Link>
    </div>

    <div className="bk-grid-4">
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Jami zakazlar<span className="bk-kpi-icon"><Wrench size={16}/></span></div><strong>{formatInt(kpis.total)}</strong>
        <span className="bk-kpi-foot">
          {change.direction === "flat" ? <span className="bk-delta">0</span> : <span className={`bk-delta${change.direction === "down" ? " is-down" : ""}`}><DeltaIcon size={12}/>{change.relative ? formatPercent(change.value, 0) : formatInt(kpis.total - kpis.prev)}</span>}
          Agregat {formatInt(kpis.agregat)} · Zapchast {formatInt(kpis.zapchast)}
        </span></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Hozir sehda<span className="bk-kpi-icon is-orange"><Factory size={16}/></span></div><strong>{formatInt(inShop)}</strong>
        <span className="bk-kpi-foot">Yangi {formatInt(kpis.now.new)} · Navbatda {formatInt(kpis.now.accepted)} · Terilmoqda {formatInt(kpis.now.started)}</span></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Chiqib ketdi<span className="bk-kpi-icon"><PackageCheck size={16}/></span></div><strong>{formatInt(kpis.issued)}</strong>
        <span className="bk-kpi-foot"><span className="bk-delta">{formatUsd(kpis.issuedUsd)}</span>prays narxida (zakazdagi narx)</span></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">O‘rtacha tayyorlash vaqti<span className="bk-kpi-icon"><Timer size={16}/></span></div><strong>{formatPrepTime(kpis.prepSeconds)}</strong>
        <span className="bk-kpi-foot">{kpis.overdue ? <><span className="bk-delta is-red">{formatInt(kpis.overdue)} ta</span>muddati o‘tgan</> : "Qabul qilindi → chiqib ketdi · muddati o‘tgan yo‘q"}</span></div>
    </div>

    <div className="bk-grid-main">
      <section className="bk-card" aria-labelledby="bk-sex-weekly-title">
        <div className="bk-card-head"><div><h2 id="bk-sex-weekly-title">Seh dinamikasi</h2><span className="bk-muted">So‘nggi 12 hafta, haftalik</span></div><div className="bk-legend"><span><i style={{ background: "#123E7C", borderRadius: "50%" }}/>Kelgan zakazlar</span><span><i style={{ background: "#E07A2E", borderRadius: "50%" }}/>Chiqib ketgan</span></div></div>
        <WeeklyLines unit="zakaz" weeks={weekly.map(week => ({ label: formatDayMonth(new Date(`${week.week}T12:00:00+05:00`)), leads: week.incoming, calculations: week.issued }))} label="So‘nggi 12 haftada kelgan va chiqib ketgan seh zakazlari"/>
      </section>
      <section className="bk-card" aria-labelledby="bk-sex-top-title" style={{ display: "grid", alignContent: "start", gap: 14 }}>
        <div className="bk-card-head" style={{ marginBottom: 0 }}><div><h2 id="bk-sex-top-title">Top mahsulotlar</h2><span className="bk-muted">Eng ko‘p zakaz qilingan 10 ta · {period.label.toLocaleLowerCase("uz-UZ")}</span></div></div>
        {products.length ? <div className="bk-bars">{products.map((product, index) => <div className="bk-bar-row" key={product.key}>
          <div><span>{product.title}</span><span><b>{formatInt(product.qty)}</b> dona · {formatInt(product.orders)} zakaz</span></div>
          <div className={`bk-bar ${index < 3 ? "" : "is-b2"}`} style={{ width: `${Math.max(2, (product.qty / maxQty) * 100)}%`, height: 10 }}/>
        </div>)}</div> : <div className="bk-empty">Bu davrda zakaz yo‘q.</div>}
      </section>
    </div>

    <div className="bk-grid-main">
      <section className="bk-card" aria-labelledby="bk-sex-sellers-title">
        <div className="bk-card-head"><div><h2 id="bk-sex-sellers-title">Sotuvchilar bo‘yicha</h2><span className="bk-muted">Davrda berilgan zakazlar · summa bo‘yicha saralangan</span></div></div>
        {sellers.length ? <div className="bk-table-wrap"><table className="bk-table"><thead><tr><th>Sotuvchi</th><th>Zakazlar</th><th>Summa</th><th>O‘rt. tayyorlash</th></tr></thead>
          <tbody>{sellers.map(seller => <tr key={seller.id}>
            <td><div className="bk-link-cell" style={{ minWidth: 150 }}><span className="bk-avatar">{initials(seller.name)}</span><b>{seller.name}</b></div></td>
            <td>{formatInt(seller.orders)}</td><td className="is-strong">{formatUsd(seller.usd)}</td><td>{formatPrepTime(seller.prepSeconds)}</td>
          </tr>)}</tbody></table></div> : <div className="bk-empty">Bu davrda zakaz bergan sotuvchi yo‘q.</div>}
      </section>
      <section className="bk-card" aria-labelledby="bk-sex-alert-title">
        <div className="bk-card-head"><div><h2 id="bk-sex-alert-title">Diqqat talab</h2><span className="bk-muted">24 soatdan ortiq qabul qilinmagan va muddati o‘tgan</span></div>{attention.total > 0 && <span className="bk-badge is-red">{formatInt(attention.total)} ta</span>}</div>
        {attention.rows.length ? <div className="bk-list">{attention.rows.map(order => <Link key={order.id} href={orderHref(order.id)} style={{ color: "inherit", textDecoration: "none" }}>
          <span className="bk-alert-icon"><AlertTriangle size={15}/></span>
          <span className="bk-grow"><b>{orderNumber(order.number)} · {order.product}</b>
            <span>{[order.seller, order.customerName, `berildi ${when(order.createdAt, now)}`].filter(Boolean).join(" · ")}</span>
            <span className="bk-alert-reasons">{order.reasons.includes("overdue") && <em>Muddat {order.dueDate!.split("-").reverse().join(".")} o‘tgan</em>}{order.reasons.includes("unaccepted") && <em>24 soatdan beri qabul qilinmagan</em>}</span>
          </span>
          <span className="bk-badge is-grey">{STATUS_LABEL[order.status]}</span>
        </Link>)}</div> : <div className="bk-empty">Hammasi joyida — kechikkan zakaz yo‘q.</div>}
        {attention.total > attention.rows.length && <p className="bk-muted" style={{ marginTop: 10 }}>Yana {formatInt(attention.total - attention.rows.length)} ta — <Link href="/admin/seh">barchasini ko‘rish</Link></p>}
      </section>
    </div>
  </section>;
}
