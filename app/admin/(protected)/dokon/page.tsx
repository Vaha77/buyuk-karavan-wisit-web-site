import type { Metadata } from "next";
import Link from "next/link";
import { DebtBars, DokonTabs, PeriodChips } from "@/components/admin/kassa/dokon-tabs";
import { Count, KassaPanels } from "@/components/admin/kassa/dokon-charts";
import { requireRole } from "@/lib/auth/require-admin";
import { dayKey, resolvePeriod } from "@/lib/dashboard/period";
import { kassaChart, pctChange, PERIOD_KEYS, spendByCategory, statsDays } from "@/lib/dokon/stats";
import { getEmployees } from "@/lib/employees/queries";
import { debtTone, shopDebts } from "@/lib/employees/rules";
import { getKassaCategories, getKassaEntries, getKassaLedger, getPendingDrafts } from "@/lib/kassa/queries";
import { money, totals } from "@/lib/kassa/rules";
import "@/components/admin/kassa/kassa.css";

export const metadata: Metadata = { title: "Do‘kon — Admin | BUYUK KARAVAN" };
type Search = { p?: string; from?: string; to?: string };

const change = (value: number | null) => value === null ? <small>—</small> : <small>{value >= 0 ? "▲" : "▼"} {Math.abs(value)}% o‘tgan davrga</small>;

/** Do‘kon xulosasi: every number comes from the kassa and hodim functions those pages use. */
export default async function ShopDashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("SUPER_ADMIN");
  const search = await searchParams, p = PERIOD_KEYS[search.p ?? ""] ? search.p! : "oy";
  const period = resolvePeriod({ range: PERIOD_KEYS[p], from: search.from, to: search.to });
  const [{ days, rows }, previous, employees, drafts, latest, categories] = await Promise.all([getKassaLedger(period.from, period.to), getKassaLedger(period.prevFrom, period.prevTo), getEmployees(), getPendingDrafts(), getKassaEntries(new Date(0), period.to, { limit: 5 }), getKassaCategories()]);
  // Balances count every entry; kirim / chiqim, the chart and the donut leave out "Statistikaga kirmasin".
  const excluded = new Set(categories.filter(category => category.excludeFromStats).map(category => category.id)), counted = rows.filter(row => !excluded.has(row.categoryId));
  const flow = statsDays(rows, excluded, days[0].day, days[days.length - 1].day), before = statsDays(previous.rows, excluded, previous.days[0].day, previous.days[previous.days.length - 1].day);
  const usd = totals(days, "USD"), uzs = totals(days, "UZS"), inOut = totals(flow, "USD"), inOutUzs = totals(flow, "UZS"), past = totals(before, "USD"), { total, list, holders } = shopDebts(employees);
  const names = Object.fromEntries(categories.map(category => [category.id, category.name]));
  const chart = (currency: "USD" | "UZS") => ({ rows: kassaChart(flow, currency), parts: spendByCategory(counted, currency, names) });
  return <div className="kassa">
    <DokonTabs on="dashboard"/>
    <header className="kassa-top"><div><h1>Do‘kon</h1></div><PeriodChips path="/admin/dokon" keys={[["bugun", "Bugun"], ["hafta", "Hafta"], ["oy", "Oy"]]} on={p} search={search}/></header>
    {latest.length === 0 && <p className="kassa-empty">Hali yozuv yo‘q. <Link href="/admin/kassa">Kassaga o‘tish</Link></p>}
    <div className="dokon-cards">
      <div className="glass kassa-bal"><span>Kassa qoldig‘i</span><Count value={usd.end} currency="USD" className={usd.end < 0 ? "is-neg" : undefined}/><small>{money(uzs.end, "UZS")}</small></div>
      <div className="glass kassa-bal"><span>Davr kirimi</span><Count value={inOut.in} currency="USD" sign className="amt-in"/><small>{money(inOutUzs.in, "UZS", true)}</small>{change(pctChange(inOut.in, past.in))}</div>
      <div className="glass kassa-bal"><span>Davr chiqimi</span><Count value={-inOut.out} currency="USD" className="amt-out"/><small>{money(-inOutUzs.out, "UZS")}</small>{change(pctChange(inOut.out, past.out))}</div>
      <div className="glass kassa-bal"><span>Hodimlardagi umumiy qarz</span><Count value={total} currency="USD" className={debtTone(total)}/><small>{holders} hodimda</small></div>
    </div>
    <Link href="/admin/kassa" className="glass dokon-bot"><span>Botdan tasdiqlash kutmoqda</span><b>{drafts.length} ta ›</b></Link>
    <KassaPanels charts={{ USD: chart("USD"), UZS: chart("UZS") }}
      debts={<section className="glass dokon-box"><h2>Kimda qancha qarz <small>$</small></h2>
        <DebtBars list={list}/>
      </section>}
      latest={<><h2 className="dokon-sub">Oxirgi yozuvlar</h2>{latest.map(entry => { const isIn = entry.type === "IN", day = dayKey(entry.occurredAt); return <Link key={entry.id} className="dokon-line" href={`/admin/kassa?range=custom&from=${day}&to=${day}&edit=${entry.id}`}><span>{entry.note}{entry.employee && " 👤"}</span><b className={isIn ? "amt-in" : "amt-out"}>{money(isIn ? entry.amount : -entry.amount, entry.currency, true)}</b></Link>; })}</>}/>
  </div>;
}
