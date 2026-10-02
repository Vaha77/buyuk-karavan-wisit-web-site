"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { copySalesPlansAction, createSalesPeriodAction, deleteSalesPersonAction, saveSalesPersonAction, saveSalesPlansAction } from "@/app/admin/(protected)/sales-plan/actions";
import { formatUsd, MONTHS_LONG } from "@/lib/dashboard/format";
import { ConfirmDialog } from "./dialog";

type Kind = "EMPLOYEE" | "BRANCH";
export type SalesPersonRow = { id: string; name: string; kind: Kind; branchHead: string | null; note: string | null; isActive: boolean; sortOrder: number; telegramChatId: string | null; plan: number | null; monthlyCount: number };
type Period = { id: string; name: string; startYear: number; startMonth: number; monthCount: number };
const KIND_LABEL: Record<Kind, string> = { EMPLOYEE: "Xodim", BRANCH: "Filial" };

/** Sellers list with add / edit / delete; plans shown and edited for the selected period. */
export function SalesPeopleManager({ people, period }: { people: SalesPersonRow[]; period: Period | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [deleting, setDeleting] = useState<SalesPersonRow | null>(null), [deleteError, setDeleteError] = useState("");
  const [pending, startTransition] = useTransition();
  const remove = () => deleting && startTransition(async () => {
    setDeleteError("");
    const result = await deleteSalesPersonAction(deleting.id);
    if (!result.ok) { setDeleteError(result.error); return; }
    setDeleting(null); router.refresh();
  });
  return <section className="bk-card" aria-labelledby="sp-people-title">
    <div className="bk-card-head"><div><h2 id="sp-people-title">Sotuvchilar</h2><span className="bk-muted">{people.filter(person => person.isActive).length} ta faol{period ? ` · reja: ${period.name}` : ""}</span></div>
      {editing !== "new" && <button type="button" className="bk-btn is-primary" onClick={() => setEditing("new")}><Plus size={15}/>Yangi sotuvchi</button>}</div>
    {editing === "new" && <PersonForm period={period} nextOrder={people.reduce((max, person) => Math.max(max, person.sortOrder), 0) + 1} onDone={() => setEditing(null)}/>}
    {people.length ? <div className="bk-table-wrap"><table className="bk-table">
      <thead><tr><th>Ism</th><th className="is-left">Turi</th><th className="is-left">Mas’ul</th><th>Joriy davr rejasi</th><th>Oylik yozuvlar</th><th className="is-left">Holat</th><th><span className="bk-sr-only">Amallar</span></th></tr></thead>
      <tbody>{people.map(person => editing === person.id ? <tr key={person.id}><td colSpan={7} className="is-left"><PersonForm person={person} period={period} nextOrder={person.sortOrder} onDone={() => setEditing(null)}/></td></tr> : <tr key={person.id}>
        <td className="is-strong">{person.name}{person.note && <small style={{ display: "block", fontWeight: 400 }}>{person.note}</small>}</td>
        <td className="is-left">{KIND_LABEL[person.kind]}</td><td className="is-left bk-muted">{person.branchHead || "—"}</td>
        <td>{person.plan ? formatUsd(person.plan) : <span className="bk-muted">—</span>}</td><td>{person.monthlyCount}</td>
        <td className="is-left"><span className={`bk-badge${person.isActive ? "" : " is-grey"}`}>{person.isActive ? "Faol" : "Nofaol"}</span></td>
        <td><div className="bk-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
          <button type="button" className="bk-btn bk-icon-btn" onClick={() => setEditing(person.id)} aria-label={`${person.name} — tahrirlash`}><Pencil size={15}/></button>
          <button type="button" className="bk-btn bk-icon-btn is-danger-ghost" onClick={() => { setDeleteError(""); setDeleting(person); }} aria-label={`${person.name} — o‘chirish`}><Trash2 size={15}/></button>
        </div></td>
      </tr>)}</tbody>
    </table></div> : editing !== "new" && <div className="bk-empty">Hali sotuvchi yo‘q.</div>}
    {deleting && <ConfirmDialog title="Sotuvchini o‘chirish" message={`${deleting.name} va uning ${deleting.monthlyCount} ta oylik yozuvi o‘chiriladi. Davom etasizmi?`} busy={pending} error={deleteError} onConfirm={remove} onClose={() => setDeleting(null)}/>}
  </section>;
}

function PersonForm({ person, period, nextOrder, onDone }: { person?: SalesPersonRow; period: Period | null; nextOrder: number; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(person?.name ?? ""), [kind, setKind] = useState<Kind>(person?.kind ?? "EMPLOYEE"), [branchHead, setBranchHead] = useState(person?.branchHead ?? "");
  const [note, setNote] = useState(person?.note ?? ""), [isActive, setIsActive] = useState(person?.isActive ?? true), [sortOrder, setSortOrder] = useState(String(person?.sortOrder ?? nextOrder));
  const [plan, setPlan] = useState(person?.plan ? String(person.plan) : ""), [error, setError] = useState("");
  const [telegramChatId, setTelegramChatId] = useState(person?.telegramChatId ?? "");
  const [pending, startTransition] = useTransition();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError("");
      const result = await saveSalesPersonAction(person?.id ?? null, { name, kind, branchHead, note, isActive, sortOrder: Math.max(0, Math.trunc(Number(sortOrder) || 0)), telegramChatId, periodId: period?.id ?? null, plan });
      if (!result.ok) { setError(result.error); return; }
      onDone(); router.refresh();
    });
  };
  return <form onSubmit={submit} style={{ display: "grid", gap: 12, padding: "12px 0" }} aria-label={person ? `${person.name} — tahrirlash` : "Yangi sotuvchi"}>
    <div className="bk-row">
      <label className="bk-field"><span>Ism</span><input value={name} onChange={event => setName(event.target.value)} maxLength={120} required/></label>
      <label className="bk-field"><span>Turi</span><select value={kind} onChange={event => setKind(event.target.value as Kind)}><option value="EMPLOYEE">Xodim</option><option value="BRANCH">Filial</option></select></label>
      {kind === "BRANCH" && <label className="bk-field"><span>Filial mas’uli</span><input value={branchHead} onChange={event => setBranchHead(event.target.value)} maxLength={120}/></label>}
      <label className="bk-field"><span>{period ? `Reja, $ (${period.name})` : "Reja (avval davr yarating)"}</span><input value={plan} onChange={event => setPlan(event.target.value)} inputMode="decimal" disabled={!period} placeholder="500 000"/></label>
    </div>
    <div className="bk-row">
      <label className="bk-field"><span>Izoh (ixtiyoriy)</span><input value={note} onChange={event => setNote(event.target.value)} maxLength={300}/></label>
      <label className="bk-field"><span>Telegram chat ID (eslatma uchun)</span><input value={telegramChatId} onChange={event => setTelegramChatId(event.target.value)} inputMode="numeric" placeholder="123456789"/></label>
      <label className="bk-field"><span>Tartib</span><input value={sortOrder} onChange={event => setSortOrder(event.target.value)} inputMode="numeric"/></label>
      <label className="bk-field" style={{ alignContent: "end" }}><span><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} style={{ width: "auto", minHeight: 0, marginRight: 8 }}/>Faol (dashboard’da ko‘rinadi)</span></label>
    </div>
    {error && <p className="bk-note is-soft" role="alert">{error}</p>}
    <div className="bk-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="bk-btn" onClick={onDone}>Bekor qilish</button><button type="submit" className="bk-btn is-primary" disabled={pending || name.trim().length < 2}>{pending ? "Saqlanmoqda…" : "Saqlash"}</button></div>
  </form>;
}

