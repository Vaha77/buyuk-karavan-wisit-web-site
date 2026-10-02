import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require-admin";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { getSalesPeople, getSalesPeriods, pickPeriod } from "@/lib/sales-plan/queries";
import { PeriodSelect } from "@/components/admin/bklead/sales-plan-client";
import { PeriodsManager, SalesPeopleManager } from "@/components/admin/bklead/sales-plan-people";

export const metadata: Metadata = { title: "Sotuvchilar — Sotuv rejasi | BUYUK KARAVAN" };

export default async function SalesPlanPeoplePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireRole("SUPER_ADMIN", "ADMIN");
  const search = await searchParams;
  const periods = await getSalesPeriods();
  const period = pickPeriod(periods, search.period, tashkentYearMonth());
  const people = await getSalesPeople(period?.id ?? null);
  return <div className="bk sp">
    <div className="bk-head">
      <div><Link className="bk-back" href={period ? `/admin/sales-plan?period=${period.id}` : "/admin/sales-plan"}><ArrowLeft size={13} style={{ verticalAlign: "-2px" }}/> Sotuv rejasi</Link><h1>Sotuvchilar va rejalar</h1><p className="bk-muted">Sotuvchilarni qo‘shish, tahrirlash, davrlar va rejalar</p></div>
      {periods.length > 0 && period && <div className="bk-actions"><PeriodSelect periods={periods.map(item => ({ id: item.id, name: item.name }))} value={period.id} basePath="/admin/sales-plan/people"/></div>}
    </div>
    <SalesPeopleManager people={people} period={period}/>
    <PeriodsManager key={period?.id ?? "none"} periods={periods} period={period} people={people}/>
  </div>;
}
