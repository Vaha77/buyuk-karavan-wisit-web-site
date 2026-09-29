import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { COUNTRY_NAMES, REGION_BY_CODE, type LeadCountry } from "@/lib/dashboard/regions";
import { formatDayMonth, formatDuration, formatInt, formatPercent, formatRelative, formatUsd, percentOf } from "@/lib/dashboard/format";
import { dayKey, periodQuery, resolvePeriod } from "@/lib/dashboard/period";
import { getLinkDetail, getLinkVisitors, type VisitorFilter } from "@/lib/referrals/queries";
import { OUTCOME_LABELS, SOURCE_LABELS, TARGETS } from "@/lib/referrals/rules";
import { SITE_URL } from "@/lib/site-url";
import { CopyButton, RangeSelect, SourceIcon } from "@/components/admin/bklead/bits";
import { DailyBars } from "@/components/admin/bklead/charts";
import { LinkStatusButton } from "@/components/admin/bklead/links-table";

export const metadata: Metadata = { title: "Referal link — Admin | BUYUK KARAVAN" };
type Search = { range?: string; from?: string; to?: string; filter?: string; page?: string; days?: string };

const DEVICE_LABELS = { MOBILE: "Mobil", DESKTOP: "Kompyuter", TABLET: "Planshet" } as const;
const OUTCOME_BADGE = { LEFT: "is-grey", INTERESTED: "", CONTACT_ATTEMPT: "is-navy", LEAD: "is-navy", SALE: "is-gold" } as const;
function place(country: string | null, regionCode: string | null) {
  const region = regionCode ? REGION_BY_CODE.get(regionCode)?.name.replace(/ viloyati$/, "") : null;
  if (!country || country === "UZ") return region || (country ? "O‘zbekiston" : "Aniqlanmagan");
  const name = COUNTRY_NAMES[(country in COUNTRY_NAMES ? country : "OTHER") as LeadCountry];
  return region ? `${name}, ${region}` : name;
}

