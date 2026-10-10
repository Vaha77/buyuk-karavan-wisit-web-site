import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, MessageSquare, Plus, TrendingUp } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { getCustomerYear } from "@/lib/customers/queries";
import { getDb } from "@/lib/db";
import { getDashboardData, getPreviousConversion } from "@/lib/dashboard/queries";
import { buildFunnel, delta } from "@/lib/dashboard/rules";
import { dayKey, periodQuery, resolvePeriod, tashkentYearMonth } from "@/lib/dashboard/period";
import { formatDayMonth, formatDecimal, formatInt, formatPercent, formatRelative, formatUsd, percentOf } from "@/lib/dashboard/format";
import { regionName } from "@/lib/dashboard/regions";
import { getLinkSummary } from "@/lib/referrals/queries";
import { RangeSelect, SourceIcon } from "@/components/admin/bklead/bits";
import { WeeklyLines } from "@/components/admin/bklead/charts";
import { RegionMap } from "@/components/admin/bklead/region-map";
import { CustomerRanking } from "@/components/admin/bklead/customer-ranking";
import { WorkshopSection } from "@/components/admin/bklead/workshop-section";
import { WorkshopSectionSkeleton } from "@/components/admin/skeletons";

export const metadata: Metadata = { title: "BKLead Dashboard — Admin | BUYUK KARAVAN" };
type Search = { range?: string; from?: string; to?: string; cyear?: string };

const DEFAULT_TIPS = { all: "Xorijdan kelgan lidlar uchun rus tilidagi reklama va Telegram orqali javob berish tavsiya etiladi." };
const LEVEL_CHIPS = [{ label: "Yangi", tone: "is-orange" }, { label: "Bog‘lanildi", tone: "" }, { label: "Hisob-kitob", tone: "is-navy" }, { label: "Taklif yuborildi", tone: "" }, { label: "Sotuv", tone: "is-gold" }] as const;
const initials = (name: string) => name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();

