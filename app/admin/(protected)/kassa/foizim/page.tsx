import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { GhostButton, GlassCard } from "@/components/ui/aurora";
import { DeleteEntryButton, KassaUndoToast } from "@/components/admin/kassa/delete-entry";
import { CommissionChart, Count, Donut, Reveal } from "@/components/admin/kassa/dokon-charts";
import { DokonTabs, PeriodChips } from "@/components/admin/kassa/dokon-tabs";
import { CommissionSheet } from "@/components/admin/kassa/foizim-form";
import { requireRole } from "@/lib/auth/require-admin";
import { dayKey } from "@/lib/dashboard/period";
import { getCommissions } from "@/lib/foizim/queries";
import { byFrom, commissionRange, fromSuggestions, inRange, percentText, sumOf, yearStats } from "@/lib/foizim/rules";
import { money } from "@/lib/kassa/rules";
import { deleteCommissionAction, restoreCommissionAction } from "./actions";
import "@/components/admin/kassa/kassa.css";

export const metadata: Metadata = { title: "Mening foizim — Admin | BUYUK KARAVAN" };
const NAMES: Record<string, string> = { bugun: "Bugun", oy: "Bu oy", yil: "Bu yil", davr: "Davr" };
const dayText = (date: Date) => dayKey(date).slice(5).split("-").reverse().join(".");

export default async function CommissionPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string; new?: string; entry?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const search = await searchParams, all = await getCommissions();
  const p = ["bugun", "yil", "davr"].includes(search.p ?? "") ? search.p! : "oy", range = commissionRange(search);
  const rows = all.filter(row => inRange(row, range)), year = all.filter(row => inRange(row, commissionRange({ p: "yil" })));
  const from = byFrom(rows), widest = Math.max(1, ...from.map(item => item.sum)), stats = yearStats(all), topWidest = Math.max(1, ...stats.top.map(item => item.sum));
  const query = new URLSearchParams(Object.entries({ p, from: search.from, to: search.to }).filter((pair): pair is [string, string] => Boolean(pair[1]))).toString();
  const here = `/admin/kassa/foizim?${query}`, editing = search.entry ? all.find(row => row.id === search.entry) : undefined;
  const notes = [...new Set(all.map(row => row.note).filter((note): note is string => Boolean(note)))].slice(0, 30);
  const sheet = { names: fromSuggestions(all), notes, closeHref: here };
  return <div className="kassa">
    <DokonTabs on="foizim"/>
    <header className="kassa-top">
      <div><h1>Mening foizim</h1><p>Kassa qoldig‘iga ta’sir qilmaydi · faqat $</p></div>
      <PeriodChips path="/admin/kassa/foizim" keys={[["bugun", "Bugun"], ["oy", "Oy"], ["yil", "Yil"]]} on={p} search={search}/>
      <div className="kassa-actions">
        <GhostButton href={`/admin/kassa/foizim/export?${query}`} prefetch={false} aria-label="Excel"><Download size={16}/><span>Excel</span></GhostButton>
        <GhostButton href={`${here}&new=1`} scroll={false}>＋ Yangi yozuv</GhostButton>
      </div>
    </header>
    <div className="dokon-cards foizim-cards">
      <div className="glass kassa-bal"><span>{NAMES[p]}</span><Count value={sumOf(rows)} currency="USD" className="is-over"/><small>{rows.length} ta yozuv</small></div>
      <div className="glass kassa-bal"><span>Bu yil</span><Count value={sumOf(year)} currency="USD" className="is-over"/><small>{year.length} ta yozuv</small></div>
    </div>
    <section className="glass dokon-box"><h2>Kimdan</h2>{from.length
      ? <Reveal className="dokon-debts foizim-bars">{from.map(item => <div key={item.name}><span title={item.name}>{item.name}</span><em><u style={{ "--w": `${item.sum / widest * 100}%` } as React.CSSProperties}/></em><b className="is-over">{money(item.sum, "USD")}</b></div>)}</Reveal>
      : <p className="kassa-empty">Bu davrda yozuv yo‘q.</p>}</section>
    {stats.total > 0 && <>
      <section className="glass dokon-box"><h2>Mening foizim · oylar bo‘yicha ({stats.year})</h2>
        <div className="debt-sums foizim-sum">
          <div><span>Bu oy</span><Count value={stats.month} currency="USD"/></div>
          <div><span>Bu yil</span><Count value={stats.total} currency="USD"/></div>
          <div><span>O‘rtacha oy</span><Count value={stats.average} currency="USD"/></div>
          <div><span>Eng yaxshi oy</span><b>{stats.best ? `${stats.best.full.split(" ")[0]} · ${money(stats.best.sum, "USD")}` : "—"}</b></div>
        </div>
        <CommissionChart months={stats.months}/>
      </section>
      <div className="dokon-two">
        <section className="glass dokon-box"><h2>Kimdan ({stats.year})</h2><Donut parts={stats.parts}/></section>
        <section className="glass dokon-box"><h2>Top kimdan — summa</h2><Reveal className="dokon-debts foizim-bars">{stats.top.map(item => <div key={item.name}><span title={item.name}>{item.name}</span><em><u style={{ "--w": `${item.sum / topWidest * 100}%` } as React.CSSProperties}/></em><b className="is-over">{money(item.sum, "USD")}</b></div>)}</Reveal></section>
      </div>
    </>}
    <GlassCard className="kassa-list">
      {rows.length === 0 ? <p className="kassa-empty">Hali yozuv yo‘q.</p> : <div role="table" aria-label="Yozuvlar">
        <div className="hodim-row foizim-row kassa-th" role="row"><span role="columnheader">Sana</span><span role="columnheader">Kimdan · izoh</span><span role="columnheader">Summa</span></div>
        {rows.map(row => <div key={row.id} className="kassa-rowwrap"><Link href={`${here}&entry=${row.id}`} scroll={false} className="hodim-row foizim-row" role="row">
          <span className="kassa-date" role="cell">{dayText(row.occurredAt)}</span>
          <span className="foizim-who" role="cell"><b>{row.fromName}</b><small>{[row.note, percentText(row)].filter(Boolean).join(" · ")}</small></span>
          <span className="amt-in" role="cell">{money(row.amount, "USD", true)}</span>
        </Link><DeleteEntryButton id={row.id} label={`${money(row.amount, "USD")} · ${row.fromName}`} action={deleteCommissionAction}/></div>)}
      </div>}
    </GlassCard>
    {search.new && <CommissionSheet {...sheet}/>}
    {editing && <CommissionSheet key={editing.id} {...sheet} entry={{ ...editing, occurredAt: editing.occurredAt.toISOString() }}/>}
    <KassaUndoToast restore={restoreCommissionAction}/>
  </div>;
}
