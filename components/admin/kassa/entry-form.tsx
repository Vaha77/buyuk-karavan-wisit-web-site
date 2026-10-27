"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { createCategoryAction, saveEntryAction } from "@/app/admin/(protected)/kassa/actions";
import { DeleteEntryButton } from "./delete-entry";
import { money, PAYMENTS, suggestNotes, type Currency, type EntryType, type NoteHint, type Payment } from "@/lib/kassa/rules";

type Category = { id: string; name: string; type: EntryType; icon: string | null; archived?: boolean };
export type EditingEntry = { id: string; draftId?: string; type: EntryType; amount: number; currency: Currency; categoryId: string; paymentType: Payment; note: string; occurredAt: string; receiptUrl: string | null; logs: Array<{ at: string; user: string; changes: Record<string, [string | null, string | null]> }> };

const nowLocal = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 16);
const toLocal = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 16);
/** "1200000" → "1 200 000" while typing; one decimal point, 2 decimals. */
const groupDigits = (value: string) => { const [whole, part] = value.replace(/[^\d.,]/g, "").replace(",", ".").split("."); return whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (part !== undefined ? `.${part.slice(0, 2)}` : ""); };
/** The bottom bar "+" on this page (components/admin/admin-shell.tsx). */
const KASSA_NEW = "/admin/kassa#new";
const FIELD_NAMES: Record<string, string> = { deletedAt: "O‘chirilgan", deleteReason: "Sabab", type: "Turi", amount: "Summa", currency: "Valyuta", categoryId: "Kategoriya", paymentType: "To‘lov", note: "Izoh", occurredAt: "Sana", receiptUrl: "Chek" };

