import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { GhostButton, Sparkline } from "@/components/ui/aurora";
import { Count, DebtChart, Donut, Reveal } from "@/components/admin/kassa/dokon-charts";
import { DebtBars, DokonTabs, EmployeeSelect, PeriodChips } from "@/components/admin/kassa/dokon-tabs";
import { EmployeeSheet } from "@/components/admin/kassa/hodim-forms";
import { requireRole } from "@/lib/auth/require-admin";
import { employeeRange, staffStats } from "@/lib/dokon/stats";
import { getDebtEntries, getEmployees } from "@/lib/employees/queries";
import { debtTone, shopDebts } from "@/lib/employees/rules";
import { money } from "@/lib/kassa/rules";
import "@/components/admin/kassa/kassa.css";

export const metadata: Metadata = { title: "Hodimlar — Admin | BUYUK KARAVAN" };
const PERIOD_NAMES: Record<string, string> = { oy: "Oy", yil: "Yil", hammasi: "Hammasi", davr: "Davr" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ archive?: string; new?: string; p?: string; from?: string; to?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const search = await searchParams, [all, entries] = await Promise.all([getEmployees(), getDebtEntries()]), showArchive = search.archive === "1";
  const archived = all.filter(item => item.archived), { total, holders, list } = shopDebts(all);
  const p = ["oy", "yil", "davr"].includes(search.p ?? "") ? search.p! : "hammasi", query = search.p ? `&p=${search.p}` : "";
  const { sums, chart, today, parts, cards } = staffStats(all, entries, employeeRange(search));
  return <div className="kassa">
    <DokonTabs on="hodimlar"/>
    <header className="kassa-top">
      <div><h1>Hodimlar</h1></div>
      <PeriodChips path="/admin/kassa/hodimlar" keys={[["oy", "Oy"], ["yil", "Yil"], ["hammasi", "Hammasi"]]} on={p} search={search}/>
      <div className="kassa-actions">
        <GhostButton href={showArchive ? `/admin/kassa/hodimlar?p=${p}` : `/admin/kassa/hodimlar?archive=1${query}`}>{showArchive ? "← Faol hodimlar" : `Arxiv (${archived.length})`}</GhostButton>
        <GhostButton href="/admin/kassa/hodimlar/export" prefetch={false} aria-label="Excel"><Download size={16}/><span>Excel</span></GhostButton>
        <GhostButton href="/admin/kassa/hodimlar?new=1" scroll={false}>+ Yangi hodim</GhostButton>
      </div>
    </header>
    <div className="dokon-cards">
      <div className="glass kassa-bal"><span>Umumiy qarz</span><Count value={total} currency="USD" className={debtTone(total)}/><small>{holders} hodimda</small></div>
      <div className="glass kassa-bal dokon-desk"><span>Jami olgan</span><Count value={sums.taken} currency="USD" className="is-debt"/><small>{sums.takenCount} marta · + {money(sums.opening, "USD")} boshlang‘ich</small></div>
      <div className="glass kassa-bal dokon-desk"><span>Jami bergan</span><Count value={sums.given} currency="USD" className="is-over"/><small>{sums.givenCount} marta</small></div>
      <div className="glass kassa-bal"><span>Bugun to‘landi</span><Count value={today.sum} currency="USD" className="is-over"/><small>{today.people} hodim · {today.count} ta</small></div>
    </div>
    {entries.length > 0 && <DebtChart key={p} title="Barcha hodimlar: olgan va bergan" chart={chart} debt={total} label={PERIOD_NAMES[p]} taken={sums.taken} given={sums.given}/>}
    <div className="dokon-two staff-two">
      <section className="glass dokon-box"><h2>Kimda qancha qarz <small>bosilsa — hodim sahifasi</small></h2><DebtBars list={list}/></section>
      <section className="glass dokon-box"><h2>Qarz ulushi</h2>{parts.length ? <Donut parts={parts}/> : <p className="kassa-empty">Qarz yo‘q.</p>}</section>
    </div>
    <EmployeeSelect employees={showArchive ? archived : all.filter(item => !item.archived)} open={showArchive}/>
    <div className="staff-grid">
      {cards.map(item => <Reveal key={item.id} className="staff-card"><Link className="glass" href={`/admin/kassa/hodimlar/${item.id}`}>
        <div className="staff-head"><i className="dokon-av">{item.name.charAt(0).toUpperCase()}</i><div><b>{item.name}</b><small>{item.position ?? "—"}</small></div><strong className={debtTone(item.debt)}>{money(item.debt, "USD")}</strong></div>
        <Sparkline values={item.trend} height={44} stroke={item.rising ? "#fb7185" : "#34d399"}/>
        <em className="staff-prog"><u style={{ "--w": `${item.pct}%` } as React.CSSProperties}/></em>
        <small>{item.pct}% qaytargan</small>
      </Link></Reveal>)}
    </div>
    {search.new && <EmployeeSheet employee={null} closeHref="/admin/kassa/hodimlar"/>}
  </div>;
}
