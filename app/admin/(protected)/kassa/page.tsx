import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChartColumn, ChevronLeft, ChevronRight, Download, History, Lock } from "lucide-react";
import { Chip, ChipGroup, GhostButton, GlassCard, Pill } from "@/components/ui/aurora";
import { KassaEntryForm } from "@/components/admin/kassa/entry-form";
import { DeleteEntryButton, KassaUndoToast } from "@/components/admin/kassa/delete-entry";
import { KassaBotDrafts } from "@/components/admin/kassa/bot-drafts";
import { EmployeeTag } from "@/components/admin/kassa/employee-tag";
import { DokonTabs, EmployeeSelect } from "@/components/admin/kassa/dokon-tabs";
import { getEmployees } from "@/lib/employees/queries";
import { amountText, FLAGS, type Flag } from "@/lib/kassa/bot-core";
import { requireRole } from "@/lib/auth/require-admin";
import { dayKey, resolvePeriod } from "@/lib/dashboard/period";
import { getDeletedEntries, getKassaCategories, getPendingDrafts, getKassaEntries, getKassaLedger, getKassaSettings, getNoteHistory } from "@/lib/kassa/queries";
import { addDays, CURRENCIES, money, PAYMENTS, totals, type Currency } from "@/lib/kassa/rules";
import { restoreEntryAction, saveOpeningAction, updateCategoryAction } from "./actions";
import "@/components/admin/kassa/kassa.css";

export const metadata: Metadata = { title: "Kassa — Admin | BUYUK KARAVAN" };
type Search = { range?: string; from?: string; to?: string; type?: string; cat?: string; pay?: string; emp?: string; q?: string; edit?: string; draft?: string; bot?: string };

const PERIODS = [{ key: "today", label: "Bugun" }, { key: "7d", label: "Hafta" }, { key: "month", label: "Oy" }] as const;
const CURRENCY_NAMES: Record<Currency, string> = { USD: "Dollar", UZS: "So‘m" };
const local = (date: Date) => new Date(date.getTime() + 5 * 3_600_000).toISOString();

