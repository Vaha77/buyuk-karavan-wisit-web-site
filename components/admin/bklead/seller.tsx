"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhoneCall, Plus, Search } from "lucide-react";
import { addMyCustomerAction, createPurchaseAction, recordContactAction, updateMyCustomerAction } from "@/app/admin/(seller)/my/actions";
import { CALL_INTERVALS, CONTACT_RESULTS, type ContactResult } from "@/lib/customers/seller-rules";
import { formatInt, formatUsd } from "@/lib/dashboard/format";
import { COUNTRY_CODES, COUNTRY_NAMES, regionsOf, type CountryCode } from "@/lib/dashboard/regions";
import { Dialog } from "./dialog";

export type SellerCustomerRow = { id: string; name: string; phone: string | null; region: string; callIntervalDays: number; days: number; due: "red" | "yellow" | null; nextContact: string | null };

const todayKey = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);

/** Own customers with a client-side search (the list itself is already scoped on the server). */
export function SellerCustomerList({ customers }: { customers: SellerCustomerRow[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("uz-UZ"), digits = value.replace(/\D/g, "");
    return value ? customers.filter(row => row.name.toLocaleLowerCase("uz-UZ").includes(value) || (digits.length >= 3 && (row.phone ?? "").replace(/\D/g, "").includes(digits))) : customers;
  }, [customers, query]);
  return <>
    <label className="bk-search"><Search size={15}/><span className="bk-sr-only">Qidirish</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ism yoki telefon"/></label>
    {shown.length ? <div className="bk-list sl-list">{shown.map(row => <Link key={row.id} href={`/admin/my/customers/${row.id}`} className="sl-row">
      <div className="bk-grow"><b>{row.name}</b><span>{[row.phone, row.region].filter(Boolean).join(" · ")}</span></div>
      <DaysBadge days={row.days} tone={row.due}/>
    </Link>)}</div> : <div className="bk-empty">{customers.length ? "Topilmadi." : "Hali mijoz yo‘q. “Yangi mijoz” tugmasi bilan qo‘shing."}</div>}
  </>;
}

export function DaysBadge({ days, tone }: { days: number; tone: "red" | "yellow" | null }) {
  return <span className={`sl-days${tone ? ` is-${tone}` : ""}`} title="Oxirgi xariddan beri">{days} kun</span>;
}