/** Periods: create a new one, enter plans for every seller, copy plans from another period. */
export function PeriodsManager({ periods, period, people }: { periods: Period[]; period: Period | null; people: SalesPersonRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(!periods.length);
  const [plans, setPlans] = useState<Record<string, string>>(() => Object.fromEntries(people.map(person => [person.id, person.plan ? String(person.plan) : ""])));
  const [source, setSource] = useState(periods.find(item => item.id !== period?.id)?.id ?? ""), [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const active = people.filter(person => person.isActive);
  const savePlans = () => period && startTransition(async () => {
    const result = await saveSalesPlansAction(period.id, active.map(person => ({ personId: person.id, plan: plans[person.id] ?? "" })));
    setMessage(result.ok ? `Saqlandi: ${result.count} ta reja.` : result.error); if (result.ok) router.refresh();
  });
  const copy = () => period && source && startTransition(async () => {
    const result = await copySalesPlansAction(period.id, source);
    setMessage(result.ok ? `Nusxa olindi: ${result.count} ta yangi reja (mavjudlari o‘zgarmadi).` : result.error); if (result.ok) router.refresh();
  });
  return <section className="bk-card" aria-labelledby="sp-periods-title" style={{ display: "grid", gap: 14 }}>
    <div className="bk-card-head" style={{ marginBottom: 0 }}><div><h2 id="sp-periods-title">Davrlar va rejalar</h2><span className="bk-muted">{period ? `${period.name} · ${MONTHS_LONG[period.startMonth - 1]} ${period.startYear} dan ${period.monthCount} oy` : "Davr yo‘q"}</span></div>
      {!creating && <button type="button" className="bk-btn" onClick={() => setCreating(true)}><Plus size={15}/>Yangi davr</button>}</div>
    {creating && <PeriodForm onDone={() => setCreating(false)} canCancel={periods.length > 0}/>}
    {period && <>
      {periods.length > 1 && <div className="bk-actions">
        <label className="bk-sr-only" htmlFor="sp-copy-source">Nusxa manbai</label>
        <select id="sp-copy-source" className="bk-btn" value={source} onChange={event => setSource(event.target.value)}>{periods.filter(item => item.id !== period.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <button type="button" className="bk-btn" onClick={copy} disabled={pending || !source}><Copy size={15}/>Rejalardan nusxa olish</button>
      </div>}
      {active.length ? <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>Sotuvchi</th><th>Reja, $</th><th>Oylik reja</th></tr></thead>
        <tbody>{active.map(person => { const value = Number((plans[person.id] ?? "").replace(/[\s,]/g, "")); return <tr key={person.id}>
          <td className="is-left is-strong">{person.name}</td>
          <td><input className="sp-amount-input" inputMode="decimal" value={plans[person.id] ?? ""} placeholder="—" aria-label={`${person.name} — reja`} onChange={event => setPlans(current => ({ ...current, [person.id]: event.target.value }))}/></td>
          <td className="bk-muted">{value > 0 ? formatUsd(value / period.monthCount) : "—"}</td>
        </tr>; })}</tbody>
      </table></div> : <div className="bk-empty">Faol sotuvchi yo‘q.</div>}
      <div className="bk-actions"><button type="button" className="bk-btn is-primary" onClick={savePlans} disabled={pending || !active.length}>Rejalarni saqlash</button>{message && <span className="bk-status-line is-ok" role="status">{message}</span>}</div>
      <p className="bk-muted" style={{ fontSize: 12 }}>Bo‘sh katak — reja o‘zgarmaydi. Oylik reja = reja ÷ {period.monthCount} oy.</p>
    </>}
  </section>;
}

function PeriodForm({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const router = useRouter();
  const now = new Date();
  const [startYear, setStartYear] = useState(String(now.getFullYear())), [startMonth, setStartMonth] = useState(String(now.getMonth() + 1)), [monthCount, setMonthCount] = useState("6");
  const auto = (() => { const start = Number(startMonth) - 1, count = Math.max(1, Number(monthCount) || 1), end = start + count - 1, endYear = Number(startYear) + Math.floor(end / 12); return `${MONTHS_LONG[start]} – ${MONTHS_LONG[end % 12]} ${endYear}`; })();
  const [name, setName] = useState(""), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError("");
      const result = await createSalesPeriodAction({ name: name.trim() || auto, startYear: Number(startYear), startMonth: Number(startMonth), monthCount: Number(monthCount) });
      if (!result.ok) { setError(result.error); return; }
      onDone(); router.push(`/admin/sales-plan/people?period=${result.id}`); router.refresh();
    });
  };
  return <form onSubmit={submit} style={{ display: "grid", gap: 12 }} aria-label="Yangi davr">
    <div className="bk-row">
      <label className="bk-field"><span>Nomi</span><input value={name} onChange={event => setName(event.target.value)} placeholder={auto} maxLength={80}/></label>
      <label className="bk-field"><span>Boshlanish oyi</span><select value={startMonth} onChange={event => setStartMonth(event.target.value)}>{MONTHS_LONG.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label>
      <label className="bk-field"><span>Yil</span><input value={startYear} onChange={event => setStartYear(event.target.value)} inputMode="numeric" maxLength={4}/></label>
      <label className="bk-field"><span>Oylar soni</span><input value={monthCount} onChange={event => setMonthCount(event.target.value)} inputMode="numeric" maxLength={2}/></label>
    </div>
    {error && <p className="bk-note is-soft" role="alert">{error}</p>}
    <div className="bk-actions" style={{ justifyContent: "flex-end" }}>{canCancel && <button type="button" className="bk-btn" onClick={onDone}>Bekor qilish</button>}<button type="submit" className="bk-btn is-primary" disabled={pending}>{pending ? "Saqlanmoqda…" : "Davr yaratish"}</button></div>
  </form>;
}
