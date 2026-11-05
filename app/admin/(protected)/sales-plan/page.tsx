import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { requireRole } from "@/lib/auth/require-admin";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { monthKey } from "@/lib/sales-plan/rules";
import { getPlanBoardData, getSalesPeriods, pickPeriod } from "@/lib/sales-plan/queries";
import { ManagerSummary, SalesPlanBoard, SellerPodium, ZoneLegend, ZoneSummary } from "@/components/admin/bklead/sales-plan-board";
import { MonthlyEntryButton, PeriodSelect } from "@/components/admin/bklead/sales-plan-client";
import { monthStart, nextMonth } from "@/lib/foizim/month";
import { getCommissions, getPeople } from "@/lib/foizim/queries";
import { sellerCommissions } from "@/lib/foizim/rules";
import { MONTHS_LONG } from "@/lib/dashboard/format";
import { money } from "@/lib/kassa/rules";


export const metadata: Metadata = { title: "Sotuv rejasi — Admin | BUYUK KARAVAN" };

/** "Mening foizim — sotuvchilar bo‘yicha": Super Admin only (the caller checks the role before it is rendered), SELLER_COMMISSION rows only. */
async function MyCommissionBlock({ periodId, keys, month }: { periodId: string; keys: string[]; month?: string }) {
  const picked = month && keys.includes(month) ? month : null, [rows, sellers] = await Promise.all([getCommissions(), getPeople("SELLER")]);
  const { list, total } = sellerCommissions(rows, sellers, { from: monthStart(picked ?? keys[0]), to: monthStart(nextMonth(picked ?? keys.at(-1)!)) }), widest = Math.max(1, ...list.map(item => item.amount));
  const href = (key?: string) => `/admin/sales-plan?period=${periodId}${key ? `&foizim=${key}` : ""}`, pct = (value: number | null) => value == null ? "—" : `${value}%`;
  return <section className="bk-card sp-foizim" aria-labelledby="sp-foizim-title">
    <div className="bk-card-head"><div><h2 id="sp-foizim-title">Mening foizim — sotuvchilar bo‘yicha</h2><span className="bk-muted">Faqat Super Admin ko‘radi · “Sotuvchidan foiz” yozuvlaridan</span></div>
      <div className="sp-foizim-months"><Link className={`chip${picked ? "" : " on"}`} href={href()} scroll={false}>Davr</Link>{keys.map(key => <Link key={key} className={`chip${picked === key ? " on" : ""}`} href={href(key)} scroll={false}>{MONTHS_LONG[Number(key.slice(5)) - 1].slice(0, 3)}</Link>)}</div></div>
    <div role="table" aria-label="Sotuvchilar bo‘yicha foiz" className="sp-foizim-table">
      <div role="row" className="sp-foizim-row is-head"><span role="columnheader">Sotuvchi</span><span role="columnheader">Savdo</span><span role="columnheader">O‘rtacha %</span><span role="columnheader">Olingan</span><span role="columnheader" aria-label="Ulush"/></div>
      {list.map(item => <div role="row" key={item.id} className="sp-foizim-row"><span role="cell">{item.name}</span><span role="cell">{item.base ? money(item.base, "USD") : "—"}</span><span role="cell">{pct(item.pct)}</span><b role="cell">{money(item.amount, "USD")}</b><span role="cell"><i style={{ width: `${item.amount / widest * 100}%` }}/></span></div>)}
      <div role="row" className="sp-foizim-row is-total"><span role="cell">Jami</span><span role="cell">{money(total.base, "USD")}</span><span role="cell">{pct(total.pct)}</span><b role="cell">{money(total.amount, "USD")}</b><span role="cell"/></div>
    </div>
  </section>;
}

export default async function SalesPlanPage({ searchParams }: { searchParams: Promise<{ period?: string; foizim?: string }> }) {
  const user = await requireRole("SUPER_ADMIN", "ADMIN");
  const search = await searchParams;
  const today = tashkentYearMonth();
  const periods = await getSalesPeriods();
  const period = pickPeriod(periods, search.period, today);
  const peopleHref = period ? `/admin/sales-plan/people?period=${period.id}` : "/admin/sales-plan/people";

  if (!period) return <div className="bk sp">
    <div className="bk-head"><div><h1>Sotuv rejasi</h1><p className="bk-muted">Reja har bir sotuvchining salohiyatiga qarab beriladi</p></div><Link className="bk-btn" href={peopleHref}><Users size={15}/>Sotuvchilar</Link></div>
    <div className="bk-empty"><strong>Hali davr yaratilmagan</strong><span>“Sotuvchilar” bo‘limida davr yarating va sotuvchilarga reja kiriting.</span></div>
  </div>;

  const data = await getPlanBoardData(period, periods);
  // Default month in the entry dialog: the current month if it is inside the period, else the period's last month.
  const currentKey = monthKey(today.year, today.month), keys = data.months.map(item => monthKey(item.year, item.month));
  const defaultMonth = keys.includes(currentKey) ? currentKey : keys.at(-1)!;

  return <div className="bk sp">
    <div className="bk-head">
      <div><h1>Sotuv rejasi</h1><p className="bk-muted">Reja har bir sotuvchining salohiyatiga qarab beriladi · {period.name} · {period.monthCount} oy</p></div>
      <div className="bk-actions">
        <PeriodSelect periods={periods.map(item => ({ id: item.id, name: item.name }))} value={period.id} basePath="/admin/sales-plan"/>
        <MonthlyEntryButton months={data.months} people={data.people} entered={data.entered} defaultMonth={defaultMonth}/>
        <Link className="bk-btn" href={peopleHref}><Users size={15}/>Sotuvchilar</Link>
      </div>
    </div>
    <ZoneLegend zones={data.board.zones}/>
    {data.board.groups.length ? <>
      <SellerPodium board={data.board}/>
      <ZoneSummary board={data.board}/>
      <SalesPlanBoard board={data.board}/>
      <ManagerSummary board={data.board} previousName={data.previousName}/>
    </> : <div className="bk-empty"><strong>Bu davrda reja kiritilmagan</strong><span>“Sotuvchilar” bo‘limida har bir sotuvchiga reja kiriting.</span><Link className="bk-btn is-primary" href={peopleHref}>Reja kiritish</Link></div>}
    {user.role === "SUPER_ADMIN" && <MyCommissionBlock periodId={period.id} keys={keys} month={search.foizim}/>}
    {data.board.withoutPlan.length > 0 && <p className="bk-muted">Rejasi yo‘q faol sotuvchilar: {data.board.withoutPlan.map(person => person.name).join(", ")} · <Link href={peopleHref}>reja kiritish</Link></p>}
  </div>;
}