function Delta({ current, previous, suffix = "oldingi davrga nisbatan" }: { current: number; previous: number; suffix?: string }) {
  const change = delta(current, previous);
  if (change.direction === "flat") return <span className="bk-kpi-foot"><span className="bk-delta">0</span>{suffix}</span>;
  const Icon = change.direction === "up" ? ArrowUpRight : ArrowDownRight;
  return <span className="bk-kpi-foot"><span className={`bk-delta${change.direction === "down" ? " is-down" : ""}`}><Icon size={12}/>{change.relative ? formatPercent(change.value, 0) : formatInt(current - previous)}</span>{suffix}</span>;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireAdmin();
  const search = await searchParams;
  const period = resolvePeriod(search);
  const today = tashkentYearMonth();
  const rankingYear = /^20\d{2}$/.test(search.cyear ?? "") && Number(search.cyear) <= today.year ? Number(search.cyear) : today.year;
  const [data, previousConversion, links, settings, customerYear, rate] = await Promise.all([
    getDashboardData(period), getPreviousConversion(period), getLinkSummary(period),
    getDb().siteSettings.findUnique({ where: { id: "global" }, select: { dashboardTips: true } }).catch(() => null),
    getCustomerYear(rankingYear), getUsdUzsRate(),
  ]);
  const { kpis, weekly, funnel, regions, people } = data;
  const conversion = percentOf(kpis.sales, kpis.leads), conversionChange = conversion - previousConversion;
  const funnelView = buildFunnel([
    { key: "lead", label: "Lid keldi", count: funnel[0] }, { key: "contact", label: "Bog‘lanildi", count: funnel[1] }, { key: "calc", label: "Hisob-kitob qilindi", count: funnel[2] },
    { key: "offer", label: "Tijorat taklifi", count: funnel[3] }, { key: "sale", label: "Sotuv", count: funnel[4] },
  ]);
  const tips = { ...DEFAULT_TIPS, ...((settings?.dashboardTips as Record<string, string> | null) ?? {}) };
  const linkRows = [...links.rows].filter(row => row.clicks > 0 || row.status === "ACTIVE").sort((a, b) => b.leads - a.leads || b.clicks - a.clicks).slice(0, 6);
  const maxClicks = Math.max(1, ...linkRows.map(row => row.clicks));
  const now = new Date();
  const query = periodQuery(period);
  const boss = user.role === "SUPER_ADMIN" || user.role === "ADMIN";

  return <div className="bk">
    <div className="bk-head">
      <div><h1>BKLead Dashboard</h1><p className="bk-muted">Lidlar, sotuvlar va viloyatlar bo‘yicha holat · {period.label}</p></div>
      <RangeSelect value={period.key} from={dayKey(period.from)} to={dayKey(new Date(period.to.getTime() - 86_400_000))}/>
    </div>

    <div className="bk-grid-4">
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Jami lidlar<span className="bk-kpi-icon"><MessageSquare size={16}/></span></div><strong>{formatInt(kpis.leads)}</strong>
        <span className="bk-kpi-foot"><Delta current={kpis.leads} previous={kpis.prevLeads} suffix=""/>O‘zbekiston {formatInt(kpis.uz)} · xorij {formatInt(kpis.foreign)}{kpis.unknown ? ` · aniqlanmagan ${formatInt(kpis.unknown)}` : ""}</span></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Yangi (ishlanmagan) lidlar<span className="bk-kpi-icon is-orange"><Clock3 size={16}/></span></div><strong>{formatInt(kpis.fresh)}</strong>
        <span className="bk-kpi-foot">{kpis.stale ? <><span className="bk-delta is-alert">{formatInt(kpis.stale)} ta</span>24 soatdan ortiq javobsiz</> : "Hammasiga 24 soat ichida javob berilgan"}</span></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Tasdiqlangan sotuvlar<span className="bk-kpi-icon"><CheckCircle2 size={16}/></span></div><strong>{formatInt(kpis.sales)}</strong><Delta current={kpis.sales} previous={kpis.prevSales}/></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Konversiya (lid → sotuv)<span className="bk-kpi-icon"><TrendingUp size={16}/></span></div><strong>{formatPercent(conversion)}</strong>
        <span className="bk-kpi-foot"><span className={`bk-delta${conversionChange < 0 ? " is-down" : ""}`}>{conversionChange < 0 ? <ArrowDownRight size={12}/> : <ArrowUpRight size={12}/>}{formatDecimal(Math.abs(conversionChange))} p.p.</span>oldingi davrga nisbatan</span></div>
    </div>

    <div className="bk-grid-main">
      <section className="bk-card" aria-labelledby="bk-weekly-title">
        <div className="bk-card-head"><div><h2 id="bk-weekly-title">Lidlar dinamikasi</h2><span className="bk-muted">So‘nggi 12 hafta, haftalik</span></div><div className="bk-legend"><span><i style={{ background: "#123E7C", borderRadius: "50%" }}/>Lidlar</span><span><i style={{ background: "#E07A2E", borderRadius: "50%" }}/>Hisob-kitoblar</span></div></div>
        <WeeklyLines weeks={weekly.map(week => ({ label: formatDayMonth(new Date(`${week.week}T12:00:00+05:00`)), leads: week.leads, calculations: week.calculations }))} label="So‘nggi 12 haftadagi lidlar va hisob-kitoblar"/>
      </section>
      <section className="bk-card" aria-labelledby="bk-funnel-title" style={{ display: "grid", alignContent: "start", gap: 14 }}>
        <div className="bk-card-head" style={{ marginBottom: 0 }}><div><h2 id="bk-funnel-title">Sotuv voronkasi</h2><span className="bk-muted">{period.label}</span></div></div>
        {funnelView.rows[0].count ? <div className="bk-bars">{funnelView.rows.map((stage, index) => <div className="bk-bar-row" key={stage.key}>
          <div><span>{stage.label}</span><span><b>{formatInt(stage.count)}</b>{index ? ` · ${formatPercent(stage.percent, stage.percent < 10 ? 1 : 0)}` : ""}</span></div>
          <div className={`bk-bar ${index === 0 ? "" : index === 1 ? "is-b1" : index === 2 ? "is-b2" : index === 3 ? "is-b3" : "is-orange"}`} style={{ width: `${Math.max(2, stage.percent)}%`, height: 18 }}/>
        </div>)}</div> : <div className="bk-empty">Bu davrda lid yo‘q.</div>}
        {funnelView.biggest && <p className="bk-note">Eng katta yo‘qotish: <strong>{funnelView.biggest.from} → {funnelView.biggest.to}</strong> ({formatInt(funnelView.biggest.lost)} lid)</p>}
      </section>
    </div>

    <RegionMap rows={regions} tips={tips}/>

    <section className="bk-card" aria-labelledby="bk-links-title">
      <div className="bk-card-head">
        <div><h2 id="bk-links-title">Linklar samaradorligi</h2><span className="bk-muted">Referal linklar orqali kelganlar va ularning oxirgi harakati · {period.label.toLocaleLowerCase("uz-UZ")} · zayavkalar bo‘yicha saralangan</span></div>
        <div className="bk-actions"><Link className="bk-btn" href={`/admin/links${query}`}>Barcha linklar</Link><Link className="bk-btn is-primary" href="/admin/links/new"><Plus size={15}/>Yangi link</Link></div>
      </div>
      <div className="bk-legend" style={{ marginBottom: 10 }}><span><i style={{ background: "#D9E3F3" }}/>Ko‘rib chiqib ketdi</span><span><i style={{ background: "#8DB0E4" }}/>Qiziqdi (mahsulot ko‘rdi, 30 s+)</span><span><i style={{ background: "#4F7FCC" }}/>Bog‘lanishga urindi (tel / Telegram / Madina)</span><span><i style={{ background: "#123E7C" }}/>Zayavka qoldirdi</span></div>
      {linkRows.length ? <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>Link</th><th className="is-left">Tashrifchilar harakati</th><th>Klik</th><th>Zayavka</th><th>Sotuv</th><th>Konv.</th></tr></thead>
        <tbody>{linkRows.map(row => {
          const segment = (value: number, color: string) => value ? <i style={{ width: `${(value / Math.max(1, row.clicks)) * 100}%`, background: color }}/> : null;
          return <tr key={row.id}>
            <td><div className="bk-link-cell"><SourceIcon source={row.source}/><div><Link href={`/admin/links/${row.id}`}>{row.name}</Link><small>/r/{row.slug}</small></div></div></td>
            <td className="is-left" style={{ width: "40%" }}><div className="bk-stack" style={{ width: `${Math.max(4, (row.clicks / maxClicks) * 100)}%` }} role="img" aria-label={`Ketdi ${row.segments.left}, qiziqdi ${row.segments.interested}, bog‘lanish ${row.segments.contact}, zayavka ${row.segments.lead}`}>
              {segment(row.segments.left, "#D9E3F3")}{segment(row.segments.interested, "#8DB0E4")}{segment(row.segments.contact, "#4F7FCC")}{segment(row.segments.lead, "#123E7C")}
            </div></td>
            <td>{formatInt(row.clicks)}</td><td className="is-strong">{formatInt(row.leads)}</td><td>{formatInt(row.sales)}</td>
            <td className={row.clicks >= 50 && row.conversion < 2 ? "is-orange" : "is-strong"}>{formatPercent(row.conversion)}</td>
          </tr>;
        })}</tbody>
      </table></div> : <div className="bk-empty"><strong>Hali referal link yo‘q</strong><span>Reklama, bloger yoki QR-kod uchun link yarating — kim kelib, nima qilganini shu yerda ko‘rasiz.</span></div>}
      <p className="bk-note" style={{ marginTop: 12, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
        <span>Linklar orqali: <strong>{formatInt(links.totals.clicks)} klik → {formatInt(links.totals.leads)} zayavka → {formatInt(links.totals.sales)} sotuv</strong>. Qolgan {formatInt(links.directLeads)} lid to‘g‘ridan-to‘g‘ri kelgan.</span>
        {links.cheapest && <strong style={{ color: "var(--bk-primary)" }}>Pullik linklarda eng arzon lid: {links.cheapest.name} · {formatUsd(links.cheapest.costPerLead!, 1)}</strong>}
      </p>
    </section>

    <div className="bk-grid-3">
      <section className="bk-card" aria-labelledby="bk-sellers-title">
        <div className="bk-card-head"><h2 id="bk-sellers-title">Sotuvchilar reytingi</h2><Link href="/admin/sales-agents">Hammasi →</Link></div>
        {people.sellers.length ? <div className="bk-table-wrap"><table className="bk-table"><thead><tr><th>Sotuvchi</th><th>Lid</th><th>Sotuv</th><th>Konv.</th></tr></thead>
          <tbody>{people.sellers.slice(0, 6).map(seller => { const rate = percentOf(seller.sales, seller.leads); return <tr key={seller.id}>
            <td><div className="bk-link-cell" style={{ minWidth: 150 }}><span className="bk-avatar">{initials(seller.name)}</span><b>{seller.name}</b></div></td>
            <td>{formatInt(seller.leads)}</td><td>{formatInt(seller.sales)}</td><td><span className={`bk-badge${seller.leads >= 10 && rate < 2.5 ? " is-soft" : ""}`}>{formatPercent(rate)}</span></td>
          </tr>; })}</tbody></table></div> : <div className="bk-empty">Bu davrda sotuvchilarga biriktirilgan lid yo‘q.</div>}
        <p className="bk-muted" style={{ marginTop: 10 }}>Biriktirilmagan lidlar: <strong>{formatInt(people.unassigned)}</strong></p>
      </section>
      <section className="bk-card" aria-labelledby="bk-customers-title">
        <div className="bk-card-head"><div><h2 id="bk-customers-title">Mijozlar reytingi</h2><span className="bk-muted">Tasdiqlangan sotuvlar summasi</span></div><Link href="/admin/sales">Hammasi →</Link></div>
        {people.customers.length ? <div className="bk-list">{people.customers.map((customer, index) => <div key={`${customer.name}-${index}`}>
          <span className={`bk-medal is-${index + 1}`}>{index + 1}</span>
          <span className="bk-grow"><b>{customer.name}</b><span>{[customer.regionCode ? regionName(customer.regionCode) : customer.region, customer.product].filter(Boolean).join(" · ")}</span></span>
          <span className="bk-amount">{formatUsd(customer.usd)}</span>
        </div>)}</div> : <div className="bk-empty">Bu davrda tasdiqlangan sotuv yo‘q.</div>}
      </section>
      <section className="bk-card" aria-labelledby="bk-latest-title">
        <div className="bk-card-head"><h2 id="bk-latest-title">So‘nggi so‘rovlar</h2><Link href="/admin/leads">Barcha so‘rovlar →</Link></div>
        {people.latest.length ? <div className="bk-list">{people.latest.map(lead => { const chip = lead.lost ? { label: "Yopildi", tone: "is-grey" } : LEVEL_CHIPS[lead.level]; return <Link key={lead.id} href={`/admin/leads?lead=${lead.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          <span className="bk-grow"><b>{lead.title}</b><span>{[lead.regionCode ? regionName(lead.regionCode) : lead.region, lead.customerName, formatRelative(new Date(lead.createdAt), now)].filter(Boolean).join(" · ")}</span></span>
          <span className={`bk-badge ${chip.tone}`}>{chip.label}</span>
        </Link>; })}</div> : <div className="bk-empty">Hali so‘rov yo‘q.</div>}
      </section>
    </div>

    <CustomerRanking data={customerYear} now={today} canEdit={boss} uzsPerUsd={rate ? Number(rate.rate) : null} yearHref={year => { const next = new URLSearchParams(query.replace(/^\?/, "")); if (year !== today.year) next.set("cyear", String(year)); const text = next.toString(); return `/admin${text ? `?${text}` : ""}`; }}/>

    {boss && <Suspense key={query} fallback={<WorkshopSectionSkeleton/>}><WorkshopSection period={period}/></Suspense>}
  </div>;
}
