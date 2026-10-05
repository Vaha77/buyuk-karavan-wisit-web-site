"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { saveSalesMonthlyAction } from "@/app/admin/(protected)/sales-plan/actions";
import { formatUsd, MONTHS_LONG } from "@/lib/dashboard/format";
import { Dialog } from "./dialog";
import { startNavigationProgress } from "@/components/admin/feedback";

type Period = { id: string; name: string };
type Month = { year: number; month: number };
type Person = { id: string; name: string; kind: "EMPLOYEE" | "BRANCH"; plan: number };
const key = ({ year, month }: Month) => `${year}-${String(month).padStart(2, "0")}`;

export function PeriodSelect({ periods, value, basePath }: { periods: Period[]; value: string; basePath: string }) {
  const router = useRouter();
  return <><label className="bk-sr-only" htmlFor="sp-period">Davr</label>
    <select id="sp-period" className="bk-btn" value={value} onChange={event => { startNavigationProgress(); router.push(`${basePath}?period=${encodeURIComponent(event.target.value)}`); }}>
      {periods.map(period => <option key={period.id} value={period.id}>{period.name}</option>)}
    </select></>;
}

/** "+ Oylik savdo kiritish": one month, every active seller in one table; existing amounts are prefilled. */
export function MonthlyEntryButton({ months, people, entered, defaultMonth }: { months: Month[]; people: Person[]; entered: Record<string, Record<string, number>>; defaultMonth: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="bk-btn is-primary" onClick={() => setOpen(true)} disabled={!people.length}><Plus size={15}/>Oylik savdo kiritish</button>
    {open && <MonthlyEntryDialog months={months} people={people} entered={entered} defaultMonth={defaultMonth} onClose={() => setOpen(false)}/>}
  </>;
}

function MonthlyEntryDialog({ months, people, entered, defaultMonth, onClose }: { months: Month[]; people: Person[]; entered: Record<string, Record<string, number>>; defaultMonth: string; onClose: () => void }) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const initial = useMemo(() => Object.fromEntries(people.map(person => [person.id, entered[person.id]?.[month] !== undefined ? String(entered[person.id][month]) : ""])), [people, entered, month]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [confirmClear, setConfirmClear] = useState(false), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = months.find(item => key(item) === month)!;
  const cleared = people.filter(person => initial[person.id] !== "" && values[person.id].trim() === "");
  const total = people.reduce((sum, person) => sum + (Number(values[person.id]?.replace(/[\s,]/g, "")) || 0), 0);

  const changeMonth = (next: string) => {
    setMonth(next); setConfirmClear(false); setError("");
    setValues(Object.fromEntries(people.map(person => [person.id, entered[person.id]?.[next] !== undefined ? String(entered[person.id][next]) : ""])));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (cleared.length && !confirmClear) { setConfirmClear(true); return; }
    startTransition(async () => {
      setError("");
      const result = await saveSalesMonthlyAction({ year: selected.year, month: selected.month, entries: people.map(person => ({ personId: person.id, amount: values[person.id] ?? "" })), clear: cleared.map(person => person.id) });
      if (!result.ok) { setError(result.error); return; }
      onClose(); router.refresh();
    });
  };

  return <Dialog title="Oylik savdo kiritish" onClose={onClose} busy={pending} wide>
    <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
      <label className="bk-field"><span>Oy (davr ichida)</span>
        <select value={month} onChange={event => changeMonth(event.target.value)}>{months.map(item => <option key={key(item)} value={key(item)}>{MONTHS_LONG[item.month - 1]} {item.year}</option>)}</select>
      </label>
      <p className="bk-muted">Summalar USD da. Bo‘sh qoldirilgan katak — “kiritilmagan” (dashboard’da kulrang “—”).</p>
      <div className="bk-table-wrap"><table className="bk-table sp-entry-table">
        <thead><tr><th>Sotuvchi</th><th>Oylik reja</th><th>Savdo, $</th></tr></thead>
        <tbody>{people.map(person => <tr key={person.id}>
          <td className="is-left"><b>{person.name}</b>{person.kind === "BRANCH" && <small> · filial</small>}</td>
          <td className="bk-muted">{person.plan ? formatUsd(person.plan / months.length) : "—"}</td>
          <td><input className="sp-amount-input" inputMode="decimal" aria-label={`${person.name} — ${MONTHS_LONG[selected.month - 1]} savdosi`} value={values[person.id] ?? ""} placeholder="—"
            onChange={event => { setConfirmClear(false); setValues(current => ({ ...current, [person.id]: event.target.value })); }}/></td>
        </tr>)}</tbody>
        <tfoot><tr><td className="is-left is-strong">Jami</td><td/><td className="is-strong">{formatUsd(total)}</td></tr></tfoot>
      </table></div>
      {confirmClear && <p className="bk-note is-soft" role="alert">{cleared.map(person => person.name).join(", ")} — {MONTHS_LONG[selected.month - 1]} yozuvi o‘chiriladi. Tasdiqlash uchun yana “Saqlash”ni bosing.</p>}
      {error && <p className="bk-note is-soft" role="alert">{error}</p>}
      <div className="bk-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="bk-btn" onClick={onClose} disabled={pending}>Bekor qilish</button>
        <button type="submit" className={`bk-btn ${confirmClear ? "is-danger" : "is-primary"}`} disabled={pending}>{pending ? "Saqlanmoqda…" : confirmClear ? "Tasdiqlash va saqlash" : "Saqlash"}</button>
      </div>
    </form>
  </Dialog>;
}
