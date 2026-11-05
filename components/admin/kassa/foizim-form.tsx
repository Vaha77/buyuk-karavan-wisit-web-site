"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCommissionAction, saveCommissionAction } from "@/app/admin/(protected)/kassa/foizim/actions";
import { percentOf } from "@/lib/foizim/rules";
import { money, parseAmount } from "@/lib/kassa/rules";
import { DeleteEntryButton } from "./delete-entry";
import { groupDigits, nowLocal, toLocal } from "./entry-form";
import { Sheet, useSave } from "./hodim-forms";

type Entry = { id: string; fromName: string; amount: number; base: number | null; percent: number | null; note: string | null; occurredAt: string };

/** "＋ Yangi yozuv" / correction: "Foizdan hisoblash" fills Summa (savdo × foiz), which can still be typed over. */
export function CommissionSheet({ entry, names, notes, closeHref }: { entry?: Entry; names: string[]; notes: string[]; closeHref: string }) {
  const router = useRouter();
  const [fromName, setFromName] = useState(entry?.fromName ?? "");
  const [calc, setCalc] = useState(entry?.base != null);
  const [base, setBase] = useState(entry?.base != null ? groupDigits(String(entry.base)) : "");
  const [percent, setPercent] = useState(entry?.percent != null ? String(entry.percent) : "");
  const [amount, setAmount] = useState(entry ? groupDigits(String(entry.amount)) : "");
  const [when, setWhen] = useState(() => entry ? toLocal(entry.occurredAt) : nowLocal());
  const { error, pending, submit } = useSave(saveCommissionAction, () => router.replace(closeHref, { scroll: false }));
  // A delete from this sheet (phone: rows have no 🗑) closes it; the page's toast offers "Qaytarish".
  useEffect(() => { const close = () => router.replace(closeHref, { scroll: false }); window.addEventListener("kassa:deleted", close); return () => window.removeEventListener("kassa:deleted", close); }, [router, closeHref]);
  const computed = percentOf(parseAmount(base), parseAmount(percent));
  const fill = (nextBase: string, nextPercent: string) => { const value = percentOf(parseAmount(nextBase), parseAmount(nextPercent)); if (value > 0) setAmount(groupDigits(String(value))); };
  return <Sheet title={entry ? "Yozuvni tuzatish" : "＋ Yangi yozuv"} closeHref={closeHref}>
    <form action={submit} className="hodim-fields">
      {entry && <input type="hidden" name="id" value={entry.id}/>}
      <label>Kimdan *<input name="fromName" maxLength={100} autoComplete="off" value={fromName} onChange={event => setFromName(event.target.value)} required autoFocus={!entry}/></label>
      {names.length > 0 && <div className="foizim-sug">{names.map(name => <button key={name} type="button" className={`chip${name === fromName.trim() ? " on" : ""}`} onClick={() => setFromName(name)}>{name}</button>)}</div>}
      <label className="hodim-check"><input type="checkbox" name="calc" checked={calc} onChange={event => setCalc(event.target.checked)}/>Foizdan hisoblash</label>
      {calc && <>
        <div className="foizim-g2">
          <label>Savdo, $<input name="base" inputMode="decimal" autoComplete="off" placeholder="0" value={base} onChange={event => { const next = groupDigits(event.target.value); setBase(next); fill(next, percent); }} required/></label>
          <label>Foiz, %<input name="percent" inputMode="decimal" autoComplete="off" placeholder="5" value={percent} onChange={event => { const next = event.target.value.replace(/[^\d.,]/g, "").replace(",", "."); setPercent(next); fill(base, next); }} required/></label>
        </div>
        {computed > 0 && <p className="foizim-calc">{money(parseAmount(base), "USD")} × {parseAmount(percent)}% = <b>{money(computed, "USD")}</b></p>}
      </>}
      <label>Summa, $<input name="amount" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onChange={event => setAmount(groupDigits(event.target.value))} required/></label>
      <label>Sana<input type="datetime-local" name="occurredAt" value={when} onChange={event => setWhen(event.target.value)} required/></label>
      <label>Izoh<input name="note" list="foizim-notes" maxLength={300} autoComplete="off" defaultValue={entry?.note ?? ""} placeholder="Masalan: Sovutish ombori"/></label>
      <datalist id="foizim-notes">{notes.map(note => <option key={note} value={note}/>)}</datalist>
      {error && <p className="kassa-error" role="alert">{error}</p>}
      <div className="hodim-save"><button className="btn-g" disabled={pending}>{pending ? "Saqlanmoqda…" : "Saqlash"}</button>{entry && <DeleteEntryButton ghost id={entry.id} label={`${money(entry.amount, "USD")} · ${entry.fromName}`} action={deleteCommissionAction}/>}</div>
    </form>
  </Sheet>;
}