type CustomerFields = { name: string; phone: string; country: string; regionCode: string; note: string; callIntervalDays: number };
/** Add (phone required) or edit (phone fixed) the seller's own customer. */
export function SellerCustomerForm({ customer, onDone, regionCode }: { customer?: { id: string } & Omit<CustomerFields, "phone"> & { phone: string | null }; onDone?: () => void; regionCode?: string }) {
  const router = useRouter();
  const [values, setValues] = useState<CustomerFields>({ name: customer?.name ?? "", phone: customer?.phone ?? "", country: customer?.country ?? "UZ", regionCode: customer?.regionCode ?? regionCode ?? "", note: customer?.note ?? "", callIntervalDays: customer?.callIntervalDays ?? 60 });
  const [error, setError] = useState(""), [pending, startTransition] = useTransition();
  const set = <K extends keyof CustomerFields>(key: K, value: CustomerFields[K]) => setValues(current => ({ ...current, [key]: value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError("");
      const result = customer ? await updateMyCustomerAction(customer.id, values) : await addMyCustomerAction(values);
      if (!result.ok) { setError(result.error); return; }
      onDone?.(); if (!customer && result.id) router.push(`/admin/my/customers/${result.id}`); else router.refresh();
    });
  };
  return <form onSubmit={submit} style={{ display: "grid", gap: 12 }} aria-label={customer ? "Mijozni tahrirlash" : "Yangi mijoz"}>
    <div className="bk-row">
      <label className="bk-field"><span>Ism</span><input value={values.name} onChange={event => set("name", event.target.value)} maxLength={120} required/></label>
      <label className="bk-field"><span>Telefon{customer ? "" : " (majburiy)"}</span><input value={values.phone} onChange={event => set("phone", event.target.value)} inputMode="tel" placeholder="+998 90 123 45 67" required={!customer} disabled={!!customer}/></label>
    </div>
    <div className="bk-row">
      <label className="bk-field"><span>Davlat</span><select value={values.country} onChange={event => { set("country", event.target.value); set("regionCode", ""); }}>{COUNTRY_CODES.map(code => <option key={code} value={code}>{COUNTRY_NAMES[code]}</option>)}</select></label>
      <label className="bk-field"><span>Viloyat</span><select value={values.regionCode} onChange={event => set("regionCode", event.target.value)}><option value="">Tanlanmagan</option>{regionsOf(values.country as CountryCode).map(region => <option key={region.code} value={region.code}>{region.name}</option>)}</select></label>
      <label className="bk-field"><span>Qo‘ng‘iroq oralig‘i</span><select value={values.callIntervalDays} onChange={event => set("callIntervalDays", Number(event.target.value))}>{CALL_INTERVALS.map(days => <option key={days} value={days}>{days} kun</option>)}</select></label>
    </div>
    <label className="bk-field"><span>Izoh</span><input value={values.note} onChange={event => set("note", event.target.value)} maxLength={500}/></label>
    {error && <p className="bk-note is-soft" role="alert">{error}</p>}
    <div className="bk-actions" style={{ justifyContent: "flex-end" }}>{onDone && <button type="button" className="bk-btn" onClick={onDone}>Bekor qilish</button>}<button type="submit" className="bk-btn is-primary" disabled={pending}>{pending ? "Saqlanmoqda…" : "Saqlash"}</button></div>
  </form>;
}

/** `regionCode` pre-selects the region (the "Imkoniyat" region on the map). */
export function NewCustomerButton({ regionCode }: { regionCode?: string } = {}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="bk-btn is-primary" onClick={() => setOpen(true)}><Plus size={15}/>Yangi mijoz</button>
    {open && <Dialog title="Yangi mijoz" onClose={() => setOpen(false)} wide><SellerCustomerForm regionCode={regionCode} onDone={() => setOpen(false)}/></Dialog>}
  </>;
}

export function EditCustomerButton({ customer }: { customer: { id: string; name: string; phone: string | null; country: string; regionCode: string; note: string; callIntervalDays: number } }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="bk-btn" onClick={() => setOpen(true)}>Tahrirlash</button>
    {open && <Dialog title="Mijozni tahrirlash" onClose={() => setOpen(false)} wide><SellerCustomerForm customer={customer} onDone={() => setOpen(false)}/></Dialog>}
  </>;
}

/** "Qo‘ng‘iroq natijasi": result, note and the next contact date (empty = default by result). */
export function ContactButton({ customerId, customerName, compact = false }: { customerId: string; customerName: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [result, setResult] = useState<ContactResult>("CALLED"), [note, setNote] = useState(""), [next, setNext] = useState("");
  const [error, setError] = useState(""), [pending, startTransition] = useTransition();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError("");
      const saved = await recordContactAction(customerId, { result, note, nextContactAt: next });
      if (!saved.ok) { setError(saved.error); return; }
      setOpen(false); setNote(""); setNext(""); router.refresh();
    });
  };
  return <>
    <button type="button" className={`bk-btn${compact ? "" : " is-primary"}`} onClick={() => setOpen(true)}><PhoneCall size={15}/>Qo‘ng‘iroq natijasi</button>
    {open && <Dialog title={`Qo‘ng‘iroq natijasi — ${customerName}`} onClose={() => setOpen(false)} busy={pending}>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div className="sl-results" role="radiogroup" aria-label="Natija">{(Object.keys(CONTACT_RESULTS) as ContactResult[]).map(key => <button key={key} type="button" role="radio" aria-checked={result === key} className={`bk-chip${result === key ? " is-active" : ""}`} onClick={() => setResult(key)}>{CONTACT_RESULTS[key]}</button>)}</div>
        <label className="bk-field"><span>Izoh</span><input value={note} onChange={event => setNote(event.target.value)} maxLength={500}/></label>
        <label className="bk-field"><span>Keyingi qo‘ng‘iroq sanasi (ixtiyoriy)</span><input type="date" value={next} min={todayKey()} onChange={event => setNext(event.target.value)}/></label>
        <p className="bk-muted" style={{ fontSize: 12 }}>Bo‘sh qolsa: javob bermadi — ertaga, keyinroq — 3 kun, xarid kutilmoqda — 7 kun, qo‘ng‘iroq qildim — mijozning oralig‘i.</p>
        {error && <p className="bk-note is-soft" role="alert">{error}</p>}
        <div className="bk-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="bk-btn" onClick={() => setOpen(false)} disabled={pending}>Bekor qilish</button><button type="submit" className="bk-btn is-primary" disabled={pending}>{pending ? "Saqlanmoqda…" : "Saqlash"}</button></div>
      </form>
    </Dialog>}
  </>;
}

