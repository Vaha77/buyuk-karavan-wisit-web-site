import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Pencil } from "lucide-react";
import { GhostButton, GlassCard, Pill } from "@/components/ui/aurora";
import { DeleteEntryButton, KassaUndoToast } from "@/components/admin/kassa/delete-entry";
import { BarsChart, Count, Reveal } from "@/components/admin/kassa/dokon-charts";
import { DokonTabs, PeriodChips } from "@/components/admin/kassa/dokon-tabs";
import { DebtSheet, EmployeeSheet } from "@/components/admin/kassa/hodim-forms";
import { requireRole } from "@/lib/auth/require-admin";
import { getDebtEntries, getEmployees } from "@/lib/employees/queries";
import { debtTone, paidToday, withBalance } from "@/lib/employees/rules";
import { dayKey } from "@/lib/dashboard/period";
import { employeeRange, employeeStats } from "@/lib/dokon/stats";
import { money } from "@/lib/kassa/rules";
import { deleteDebtEntryAction, restoreDebtEntryAction } from "../actions";
import "@/components/admin/kassa/kassa.css";

export const metadata: Metadata = { title: "Hodim — Admin | BUYUK KARAVAN" };
const dayText = (date: Date) => dayKey(date).slice(5).split("-").reverse().join(".");

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ add?: string; entry?: string; edit?: string; p?: string; from?: string; to?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const [employees, entries] = await Promise.all([getEmployees(), getDebtEntries(id)]);
  const employee = employees.find(item => item.id === id);
  if (!employee) notFound();
  const here = `/admin/kassa/hodimlar/${id}`, paid = paidToday(entries), rows = withBalance(entries);
  const editing = search.entry ? entries.find(row => row.id === search.entry && !row.kassaEntryId) : undefined;
  const notes = [...new Set(entries.map(row => row.note))].slice(-30);
  const p = ["oy", "yil", "davr"].includes(search.p ?? "") ? search.p! : "hammasi", stats = employeeStats(entries, employeeRange(search));
  return <div className="kassa">
    <DokonTabs on="hodimlar"/>
    <Link className="hodim-back" href="/admin/kassa/hodimlar"><ChevronLeft size={14}/> Hodimlar</Link>
    <header className="kassa-top">
      <div className="hodim-head"><i className="dokon-av">{employee.name.charAt(0).toUpperCase()}</i><div><h1>{employee.name}</h1><p>{[employee.position, stats.since && `${dayKey(stats.since).split("-").reverse().join(".")} dan beri`, employee.archived && "arxivda"].filter(Boolean).join(" · ")}</p></div></div>
      <div className="kassa-actions hodim-actions">
        <Link className="hodim-debt" href={`${here}?add=DEBT`} scroll={false}>+ Qarz yozish</Link>
        <Link className="hodim-pay" href={`${here}?add=PAYMENT`} scroll={false}>✓ To‘ladi</Link>
        <GhostButton href={`${here}?edit=1`} scroll={false} aria-label="Hodimni tahrirlash"><Pencil size={16}/></GhostButton>
        <GhostButton href={`/admin/kassa/hodimlar/export?id=${id}`} prefetch={false} aria-label="Excel"><Download size={16}/></GhostButton>
      </div>
    </header>
    {entries.length === 0 ? <p className="kassa-empty">Hali qarz yozilmagan</p> : <>
      <PeriodChips path={here} keys={[["oy", "Oy"], ["yil", "Yil"], ["hammasi", "Hammasi"]]} on={p} search={search}/>
      <div className="dokon-cards">
        <div className="glass kassa-bal"><span>Jami olgan</span><Count value={stats.taken} currency="USD" className="is-debt"/><small>{stats.takenCount} marta</small></div>
        <div className="glass kassa-bal"><span>Jami bergan</span><Count value={stats.given} currency="USD" className="is-over"/><small>{stats.givenCount} marta</small></div>
        <div className="glass kassa-bal dokon-desk"><span>Hozirgi qarz</span><Count value={stats.debt} currency="USD" className={debtTone(stats.debt)}/><small>{money(stats.monthChange, "USD", true)} shu oy</small></div>
        <div className="glass kassa-bal dokon-desk"><span>Oxirgi to‘lov</span>{stats.lastPayment ? <><b>{money(stats.lastPayment.amount, "USD")}</b><small>{dayKey(stats.lastPayment.occurredAt).split("-").reverse().join(".")}{stats.lastPayment.kassaEntryId && " · kassadan"}</small></> : <b>—</b>}</div>
      </div>
      <section className="glass dokon-box"><h2>Oylar bo‘yicha: olgan va bergan</h2><Reveal className="dokon-reveal"><BarsChart rows={stats.months} labels={["Olgan", "Bergan", "Qarz qoldig‘i"]} tones={["col-out", "col-in"]} currency="USD" area/></Reveal></section>
      <div className="dokon-two">
        <section className="glass dokon-box"><h2>Qarzni qaytarishi</h2><Reveal className="dokon-ring"><div><svg viewBox="0 0 150 150" aria-hidden><circle cx="75" cy="75" r="62" pathLength={100} stroke="rgba(255,255,255,.07)"/><circle className="dokon-seg" cx="75" cy="75" r="62" pathLength={100} stroke="#34d399" style={{ "--d": stats.pct } as React.CSSProperties}/></svg><Count value={stats.pct}/></div><ul><li>Bergan<b>{money(stats.given, "USD")}</b></li><li>Qolgan<b>{money(stats.left, "USD")}</b></li><li>O‘rtacha to‘lov<b>{money(stats.average, "USD")}</b></li></ul></Reveal></section>
        <section className="glass dokon-box dokon-desk"><h2>Oxirgi harakatlar</h2>{stats.recent.length ? stats.recent.map(row => <div key={row.id} className="dokon-line"><span>{row.note}{row.kassaEntryId && " · 🧾 kassadan"}</span><b className={row.type === "PAYMENT" ? "amt-in" : "amt-out"}>{money(row.type === "PAYMENT" ? -row.amount : row.amount, "USD", true)}</b></div>) : <p className="kassa-empty">Bu davrda yozuv yo‘q.</p>}</section>
      </div>
    </>}
    <div className="hodim-cards">
      <GlassCard blur className="kassa-bal"><span>Umumiy qarzi</span><b className={debtTone(employee.debt)}>{money(employee.debt, "USD")}</b></GlassCard>
      <GlassCard blur className="kassa-bal"><span>Bugun to‘ladi</span><b className="amt-in">{money(paid.sum, "USD")}</b><small>{paid.count} ta to‘lov</small></GlassCard>
    </div>
    <GlassCard className="kassa-list">
      {rows.length === 0 ? <p className="kassa-empty">Hali yozuv yo‘q.</p> : <div role="table" aria-label="Yozuvlar">
        <div className="hodim-row kassa-th" role="row"><span role="columnheader">Sana</span><span role="columnheader">Izoh</span><span role="columnheader">Qarz yozildi</span><span role="columnheader">To‘ladi</span><span role="columnheader">Qoldiq</span></div>
        {rows.map(row => {
          const paidRow = row.type === "PAYMENT", day = dayKey(row.occurredAt);
          // A kassa row opens its source entry: it is corrected only there.
          const href = row.kassaEntryId ? `/admin/kassa?range=custom&from=${day}&to=${day}&edit=${row.kassaEntryId}` : `${here}?entry=${row.id}`;
          return <div key={row.id} className="kassa-rowwrap"><Link href={href} scroll={false} className="hodim-row" role="row">
            <span className="kassa-date" role="cell">{dayText(row.occurredAt)}</span>
            <span className="hodim-note" role="cell"><b>{row.note}</b>{row.kassaEntryId && <Pill tone="info">🧾 kassadan</Pill>}</span>
            <span className="amt-out" role="cell">{!paidRow && money(row.amount, "USD", true)}</span>
            <span className="amt-in" role="cell">{paidRow && money(-row.amount, "USD")}</span>
            <span className={`hodim-bal ${debtTone(row.balance)}`} role="cell">{money(row.balance, "USD")}</span>
          </Link>{!row.kassaEntryId && <DeleteEntryButton id={row.id} label={`${money(paidRow ? -row.amount : row.amount, "USD", true)} · ${row.note}`} action={deleteDebtEntryAction}/>}</div>;
        })}
      </div>}
    </GlassCard>
    {(search.add === "DEBT" || search.add === "PAYMENT") && <DebtSheet employeeId={id} type={search.add} notes={notes} closeHref={here}/>}
    {editing && <DebtSheet employeeId={id} type={editing.type} notes={notes} closeHref={here} entry={{ id: editing.id, amount: editing.amount, note: editing.note, occurredAt: editing.occurredAt.toISOString() }}/>}
    {search.edit && <EmployeeSheet employee={employee} closeHref={here}/>}
    <KassaUndoToast restore={restoreDebtEntryAction}/>
  </div>;
}
