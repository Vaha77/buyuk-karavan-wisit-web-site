import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, DollarSign, MapPinned, TrendingUp, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { getCustomerRegionRows, getCustomerYear, getRegularCustomers } from "@/lib/customers/queries";
import { buildRegionStats } from "@/lib/customers/region-stats";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { formatInt, formatPercent, formatUsd, MONTHS_LONG } from "@/lib/dashboard/format";
import { CustomerRanking } from "@/components/admin/bklead/customer-ranking";
import { CustomerRegions } from "@/components/admin/bklead/customer-regions";
import { CustomersManager } from "@/components/admin/bklead/customer-forms";

export const metadata: Metadata = { title: "Doimiy mijozlar — Admin | BUYUK KARAVAN" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ new?: string; year?: string }> }) {
  const user = await requireAdmin();
  const search = await searchParams;
  const today = tashkentYearMonth();
  const year = /^20\d{2}$/.test(search.year ?? "") && Number(search.year) <= today.year ? Number(search.year) : today.year;
  const [customers, data, regionRows, rate] = await Promise.all([getRegularCustomers(), getCustomerYear(year), getCustomerRegionRows(year), getUsdUzsRate()]);
  const stats = buildRegionStats(regionRows, year, today);
  const { kpis } = stats;
  const canEdit = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const yearHref = (value: number) => value === today.year ? "/admin/customers" : `/admin/customers?year=${value}`;
  const periodLabel = stats.periodEnd === 12 ? `${year - 1}-yil bilan` : `${year - 1}-yil yanvar–${MONTHS_LONG[stats.periodEnd - 1].toLowerCase()} bilan`;
  const growth = kpis.growth;

  return <div className="bk">
    <div className="bk-head">
      <div><h1>Doimiy mijozlar — {year}-yil</h1><p className="bk-muted">Viloyatlar faolligi, oylik savdolar, yillik reyting va sovrinlar</p></div>
      <nav className="bk-chips" aria-label="Yil">{data.years.slice(0, 5).map(value => <Link key={value} className={`bk-chip${value === year ? " is-active" : ""}`} aria-current={value === year ? "page" : undefined} href={yearHref(value)}>{value}-yil</Link>)}</nav>
    </div>

    <div className="bk-grid-5">
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Faol doimiy mijozlar<span className="bk-kpi-icon"><Users size={16}/></span></div><strong>{formatInt(kpis.activeCustomers)}</strong><span className="bk-kpi-foot">reytingda qatnashadi</span></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Yil boshidan jami savdo<span className="bk-kpi-icon"><DollarSign size={16}/></span></div><strong>{formatUsd(kpis.total)}</strong><span className="bk-kpi-foot">CBU kursi bilan USD da</span></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">O‘rtacha savdo / mijoz<span className="bk-kpi-icon"><TrendingUp size={16}/></span></div><strong>{formatUsd(kpis.average)}</strong><span className="bk-kpi-foot">jami ÷ faol mijozlar</span></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">Mijozi bor viloyatlar<span className="bk-kpi-icon is-orange"><MapPinned size={16}/></span></div><strong>{kpis.regionsWithCustomers}<small>/ {kpis.regionCount}</small></strong>
        <span className="bk-kpi-foot">{kpis.regionCount - kpis.regionsWithCustomers > 0 ? <><span className="bk-delta is-alert">{kpis.regionCount - kpis.regionsWithCustomers} ta</span>viloyatda mijoz yo‘q</> : "Barcha viloyatlar qamrab olingan"}</span></div>
      <div className="bk-card bk-kpi"><div className="bk-kpi-top">O‘tgan yilga nisbatan<span className="bk-kpi-icon"><TrendingUp size={16}/></span></div>
        <strong>{!growth || !growth.relative ? "—" : `${growth.direction === "down" ? "−" : growth.direction === "up" ? "+" : ""}${formatPercent(growth.value, 0)}`}</strong>
        <span className="bk-kpi-foot">{growth?.relative && growth.direction !== "flat" && <span className={`bk-delta${growth.direction === "down" ? " is-down" : ""}`}>{growth.direction === "up" ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}{formatUsd(Math.abs(kpis.total - kpis.prevTotal))}</span>}{growth?.relative ? periodLabel : `${periodLabel} solishtirish uchun ma’lumot yo‘q`}</span></div>
    </div>

    <CustomerRegions stats={stats}/>

    <CustomerRanking data={data} now={today} canEdit={canEdit} uzsPerUsd={rate ? Number(rate.rate) : null} yearHref={yearHref}/>
    <CustomersManager canEdit={canEdit} startNew={search.new === "1"} customers={customers.map(customer => ({ id: customer.id, name: customer.name, country: customer.country, regionCode: customer.regionCode, phone: customer.phone, note: customer.note, isActive: customer.isActive, salesCount: customer._count.sales }))}/>
  </div>;
}