export function KassaEntryForm({ categories: initial, history, editing, closeHref }: { categories: Category[]; history: NoteHint[]; editing: EditingEntry | null; closeHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState(initial);
  const [type, setType] = useState<EntryType>(editing?.type ?? "IN");
  const [amount, setAmount] = useState(editing?.amount ? groupDigits(String(editing.amount)) : "");
  const [currency, setCurrency] = useState<Currency>(editing?.currency ?? "USD");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [payment, setPayment] = useState<Payment>(editing?.paymentType ?? "CASH");
  const [note, setNote] = useState(editing?.note ?? "");
  const [when, setWhen] = useState(editing ? toLocal(editing.occurredAt) : nowLocal);
  const [focus, setFocus] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const sheet = open || !!editing;

  // The bottom bar's "+" (href KASSA_NEW on this page) opens the sheet instead of navigating; capture runs before next/link.
  useEffect(() => {
    const onClick = (event: MouseEvent) => { if ((event.target as Element).closest?.(`a[href="${KASSA_NEW}"]`)) { event.preventDefault(); setOpen(true); } };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  // Phone sheet: hide the bottom bar and fit the visible viewport, so "Saqlash" stays above the keyboard.
  useEffect(() => {
    document.body.classList.toggle("kassa-sheet-open", sheet);
    const view = window.visualViewport, form = formRef.current;
    if (!sheet || !view || !form || !matchMedia("(max-width: 1000px)").matches) return () => document.body.classList.remove("kassa-sheet-open");
    const fit = () => { form.style.height = `${view.height}px`; form.style.top = `${view.offsetTop}px`; };
    fit(); view.addEventListener("resize", fit); view.addEventListener("scroll", fit);
    return () => { view.removeEventListener("resize", fit); view.removeEventListener("scroll", fit); form.style.height = form.style.top = ""; document.body.classList.remove("kassa-sheet-open"); };
  }, [sheet]);

  const chips = categories.filter(category => category.type === type && (!category.archived || category.id === categoryId));
  const hints = focus ? suggestNotes(history, note, type) : [];
  const nameOf = (id: string | null) => categories.find(category => category.id === id)?.name ?? id;

  function pickType(next: EntryType) { setType(next); if (categories.find(category => category.id === categoryId)?.type !== next) setCategoryId(""); }
  function applyHint(hint: NoteHint) { setNote(hint.note); setCategoryId(hint.categoryId); setAmount(groupDigits(String(hint.amount))); setCurrency(hint.currency); setFocus(false); }
  function addCategory() {
    if (!newName?.trim()) return setNewName(null);
    start(async () => {
      const result = await createCategoryAction(newName, type);
      if (!result.ok) return setError(result.error);
      setCategories(list => [result.category, ...list]); setCategoryId(result.category.id); setNewName(null);
    });
  }
  function submit(form: FormData) {
    if (!categoryId) return setError("Kategoriyani tanlang.");
    setError("");
    start(async () => {
      const result = await saveEntryAction(form);
      if (!result.ok) return setError(result.error);
      if (editing) return router.replace(closeHref, { scroll: false });
      setAmount(""); setNote(""); setWhen(nowLocal()); setOpen(false);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return <form ref={formRef} action={submit} className={`glass kassa-form${sheet ? " is-open" : ""}`} aria-label={editing ? "Yozuvni tuzatish" : "Tez yozuv"}>
      <div className="kassa-form-head">
        <b>{editing?.draftId ? "Botdan kelgan yozuv" : editing ? "Yozuvni tuzatish" : "Tez yozuv"}</b>
        {editing ? <Link href={closeHref} scroll={false} aria-label="Yopish"><X size={18}/></Link> : <button type="button" className="kassa-close" aria-label="Yopish" onClick={() => setOpen(false)}><X size={18}/></button>}
      </div>
      {editing?.id && <input type="hidden" name="id" value={editing.id}/>}{editing?.draftId && <input type="hidden" name="draftId" value={editing.draftId}/>}
      <input type="hidden" name="type" value={type}/><input type="hidden" name="currency" value={currency}/><input type="hidden" name="categoryId" value={categoryId}/><input type="hidden" name="paymentType" value={payment}/>
      <div className="kassa-io" role="group" aria-label="Turi">
        <button type="button" className={type === "IN" ? "is-in" : undefined} aria-pressed={type === "IN"} onClick={() => pickType("IN")}>↓ Kirim</button>
        <button type="button" className={type === "OUT" ? "is-out" : undefined} aria-pressed={type === "OUT"} onClick={() => pickType("OUT")}>↑ Chiqim</button>
      </div>
      <div className="kassa-amount">
        <input name="amount" inputMode="decimal" autoComplete="off" placeholder="0" aria-label="Summa" value={amount} onChange={event => setAmount(groupDigits(event.target.value))} required/>
        <div className="seg" role="group" aria-label="Valyuta">{(["USD", "UZS"] as const).map(item => <button key={item} type="button" className={currency === item ? "on" : undefined} aria-pressed={currency === item} onClick={() => setCurrency(item)}>{item === "USD" ? "$" : "so‘m"}</button>)}</div>
      </div>
      <p className="kassa-label">{type === "IN" ? "Qayerdan keldi?" : "Nimaga ketdi?"}</p>
      <div className="kassa-chips">
        {chips.map(category => <button key={category.id} type="button" className={`chip${categoryId === category.id ? " on" : ""}`} aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>{category.icon} {category.name}</button>)}
        {newName === null
          ? <button type="button" className="chip dash kassa-new" onClick={() => setNewName("")}>+ Yangi</button>
          : <span className="kassa-newcat"><input autoFocus maxLength={60} placeholder="Kategoriya nomi" value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addCategory(); } if (event.key === "Escape") setNewName(null); }}/><button type="button" className="chip" onClick={addCategory} disabled={pending}>Qo‘shish</button></span>}
      </div>
      <p className="kassa-label">To‘lov turi</p>
      <div className="kassa-chips">{(Object.keys(PAYMENTS) as Payment[]).map(item => <button key={item} type="button" className={`chip${payment === item ? " on" : ""}`} aria-pressed={payment === item} onClick={() => setPayment(item)}>{PAYMENTS[item]}</button>)}</div>
      <p className="kassa-label">Izoh — o‘zingiz yozasiz</p>
      <div className="kassa-note">
        <input name="note" maxLength={300} autoComplete="off" placeholder="Masalan: UCS yo‘lkira — Toshkentdan" aria-label="Izoh" value={note} onChange={event => setNote(event.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} required/>
        {hints.length > 0 && <div className="kassa-hints" role="listbox">{hints.map(hint => <button key={hint.note} type="button" role="option" aria-selected={false} onMouseDown={event => event.preventDefault()} onClick={() => applyHint(hint)}>{hint.note}<span>oxirgi: {money(hint.amount, hint.currency)}</span></button>)}</div>}
      </div>
      <label className="kassa-file"><Camera size={18}/>{editing?.receiptUrl ? "Chek bor — almashtirish" : "Chek rasmi (ixtiyoriy)"}<input ref={fileRef} type="file" name="receipt" accept="image/jpeg,image/png,image/webp" capture="environment"/></label>
      {editing?.receiptUrl && <a className="kassa-receipt" href={editing.receiptUrl} target="_blank" rel="noreferrer">Chekni ko‘rish</a>}
      <label className="kassa-when">Sana<input type="datetime-local" name="occurredAt" value={when} onChange={event => setWhen(event.target.value)} required/></label>
      {error && <p className="kassa-error" role="alert">{error}</p>}
      {editing && editing.logs.length > 0 && <div className="kassa-log"><p className="kassa-label">Tuzatishlar tarixi</p>{editing.logs.map(log => <div key={log.at}><span>{toLocal(log.at).replace("T", " ")} · {log.user}</span>{Object.entries(log.changes).map(([field, [from, to]]) => <small key={field}>{FIELD_NAMES[field] ?? field}: {field === "categoryId" ? nameOf(from) : field === "occurredAt" && from ? toLocal(from).replace("T", " ") : from ?? "—"} → {field === "categoryId" ? nameOf(to) : field === "occurredAt" && to ? toLocal(to).replace("T", " ") : to ?? "—"}</small>)}</div>)}</div>}
      <div className="kassa-save"><button type="submit" className="btn-g" disabled={pending}>{pending ? "Saqlanmoqda…" : editing?.draftId ? "Tasdiqlash · Enter" : editing ? "Tuzatishni saqlash · Enter" : "Saqlash · Enter"}</button>{editing?.id && <DeleteEntryButton ghost id={editing.id} label={`${money(editing.type === "IN" ? editing.amount : -editing.amount, editing.currency, true)} · ${editing.note}`}/>}</div>
    </form>;
}