/** "Xarid kiritish": the purchase goes to the admin for approval (PENDING). */
export function PurchaseForm({ customers, fixedCustomerId, uzsPerUsd }: { customers: Array<{ id: string; name: string }>; fixedCustomerId?: string; uzsPerUsd: number | null }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? customers[0]?.id ?? ""), [date, setDate] = useState(todayKey()), [amount, setAmount] = useState(""), [currency, setCurrency] = useState<"USD" | "UZS">("USD"), [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null), [pending, startTransition] = useTransition();
  const number = Number(amount.replace(/[\s,]/g, "")), usd = currency === "USD" ? number : uzsPerUsd ? number / uzsPerUsd : 0;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setMessage(null);
      const result = await createPurchaseAction({ customerId, date, amount, currency, note });
      if (!result.ok) { setMessage({ ok: false, text: result.error }); return; }
      setAmount(""); setNote(""); setMessage({ ok: true, text: "Xarid yuborildi — admin tasdiqlagach statistikaga qo‘shiladi." }); router.refresh();
    });
  };
  if (!customers.length) return <div className="bk-empty">Avval mijoz qo‘shing.</div>;
  return <form onSubmit={submit} style={{ display: "grid", gap: 12 }} aria-label="Xarid kiritish">
    <div className="bk-row">
      {!fixedCustomerId && <label className="bk-field"><span>Mijoz</span><select value={customerId} onChange={event => setCustomerId(event.target.value)}>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>}
      <label className="bk-field"><span>Sana</span><input type="date" value={date} max={todayKey()} onChange={event => setDate(event.target.value)} required/></label>
    </div>
    <div className="bk-row">
      <label className="bk-field"><span>Summa</span><input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" placeholder={currency === "USD" ? "1 500" : "19 000 000"} required/></label>
      <label className="bk-field"><span>Valyuta</span><select value={currency} onChange={event => setCurrency(event.target.value as "USD" | "UZS")}><option value="USD">$ (USD)</option><option value="UZS">so‘m (UZS)</option></select></label>
    </div>
    {currency === "UZS" && number > 0 && <p className="bk-muted">{uzsPerUsd ? `≈ ${formatUsd(usd)} (CBU kursi ${formatInt(uzsPerUsd)})` : "CBU kursi hozir olinmadi — summani $ da kiriting."}</p>}
    <label className="bk-field"><span>Izoh</span><input value={note} onChange={event => setNote(event.target.value)} maxLength={500}/></label>
    {message && <p className={`bk-note${message.ok ? "" : " is-soft"}`} role="status">{message.text}</p>}
    <div className="bk-actions" style={{ justifyContent: "flex-end" }}><button type="submit" className="bk-btn is-primary" disabled={pending || !(number > 0) || !customerId}>{pending ? "Yuborilmoqda…" : "Tasdiqlashga yuborish"}</button></div>
  </form>;
}