export default async function LinkDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const user = await requireAdmin();
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const period = resolvePeriod(search);
  const filter: VisitorFilter = search.filter === "leads" || search.filter === "left" ? search.filter : "all";
  const page = Math.max(1, Math.trunc(Number(search.page) || 1));
  const dailyDays = search.days === "30" ? 30 : 14;
  const [detail, visitors] = await Promise.all([getLinkDetail(id, period, dailyDays), getLinkVisitors(id, period, filter, page)]);
  if (!detail) notFound();
  const { link, row, avgDurationSec, days } = detail;
  const canEdit = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const url = `${SITE_URL}/r/${link.slug}`;
  const target = TARGETS.find(item => item.path === link.targetPath)?.label ?? link.targetPath;
  const now = new Date();
  const query = (extra: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(periodQuery(period).replace(/^\?/, ""));
    for (const [key, value] of Object.entries({ filter: filter === "all" ? undefined : filter, days: dailyDays === 30 ? 30 : undefined, ...extra })) if (value !== undefined) next.set(key, String(value)); else next.delete(key);
    const text = next.toString(); return text ? `?${text}` : "?";
  };
  const funnel = [
    { label: "Ko‘rib chiqib ketdi", count: row.outcomes.LEFT, bar: "is-light" },
    { label: "Qiziqdi — mahsulot ko‘rdi, 30 s+", count: row.outcomes.INTERESTED, bar: "is-b2" },
    { label: "Bog‘lanishga urindi — tel, Telegram, Madina", count: row.outcomes.CONTACT_ATTEMPT, bar: "is-b1" },
    { label: "Zayavka qoldirdi", count: row.leads, bar: "" },
  ];
  const peak = [...days].sort((a, b) => b.clicks - a.clicks)[0];
  const created = link.createdAt;

  return <div className="bk">
    <Link className="bk-back" href={`/admin/links${periodQuery(period)}`}>← Referal linklar</Link>
    <div className="bk-head">
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <SourceIcon source={link.source} size={22}/>
        <div style={{ display: "grid", gap: 4 }}>
          <h1>{link.name} <span className={`bk-badge${link.status === "PAUSED" ? " is-grey" : ""}`}>{link.status === "ACTIVE" ? "Faol" : "To‘xtatilgan"}</span></h1>
          <p className="bk-muted">{url.replace(/^https?:\/\//, "")} → {target} · {SOURCE_LABELS[link.source]} · {formatDayMonth(created)}da yaratilgan{link.cost ? ` · xarajat ${formatUsd(row.costUsd ?? 0)}` : ""}{link.ownerAgent ? ` · mas’ul: ${[link.ownerAgent.firstName, link.ownerAgent.lastName].filter(Boolean).join(" ")}` : ""}</p>
        </div>
      </div>
      <div className="bk-actions">
        <RangeSelect value={period.key} from={dayKey(period.from)} to={dayKey(new Date(period.to.getTime() - 86_400_000))}/>
        <CopyButton text={url} label="Linkni nusxalash"/>
        {canEdit && <><Link className="bk-btn" href={`/admin/links/${link.id}/edit`}><Pencil size={15}/>Tahrirlash</Link><LinkStatusButton id={link.id} status={link.status}/></>}
      </div>
    </div>

    <div className="bk-grid-5">
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Klik (tashrifchi)</div><strong>{formatInt(row.clicks)}</strong></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">O‘rtacha saytda</div><strong>{formatDuration(avgDurationSec)}</strong></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Zayavka</div><strong style={{ color: "var(--bk-primary)" }}>{formatInt(row.leads)}<small>· {formatPercent(row.conversion)}</small></strong></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Sotuv</div><strong>{formatInt(row.sales)}<small>· {formatUsd(row.salesUsd)}</small></strong></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Bitta lid narxi</div><strong>{row.costPerLead ? formatUsd(row.costPerLead, 1) : row.costUsd ? "—" : "organik"}</strong></div>
    </div>

    <div className="bk-grid-main" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
      <section className="bk-card"><div className="bk-card-head"><h2>Tashrifchilar nima qildi</h2></div>
        {row.clicks ? <div className="bk-bars">
          {funnel.map(stage => <div className="bk-bar-row" key={stage.label}><div><span>{stage.label}</span><span><b>{formatInt(stage.count)}</b> · {formatPercent(percentOf(stage.count, row.clicks), stage.count && percentOf(stage.count, row.clicks) < 10 ? 1 : 0)}</span></div><div className="bk-track" style={{ height: 22, background: "transparent" }}><i className={`bk-bar ${stage.bar}`} style={{ width: `${Math.max(2, percentOf(stage.count, row.clicks))}%`, height: "100%", display: "block" }}/></div></div>)}
          <div className="bk-bar-row"><div><span>Sotuvga aylandi</span><span><b>{formatInt(row.sales)}</b> · zayavkalarning {formatPercent(percentOf(row.sales, row.leads), 0)}</span></div><div className="bk-track" style={{ height: 22, background: "transparent" }}><i className="bk-bar is-gold" style={{ width: `${Math.max(1, percentOf(row.sales, row.clicks))}%`, height: "100%", display: "block" }}/></div></div>
        </div> : <div className="bk-empty">Bu davrda klik yo‘q. Linkni joylashtiring — birinchi tashrifchi shu yerda ko‘rinadi.</div>}
      </section>
      <section className="bk-card"><div className="bk-card-head"><h2>Kunlik kliklar</h2><div className="bk-chips"><Link className={`bk-chip${dailyDays === 14 ? " is-active" : ""}`} href={query({ days: undefined, page: undefined })}>14 kun</Link><Link className={`bk-chip${dailyDays === 30 ? " is-active" : ""}`} href={query({ days: 30, page: undefined })}>30 kun</Link></div></div>
        <DailyBars days={days} label={`So‘nggi ${dailyDays} kundagi kunlik kliklar`}/>
        <p className="bk-note" style={{ marginTop: 10 }}>{peak?.clicks ? <>Eng ko‘p klik: <strong>{formatDayMonth(new Date(`${peak.day}T12:00:00+05:00`))}</strong> — {formatInt(peak.clicks)} klik. To‘q rangdagi ustunlar — eng faol kunlar.</> : "Bu davrda kliklar yo‘q."}</p>
      </section>
    </div>

    <section className="bk-card">
      <div className="bk-card-head"><h2>So‘nggi tashrifchilar</h2><div className="bk-chips" role="group" aria-label="Tashrifchilar filtri">
        {([["all", "Hammasi"], ["leads", "Faqat zayavka"], ["left", "Ketib qolganlar"]] as const).map(([key, label]) => <Link key={key} className={`bk-chip${filter === key ? " is-active" : ""}`} aria-current={filter === key ? "true" : undefined} href={query({ filter: key === "all" ? undefined : key, page: undefined })}>{label}</Link>)}
      </div></div>
      {visitors.rows.length ? <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>Tashrifchi</th><th className="is-left">Hudud</th><th className="is-left">Qurilma</th><th>Vaqt</th><th className="is-left">Yo‘li</th><th className="is-left">Natija</th><th>Qachon</th></tr></thead>
        <tbody>{visitors.rows.map(visit => <tr key={visit.id}>
          <td className="is-strong">{visit.label}</td><td className="is-left">{place(visit.country, visit.regionCode)}</td><td className="is-left bk-muted">{DEVICE_LABELS[visit.device]}</td><td>{formatDuration(visit.durationSec)}</td>
          <td className="is-left" style={{ whiteSpace: "normal", minWidth: 220 }}>{visit.steps.length ? visit.steps.join(" → ") : "—"}</td>
          <td className="is-left"><span className={`bk-badge ${OUTCOME_BADGE[visit.outcome]}`}>{OUTCOME_LABELS[visit.outcome]}{visit.outcome === "SALE" ? " ✓" : ""}</span>{visit.leadId && <> <Link href={`/admin/leads?lead=${visit.leadId}`}>Lid</Link></>}</td>
          <td className="bk-muted">{formatRelative(new Date(visit.firstSeenAt), now)}</td>
        </tr>)}</tbody>
      </table></div> : <div className="bk-empty">Bu filtr bo‘yicha tashrifchi yo‘q.</div>}
      {visitors.pageCount > 1 && <nav className="bk-pagination" aria-label="Sahifalar">{page > 1 && <Link className="bk-btn" href={query({ page: page - 1 })}>← Oldingi</Link>}<span>{page} / {visitors.pageCount}</span>{page < visitors.pageCount && <Link className="bk-btn" href={query({ page: page + 1 })}>Keyingi →</Link>}</nav>}
      <p className="bk-muted" style={{ marginTop: 10, fontSize: 12 }}>Zayavka qoldirmaganlar anonim: faqat taxminiy hudud (IP bo‘yicha), qurilma turi va sahifalar ketma-ketligi saqlanadi.</p>
    </section>
  </div>;
}
