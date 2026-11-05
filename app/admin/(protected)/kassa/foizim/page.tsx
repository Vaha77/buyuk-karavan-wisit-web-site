import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { GhostButton, GlassCard, Pill } from "@/components/ui/aurora";
import { DeleteEntryButton, KassaUndoToast } from "@/components/admin/kassa/delete-entry";
import { CommissionChart, Count, Donut, Reveal } from "@/components/admin/kassa/dokon-charts";
import { DokonTabs, PeriodChips } from "@/components/admin/kassa/dokon-tabs";
import { CommissionSheet, ShortageSheet } from "@/components/admin/kassa/foizim-form";
import { Sheet } from "@/components/admin/kassa/hodim-forms";
import { requireRole } from "@/lib/auth/require-admin";
import { dayKey } from "@/lib/dashboard/period";
import { monthCloses, monthName, nextMonth, shortageHistory } from "@/lib/foizim/month";
import { getCommissions, getPeople, getShortages } from "@/lib/foizim/queries";
import { byFrom, commissionRange, fromSuggestions, inRange, lastBy, percentText, wholeMonth, yearStats } from "@/lib/foizim/rules";
import { money } from "@/lib/kassa/rules";
import { deleteCommissionAction, deleteShortageAction, restoreFoizimAction } from "./actions";
import "@/components/admin/kassa/kassa.css";

export const metadata: Metadata = { title: "Mening foizim — Admin | BUYUK KARAVAN" };
const NAMES: Record<string, string> = { bugun: "Bugun", oy: "Bu oy", otgan: "O‘tgan oy", yil: "Bu yil", davr: "Davr" };
const dayText = (date: Date) => dayKey(date).slice(5).split("-").reverse().join(".");
const fullDay = (date: Date) => dayKey(date).split("-").reverse().join(".");