export default async function KassaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireRole("SUPER_ADMIN");
  const search = await searchParams;
  const period = resolvePeriod({ ...search, range: search.range ?? "today" });
  const fromDay = dayKey(period.from), toDay = dayKey(new Date(period.to.getTime() - 1)), today = dayKey(new Date());
  const type = search.type === "IN" || search.type === "OUT" ? search.type : undefined;
  const [{ days }, entries, categories, history, settings, deleted, drafts, employees] = await Promise.all([
    getKassaLedger(period.from, period.to),
    getKassaEntries(period.from, period.to, { type, categoryId: search.cat, employeeId: search.emp, paymentType: search.pay, q: search.q?.trim().slice(0, 100) }),
    getKassaCategories(), getNoteHistory(), getKassaSettings(), getDeletedEntries(), getPendingDrafts(), getEmployees(),
  ]);
  const query = (patch: Partial<Search>, path = "/admin/kassa") => {
    const params = new URLSearchParams(Object.entries({ ...search, edit: undefined, draft: undefined, bot: undefined, ...patch }).filter((pair): pair is [string, string] => !!pair[1]));
    return `${path}${params.size ? `?${params}` : ""}`;
  };
  const dayHref = (day: string) => query({ range: "custom", from: day, to: day });
  const single = fromDay === toDay;
  const editingRow = search.edit ? entries.find(entry => entry.id === search.edit) : undefined;
  const editing = editingRow ? { ...editingRow, addToDebt: editingRow.debtEffect !== null, occurredAt: editingRow.occurredAt.toISOString(), logs: editingRow.logs.map(log => ({ at: log.createdAt.toISOString(), user: log.user.name, changes: log.changes as Record<string, [string | null, string | null]> })) } : null;
  const draft = search.draft ? drafts.find(item => item.id === search.draft) : undefined;
  // ✏️ on a bot draft opens the same sheet with its values; "Saqlash" confirms it.
  const draftEditing = draft ? { id: "", draftId: draft.id, type: draft.type ?? "OUT" as const, amount: draft.amount ?? 0, currency: draft.currency ?? "UZS" as const, categoryId: draft.categoryId ?? "", paymentType: draft.paymentType, note: draft.note, occurredAt: draft.occurredAt.toISOString(), receiptUrl: null, logs: [], employeeId: draft.employeeId, addToDebt: true, debtEffect: null } : null;

  return <div className="kassa">
    <DokonTabs on="kassa"/>
    <EmployeeSelect className="hodim-select-phone" employees={employees.filter(item => !item.archived)}/>
    <header className="kassa-top">
      <div><p className="kassa-hi"><Lock size={12}/> Super Admin · {user.name}</p><h1>Kassa</h1></div>
      <ChipGroup label="Davr">
        {PERIODS.map(item => <Chip key={item.key} href={query({ range: item.key, from: undefined, to: undefined })} on={period.key === item.key}>{item.label}</Chip>)}
        <Chip href={query({ range: "custom", from: search.from ?? fromDay, to: search.to ?? toDay })} on={period.key === "custom"} dashed={period.key !== "custom"}>+ Davr</Chip>
      </ChipGroup>
      <div className="kassa-actions">
        <GhostButton href="/admin/kassa/history" aria-label="Tarix"><History size={16}/><span>Tarix</span></GhostButton>
        <GhostButton href={query({}, "/admin/kassa/report")} aria-label="Hisobot"><ChartColumn size={16}/><span>Hisobot</span></GhostButton>
        <GhostButton href={`/admin/kassa/export?from=${fromDay}&to=${toDay}`} prefetch={false} aria-label="Excel"><Download size={16}/><span>Excel</span></GhostButton>
      </div>
    </header>

    {drafts.length > 0 && <KassaBotDrafts drafts={drafts.map(item => ({ id: item.id, employee: item.employee?.name ?? null, note: item.note, voice: item.source === "VOICE", isIn: item.type === "IN", amount: amountText(item), editHref: query({ draft: item.id }),
      meta: `${item.category ? `${item.category.icon ?? ""} ${item.category.name}`.trim() : "—"} · ${PAYMENTS[item.paymentType].slice(3).toLowerCase()} · ${dayKey(item.occurredAt) === today ? "bugun" : dayKey(item.occurredAt).split("-").reverse().join(".")} ${local(item.occurredAt).slice(11, 16)}`,
      warning: item.flags.length ? item.flags.map(flag => FLAGS[flag as Flag] ?? flag).join(", ") : null }))}/>}

    {!settings.openingDate && <GlassCard blur className="kassa-opening-card">
      <b>Boshlang‘ich qoldiqni kiriting</b>
      <form action={saveOpeningAction} className="kassa-opening">
        <label>Dollar · $<input name="openingUsd" inputMode="decimal" placeholder="10 000" required/></label>
        <label>So‘m<input name="openingUzs" inputMode="decimal" placeholder="100 000 000" required/></label>
        <input type="hidden" name="openingDate" value={today}/>
        <button className="btn-g">Saqlash</button>
      </form>
    </GlassCard>}

    <nav className="kassa-day" aria-label="Kun">
      <Link href={dayHref(addDays(fromDay, -1))} aria-label="Oldingi kun" scroll={false}><ChevronLeft size={18}/></Link>
      {period.key === "custom"
        ? <form className="kassa-range"><input type="hidden" name="range" value="custom"/><input type="date" name="from" defaultValue={fromDay} aria-label="Dan"/><span>—</span><input type="date" name="to" defaultValue={toDay} aria-label="Gacha"/><button className="chip">Ko‘rsatish</button></form>
        : <b>{single ? `${fromDay === today ? "Bugun · " : ""}${fromDay.split("-").reverse().join(".")}` : `${fromDay.split("-").reverse().join(".")} — ${toDay.split("-").reverse().join(".")}`}</b>}
      <Link href={dayHref(addDays(toDay, 1))} aria-label="Keyingi kun" scroll={false}><ChevronRight size={18}/></Link>
    </nav>

    <GlassCard blur className="kassa-balances">
      {CURRENCIES.map(currency => {
        const sum = totals(days, currency);
        return <div key={currency} className="kassa-bal">
          <span>{CURRENCY_NAMES[currency]} · {single ? "kun" : "davr"} oxiri</span>
          <b className={sum.end < 0 ? "is-neg" : undefined}>{money(sum.end, currency)}</b>
          <dl>
            <div><dt>{single ? "Kun" : "Davr"} boshi</dt><dd className={sum.start < 0 ? "is-neg" : undefined}>{money(sum.start, currency)}</dd></div>
            <div><dt>Kirim</dt><dd className="amt-in">{money(sum.in, currency, true)}</dd></div>
            <div><dt>Chiqim</dt><dd className="amt-out">{money(-sum.out, currency)}</dd></div>
          </dl>
        </div>;
      })}
    </GlassCard>

    <div className="kassa-grid">
      <GlassCard className="kassa-list">
        <form className="kassa-filters">
          {Object.entries({ range: search.range, from: search.from, to: search.to }).map(([key, value]) => value && <input key={key} type="hidden" name={key} value={value}/>)}
          <ChipGroup label="Turi" className="seg">
            {[["", "Hammasi"], ["IN", "Kirim"], ["OUT", "Chiqim"]].map(([key, label]) => <Link key={key} href={query({ type: key || undefined })} className={(type ?? "") === key ? "on" : undefined} scroll={false}>{label}</Link>)}
          </ChipGroup>
          {type && <input type="hidden" name="type" value={type}/>}
          <select name="cat" defaultValue={search.cat ?? ""} aria-label="Kategoriya"><option value="">Kategoriya</option>{categories.filter(category => !type || category.type === type).map(category => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select>
          <select name="pay" defaultValue={search.pay ?? ""} aria-label="To‘lov turi"><option value="">To‘lov turi</option>{Object.entries(PAYMENTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <select name="emp" defaultValue={search.emp ?? ""} aria-label="Hodim"><option value="">Hodim</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>
          <input type="search" name="q" defaultValue={search.q} placeholder="🔍 Qidirish…" aria-label="Qidirish"/>
          <button className="chip">Filtr</button>
        </form>
        {entries.length === 0 ? <p className="kassa-empty">Bu davrda yozuv yo‘q.</p> : <div className="kassa-rows" role="table" aria-label="Yozuvlar">
          <div className="kassa-row kassa-th" role="row"><span role="columnheader">Sana</span><span role="columnheader">Yozuv</span><span role="columnheader">Kategoriya</span><span role="columnheader">To‘lov</span><span role="columnheader">Summa</span></div>
          {entries.map(entry => {
            const iso = local(entry.occurredAt), isIn = entry.type === "IN";
            return <div key={entry.id} className="kassa-rowwrap"><Link href={query({ edit: entry.id })} scroll={false} className={`kassa-row${entry.id === search.edit ? " on" : ""}`} role="row">
              <span className="kassa-date" role="cell">{`${iso.slice(8, 10)}.${iso.slice(5, 7)} · ${iso.slice(11, 16)}`}</span>
              <span className="kassa-note-cell" role="cell"><i className={isIn ? "ic-in" : "ic-out"}>{isIn ? <ArrowDownLeft size={16}/> : <ArrowUpRight size={16}/>}</i><b>{entry.note}</b>{entry.employee && entry.employeeId && <EmployeeTag id={entry.employeeId} name={entry.employee.name}/>}{entry.logs.length > 0 && <Pill tone="wait">tuzatilgan</Pill>}</span>
              <span className="kassa-cat" role="cell">{entry.category.icon} {entry.category.name}</span>
              <span role="cell"><Pill tone={entry.paymentType === "CASH" ? "gold" : "info"}>{PAYMENTS[entry.paymentType].slice(3)}</Pill></span>
              <span role="cell" className={isIn ? "amt-in" : "amt-out"}>{money(isIn ? entry.amount : -entry.amount, entry.currency, true)}</span>
            </Link><DeleteEntryButton id={entry.id} label={`${money(isIn ? entry.amount : -entry.amount, entry.currency, true)} · ${entry.note}`}/></div>;
          })}
        </div>}
      </GlassCard>
      <aside>
        <KassaEntryForm key={editing?.id ?? draftEditing?.draftId ?? "new"} categories={categories} history={history} employees={employees} editing={editing ?? draftEditing} closeHref={query({})}/>
      </aside>
    </div>

    <details className="glass kassa-settings" open={!!search.bot || undefined}>
      <summary>Sozlamalar · boshlang‘ich qoldiq va kategoriyalar</summary>
      <form method="post" action="/api/kassa-bot/setup" className="kassa-botsetup">
        <span>BK Kassa Telegram boti{search.bot && <b> · {{ ok: "ulandi ✓", env: "Vercel env to‘liq emas", error: "ulanmadi — tokenni tekshiring" }[search.bot] ?? ""}</b>}</span>
        <button className="chip">Botni ulash</button>
      </form>
      {settings.openingDate && <form action={saveOpeningAction} className="kassa-opening">
        <label>Boshlang‘ich qoldiq · $<input name="openingUsd" inputMode="decimal" defaultValue={settings.opening.USD} required/></label>
        <label>Boshlang‘ich qoldiq · so‘m<input name="openingUzs" inputMode="decimal" defaultValue={settings.opening.UZS} required/></label>
        <label>Sanasi<input type="date" name="openingDate" defaultValue={settings.openingDate} required/></label>
        <button className="btn-g">Saqlash</button>
      </form>}
      <div className="kassa-cats">
        {categories.map(category => <form key={category.id} action={updateCategoryAction}>
          <input type="hidden" name="id" value={category.id}/>
          <Pill tone={category.type === "IN" ? "ok" : "red"}>{category.type === "IN" ? "Kirim" : "Chiqim"}</Pill>
          <input name="name" defaultValue={category.name} maxLength={60} aria-label="Nomi" required/>
          <label><input type="checkbox" name="archived" defaultChecked={category.archived}/> arxiv</label>
          <label><input type="checkbox" name="excludeFromStats" defaultChecked={category.excludeFromStats}/> Statistikaga kirmasin</label>
          <span>{category.uses} ta</span>
          <button className="chip">Saqlash</button>
        </form>)}
      </div>
      {deleted.length > 0 && <div className="kassa-deleted">
        <p className="kassa-label">O‘chirilganlar</p>
        {deleted.map(entry => <form key={entry.id} action={async () => { "use server"; await restoreEntryAction(entry.id); }}>
          <span className="kassa-date">{local(entry.occurredAt).slice(0, 16).replace("T", " ")}</span>
          <b className={entry.type === "IN" ? "amt-in" : "amt-out"}>{money(entry.type === "IN" ? entry.amount : -entry.amount, entry.currency, true)}</b>
          <span>{entry.note}{entry.deleteReason && <small> · {entry.deleteReason}</small>}</span>
          <small>{entry.deletedBy?.name ?? "—"} · {local(entry.deletedAt!).slice(0, 16).replace("T", " ")}</small>
          <button className="chip">Tiklash</button>
        </form>)}
      </div>}
    </details>
    <KassaUndoToast/>
  </div>;
}
