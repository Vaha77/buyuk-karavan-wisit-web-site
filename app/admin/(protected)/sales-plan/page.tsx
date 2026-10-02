import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { requireRole } from "@/lib/auth/require-admin";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { monthKey } from "@/lib/sales-plan/rules";
import { getPlanBoardData, getSalesPeriods, pickPeriod } from "@/lib/sales-plan/queries";
import { ManagerSummary, SalesPlanBoard, ZoneLegend, ZoneSummary } from "@/components/admin/bklead/sales-plan-board";
import { MonthlyEntryButton, PeriodSelect } from "@/components/admin/bklead/sales-plan-client";

export const metadata: Metadata = { title: "Sotuv rejasi — Admin | BUYUK KARAVAN" };

export default async function SalesPlanPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireRole("SUPER_ADMIN", "ADMIN");
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
      <ZoneSummary board={data.board}/>
      <SalesPlanBoard board={data.board}/>
      <ManagerSummary board={data.board} previousName={data.previousName}/>
    </> : <div className="bk-empty"><strong>Bu davrda reja kiritilmagan</strong><span>“Sotuvchilar” bo‘limida har bir sotuvchiga reja kiriting.</span><Link className="bk-btn is-primary" href={peopleHref}>Reja kiritish</Link></div>}
    {data.board.withoutPlan.length > 0 && <p className="bk-muted">Rejasi yo‘q faol sotuvchilar: {data.board.withoutPlan.map(person => person.name).join(", ")} · <Link href={peopleHref}>reja kiritish</Link></p>}
  </div>;
}