export default async function CommissionPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string; new?: string; entry?: string; shortage?: string; history?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const search = await searchParams, [all, shortages, sellers, keepers] = await Promise.all([getCommissions(), getShortages(), getPeople("SELLER"), getPeople("STOREKEEPER")]);
  const p = ["bugun", "otgan", "yil", "davr"].includes(search.p ?? "") ? search.p! : "oy", range = commissionRange(search);
  const income = all.filter(row => row.direction === "IN"), rows = all.filter(row => inRange(row, range));
  const from = byFrom(rows.filter(row => row.direction === "IN")), widest = Math.max(1, ...from.map(item => item.sum)), stats = yearStats(income), topWidest = Math.max(1, ...stats.top.map(item => item.sum));
  const { months, shortage, deductedTotal, open } = monthCloses(all, shortages), monthKey = wholeMonth(range), closedMonth = months.find(month => month.closed && month.key === monthKey);
  const preview = open.result > 0 ? Math.min(open.result, shortage) : 0, covered = deductedTotal + shortage ? Math.round(deductedTotal / (deductedTotal + shortage) * 100) : 0;
  const query = new URLSearchParams(Object.entries({ p, from: search.from, to: search.to }).filter((pair): pair is [string, string] => Boolean(pair[1]))).toString();
  const here = `/admin/kassa/foizim?${query}`, editing = search.entry ? all.find(row => row.id === search.entry) : undefined;
  const shortageRow = shortages.find(row => row.id === search.shortage), history = shortageHistory(shortages, months);
  const notes = [...new Set(all.map(row => row.note).filter((note): note is string => Boolean(note)))].slice(0, 30);
  const percents = lastBy(all, "sellerId", row => row.kind === "SELLER_COMMISSION" ? row.percent : null), pay = lastBy(all, "storekeeperId", row => row.kind === "SALARY" ? row.amount : null);
  const sheet = {
    names: fromSuggestions(all.filter(row => row.kind === "OTHER_IN")), categories: fromSuggestions(all.filter(row => row.kind === "OTHER_OUT")), notes, closeHref: here,
    sellers: sellers.map(item => ({ ...item, percent: percents[item.id] })), keepers: keepers.map(item => ({ ...item, salary: pay[item.id] })),
    salaries: all.filter(row => row.kind === "SALARY" && row.storekeeperId && row.salaryMonth).map(row => ({ id: row.id, storekeeperId: row.storekeeperId!, salaryMonth: row.salaryMonth! })),
  };
  return <div className="kassa">
    <DokonTabs on="foizim"/>
    <header className="kassa-top">
      <div><h1>Mening foizim</h1><p>Kassa qoldig‘iga ta’sir qilmaydi · faqat $</p></div>
      <PeriodChips path="/admin/kassa/foizim" keys={[["bugun", "Bugun"], ["oy", "Oy"], ["otgan", "O‘tgan oy"], ["yil", "Yil"]]} on={p} search={search}/>
      <div className="kassa-actions">
        <GhostButton href="/admin/kassa/foizim/export" prefetch={false} aria-label="Excel"><Download size={16}/><span>Excel</span></GhostButton>
        <GhostButton href={`${here}&new=1`} scroll={false}>＋ Yangi yozuv</GhostButton>
      </div>
    </header>
    <div className="dokon-cards foizim-cards">
      <div className="glass kassa-bal"><span>Shu oy qoldig‘i · {open.name}</span><Count value={open.result} currency="USD" className={open.result < 0 ? "is-debt" : "is-over"}/>
        <dl><div><dt>Foiz kirimi</dt><dd className="amt-in">{money(open.in, "USD", true)}</dd></div><div><dt>Oyliklar</dt><dd className="amt-out">{money(-open.salary, "USD")}</dd></div><div><dt>Boshqa</dt><dd className="amt-out">{money(-open.other, "USD")}</dd></div></dl>
        {open.start !== 0 && <small>Oy boshi: {money(open.start, "USD")}</small>}</div>
      <div className="glass kassa-bal"><span>Magazin kamomati</span><Count value={shortage} currency="USD" className={shortage ? "is-debt" : "is-zero"}/>
        <small>{preview ? `Oy oxirida ${money(preview, "USD")} ayriladi → ${money(shortage - preview, "USD")}` : shortages.length ? "Bu oy hozircha ayriladigan qoldiq yo‘q" : "Kamomat hali kiritilmagan"}</small>
        <Reveal className="foizim-prog"><em className="staff-prog" title={`${covered}% yopildi`}><u style={{ "--w": `${covered}%` } as React.CSSProperties}/></em></Reveal>
        <div className="foizim-btns"><Link className="chip" href={`${here}&shortage=new`} scroll={false}>＋ Kamomat qo‘shish</Link><Link className="chip" href={`${here}&history=1`} scroll={false}>Tarix</Link></div></div>
    </div>
    {closedMonth && <section className="glass dokon-box foizim-close"><h2>{closedMonth.name.split(" ")[0]} yakuni <small>{fullDay(new Date(`${nextMonth(closedMonth.key)}-01T00:00:00+05:00`))} · avtomatik</small></h2>
      {closedMonth.start !== 0 && <div className="dokon-line"><span>Oy boshi</span><b>{money(closedMonth.start, "USD")}</b></div>}
      <div className="dokon-line"><span>Foiz kirimi</span><b className="amt-in">{money(closedMonth.in, "USD", true)}</b></div>
      <div className="dokon-line"><span>👷 Skladchilar oyligi ({closedMonth.salaryCount})</span><b className="amt-out">{money(-closedMonth.salary, "USD")}</b></div>
      <div className="dokon-line"><span>Boshqa chiqim</span><b className="amt-out">{money(-closedMonth.other, "USD")}</b></div>
      <div className="dokon-line"><span><b>Qoldiq</b></span><b>{money(closedMonth.result, "USD")}</b></div>
      <div className="dokon-line"><span>↓ Kamomatdan ayrildi · {money(closedMonth.shortageBefore, "USD")} → {money(closedMonth.shortageAfter, "USD")}</span><b className="amt-out">{money(-closedMonth.deducted, "USD")}</b></div>
      <div className="dokon-line"><span>↓ {monthName(nextMonth(closedMonth.key)).split(" ")[0]} qoldig‘i{closedMonth.carry === 0 && " · yangi oy noldan boshlanadi"}</span><b className={closedMonth.carry < 0 ? "is-debt" : undefined}>{money(closedMonth.carry, "USD")}</b></div>
    </section>}
    <section className="glass dokon-box"><h2>Kimdan <small>{NAMES[p]} · faqat kirim</small></h2>{from.length
      ? <Reveal className="dokon-debts foizim-bars">{from.map(item => <div key={item.name}><span title={item.name}>{item.name}</span><em><u style={{ "--w": `${item.sum / widest * 100}%` } as React.CSSProperties}/></em><b className="is-over">{money(item.sum, "USD")}</b></div>)}</Reveal>
      : <p className="kassa-empty">Bu davrda kirim yo‘q.</p>}</section>
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
      {rows.length === 0 ? <p className="kassa-empty">Bu davrda yozuv yo‘q.</p> : <div role="table" aria-label="Yozuvlar">
        <div className="hodim-row foizim-row kassa-th" role="row"><span role="columnheader">Sana</span><span role="columnheader">Kimdan / nimaga · izoh</span><span role="columnheader">Summa</span></div>
        {rows.map(row => {
          const isIn = row.direction === "IN", title = row.kind === "SALARY" ? `👷 Skladchi oyligi · ${row.fromName}` : row.fromName;
          const sub = [row.kind === "SALARY" && row.salaryMonth && `${monthName(row.salaryMonth).split(" ")[0]} oyligi`, row.kind === "OTHER_OUT" && "Chiqim", row.note, percentText(row)].filter(Boolean).join(" · ");
          return <div key={row.id} className="kassa-rowwrap"><Link href={`${here}&entry=${row.id}`} scroll={false} className="hodim-row foizim-row" role="row">
            <span className="kassa-date" role="cell">{dayText(row.occurredAt)}</span>
            <span className="foizim-who" role="cell"><b><i className={isIn ? "amt-in" : "amt-out"}>{isIn ? "↓" : "↑"}</i> {title}{row.kind === "SELLER_COMMISSION" && <Pill tone="info">👤 sotuvchi</Pill>}</b><small>{sub}</small></span>
            <span className={isIn ? "amt-in" : "amt-out"} role="cell">{money(isIn ? row.amount : -row.amount, "USD", true)}</span>
          </Link><DeleteEntryButton id={row.id} label={`${money(row.amount, "USD")} · ${row.fromName}`} action={deleteCommissionAction}/></div>;
        })}
      </div>}
    </GlassCard>
    {search.new && <CommissionSheet {...sheet}/>}
    {editing && <CommissionSheet key={editing.id} {...sheet} entry={{ ...editing, occurredAt: editing.occurredAt.toISOString() }}/>}
    {(search.shortage === "new" || search.shortage === "adjust") && <ShortageSheet current={shortage} opening={!shortages.length} adjust={search.shortage === "adjust"} closeHref={here}/>}
    {shortageRow && <ShortageSheet key={shortageRow.id} entry={{ ...shortageRow, occurredAt: shortageRow.occurredAt.toISOString() }} current={shortage} opening={false} closeHref={here}/>}
    {search.history && <Sheet title="Kamomat tarixi" closeHref={here}>
      <p className="foizim-calc">Hozirgi kamomat: <b>{money(shortage, "USD")}</b> · <Link href={`${here}&shortage=adjust`} scroll={false}>± Tuzatish</Link></p>
      {history.length ? history.map(row => row.auto
        ? <div key={row.id} className="dokon-line"><span>{row.note} <small>avtomatik · {fullDay(row.occurredAt)}</small></span><b className="amt-in">{money(row.amount, "USD")}</b></div>
        : <div key={row.id} className="kassa-rowwrap"><Link className="dokon-line" href={`${here}&shortage=${row.id}`} scroll={false}><span>{row.type === "OPENING" ? "Boshlang‘ich kamomat" : row.note} <small>{row.type === "ADJUST" ? "tuzatish" : row.type === "OPENING" ? row.note : "qo‘shildi"} · {fullDay(row.occurredAt)}</small></span><b className="amt-out">{money(row.amount, "USD", true)}</b></Link><DeleteEntryButton id={row.id} label={`${money(row.amount, "USD")} · ${row.note}`} action={deleteShortageAction}/></div>)
        : <p className="kassa-empty">Hali kamomat yo‘q.</p>}
    </Sheet>}
    <KassaUndoToast restore={restoreFoizimAction}/>
  </div>;
}
