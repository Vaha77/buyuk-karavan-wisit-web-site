"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { saveDebtEntryAction, saveEmployeeAction } from "@/app/admin/(protected)/kassa/hodimlar/actions";
import { money } from "@/lib/kassa/rules";
import { groupDigits, nowLocal, toLocal } from "./entry-form";

/** Bottom sheet on a phone, centred modal on a computer: open while its URL param is set, closing returns to `closeHref`. */
function Sheet({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), router = useRouter();
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="glass hodim-sheet" onClose={() => router.replace(closeHref, { scroll: false })}>
    <div className="kassa-form-head"><b>{title}</b><button type="button" className="hodim-x" aria-label="Yopish" onClick={() => ref.current?.close()}><X size={18}/></button></div>
    {children}
  </dialog>;
}

function useSave<R extends { ok: true } | { ok: false; error: string }>(action: (form: FormData) => Promise<R>, done: (result: R) => void) {
  const [error, setError] = useState(""), [pending, start] = useTransition();
  const submit = (form: FormData) => { setError(""); start(async () => { const result = await action(form); if (result.ok) done(result); else setError(result.error); }); };
  return { error, pending, submit };
}

export function EmployeeSheet({ employee, closeHref }: { employee: { id: string; name: string; position: string | null; phone: string | null; archived: boolean; debt: number } | null; closeHref: string }) {
  const router = useRouter();
  const [archive, setArchive] = useState(employee?.archived ?? false), [opening, setOpening] = useState("");
  const { error, pending, submit } = useSave(saveEmployeeAction, result => { if (result.ok) router.replace(employee ? closeHref : `/admin/kassa/hodimlar/${result.id}`, { scroll: false }); });
  return <Sheet title={employee ? "Hodimni tahrirlash" : "Yangi hodim"} closeHref={closeHref}>
    <form action={submit} className="hodim-fields">
      {employee && <input type="hidden" name="id" value={employee.id}/>}
      <label>Ism *<input name="name" maxLength={100} defaultValue={employee?.name} required autoFocus/></label>
      <label>Lavozim (ixtiyoriy)<input name="position" maxLength={100} defaultValue={employee?.position ?? ""} placeholder="masalan: sotuvchi, omborchi"/></label>
      <label>Telefon (ixtiyoriy)<input name="phone" type="tel" maxLength={32} defaultValue={employee?.phone ?? ""} placeholder="+998 __ ___ __ __"/></label>
      {employee
        ? <label className="hodim-check"><input type="checkbox" name="archived" checked={archive} onChange={event => setArchive(event.target.checked)}/>Arxivlash</label>
        : <label>Hozirgi qarzi (Excel’dagi qoldiq), $<input name="opening" inputMode="decimal" autoComplete="off" placeholder="0" value={opening} onChange={event => setOpening(groupDigits(event.target.value))}/></label>}
      {employee && archive && !employee.archived && employee.debt !== 0 && <p className="kassa-error" role="alert">Diqqat: hodimning hisobi yopilmagan ({money(employee.debt, "USD")}). Arxivlansa ham qarz saqlanadi.</p>}
      {error && <p className="kassa-error" role="alert">{error}</p>}
      <div className="hodim-save"><button className="btn-g" disabled={pending}>{pending ? "Saqlanmoqda…" : employee ? "Saqlash" : "Qo‘shish"}</button></div>
    </form>
  </Sheet>;
}

const TITLES = { DEBT: "+ Qarz yozish", PAYMENT: "✓ To‘ladi", OPENING: "Boshlang‘ich qarz" };
export function DebtSheet({ employeeId, type, entry, notes, closeHref }: { employeeId: string; type: keyof typeof TITLES; entry?: { id: string; amount: number; note: string; occurredAt: string }; notes: string[]; closeHref: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(entry ? groupDigits(String(entry.amount)) : "");
  const [when, setWhen] = useState(() => entry ? toLocal(entry.occurredAt) : nowLocal());
  const { error, pending, submit } = useSave(saveDebtEntryAction, () => router.replace(closeHref, { scroll: false }));
  return <Sheet title={TITLES[type]} closeHref={closeHref}>
    <form action={submit} className="hodim-fields">
      <input type="hidden" name="employeeId" value={employeeId}/><input type="hidden" name="type" value={type}/>
      {entry && <input type="hidden" name="id" value={entry.id}/>}
      <label>Summa, $<input name="amount" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onChange={event => setAmount(groupDigits(event.target.value))} required autoFocus/></label>
      <label>Izoh<input name="note" list="hodim-notes" maxLength={300} autoComplete="off" defaultValue={entry?.note} placeholder="Masalan: Briliant 20 HP agregat"/></label>
      <datalist id="hodim-notes">{notes.map(note => <option key={note} value={note}/>)}</datalist>
      <label>Sana<input type="datetime-local" name="occurredAt" value={when} onChange={event => setWhen(event.target.value)} required/></label>
      {error && <p className="kassa-error" role="alert">{error}</p>}
      <div className="hodim-save"><button className="btn-g" disabled={pending}>{pending ? "Saqlanmoqda…" : "Saqlash"}</button></div>
    </form>
  </Sheet>;
}
