import type { Metadata } from "next";
import Link from "next/link";
import { DokonTabs, PeriodChips } from "@/components/admin/kassa/dokon-tabs";
import { Count, KassaPanels, Reveal } from "@/components/admin/kassa/dokon-charts";
import { requireRole } from "@/lib/auth/require-admin";
import { dayKey, resolvePeriod } from "@/lib/dashboard/period";
import { kassaChart, pctChange, PERIOD_KEYS, spendByCategory } from "@/lib/dokon/stats";
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
  const usd = totals(days, "USD"), uzs = totals(days, "UZS"), before = totals(previous.days, "USD"), { total, list, holders } = shopDebts(employees);
  const names = Object.fromEntries(categories.map(category => [category.id, category.name]));
  const chart = (currency: "USD" | "UZS") => ({ rows: kassaChart(days, currency), parts: spendByCategory(rows, currency, names) });
  const widest = Math.max(1, ...list.map(item => Math.abs(item.debt)));
  return <div className="kassa">
    <DokonTabs on="dashboard"/>
    <header className="kassa-top"><div><h1>Do‘kon</h1></div><PeriodChips path="/admin/dokon" keys={[["bugun", "Bugun"], ["hafta", "Hafta"], ["oy", "Oy"]]} on={p} search={search}/></header>
    {latest.length === 0 && <p className="kassa-empty">Hali yozuv yo‘q. <Link href="/admin/kassa">Kassaga o‘tish</Link></p>}
    <div className="dokon-cards">
      <div className="glass kassa-bal"><span>Kassa qoldig‘i</span><Count value={usd.end} currency="USD" className={usd.end < 0 ? "is-neg" : undefined}/><small>{money(uzs.end, "UZS")}</small></div>
      <div className="glass kassa-bal"><span>Davr kirimi</span><Count value={usd.in} currency="USD" sign className="amt-in"/>{change(pctChange(usd.in, before.in))}</div>
      <div className="glass kassa-bal"><span>Davr chiqimi</span><Count value={-usd.out} currency="USD" className="amt-out"/>{change(pctChange(usd.out, before.out))}</div>
      <div className="glass kassa-bal"><span>Hodimlardagi umumiy qarz</span><Count value={total} currency="USD" className={debtTone(total)}/><small>{holders} hodimda</small></div>
    </div>
    <Link href="/admin/kassa" className="glass dokon-bot"><span>Botdan tasdiqlash kutmoqda</span><b>{drafts.length} ta ›</b></Link>
    <KassaPanels charts={{ USD: chart("USD"), UZS: chart("UZS") }}
      debts={<section className="glass dokon-box"><h2>Kimda qancha qarz <small>$</small></h2>
        {list.length ? <Reveal className="dokon-debts">{list.map(item => <Link key={item.id} href={`/admin/kassa/hodimlar/${item.id}`}><i className="dokon-av">{item.name.charAt(0).toUpperCase()}</i><span>{item.name}</span><em><u className={item.debt < 0 ? "is-minus" : undefined} style={{ "--w": `${Math.abs(item.debt) / widest * 100}%` } as React.CSSProperties}/></em><b className={debtTone(item.debt)}>{money(item.debt, "USD")}</b>›</Link>)}</Reveal> : <p className="kassa-empty">Hodim yo‘q.</p>}
      </section>}
      latest={<><h2 className="dokon-sub">Oxirgi yozuvlar</h2>{latest.map(entry => { const isIn = entry.type === "IN", day = dayKey(entry.occurredAt); return <Link key={entry.id} className="dokon-line" href={`/admin/kassa?range=custom&from=${day}&to=${day}&edit=${entry.id}`}><span>{entry.note}{entry.employee && " 👤"}</span><b className={isIn ? "amt-in" : "amt-out"}>{money(isIn ? entry.amount : -entry.amount, entry.currency, true)}</b></Link>; })}</>}/>
  </div>;
}
