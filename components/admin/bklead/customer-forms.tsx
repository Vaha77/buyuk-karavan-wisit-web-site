"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { saveCustomerAction, savePrizesAction, saveTipsAction } from "@/app/admin/(protected)/customers/actions";
import { COUNTRY_CODES, COUNTRY_NAMES, regionName, regionsOf, type CountryCode } from "@/lib/dashboard/regions";

type Customer = { id: string; name: string; country: string; regionCode: string | null; phone: string | null; note: string | null; isActive: boolean; salesCount: number };

/** Regular customers list with inline add/edit (admins only). */
export function CustomersManager({ customers, canEdit, startNew }: { customers: Customer[]; canEdit: boolean; startNew: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(startNew && canEdit ? "new" : null);
  return <section className="bk-card" aria-labelledby="bk-customers-list-title">
    <div className="bk-card-head"><div><h2 id="bk-customers-list-title">Doimiy mijozlar</h2><span className="bk-muted">{customers.filter(item => item.isActive).length} ta faol · reytingda faqat faol mijozlar</span></div>{canEdit && editing !== "new" && <button type="button" className="bk-btn is-primary" onClick={() => setEditing("new")}><Plus size={15}/>Yangi doimiy mijoz</button>}</div>
    {editing === "new" && <CustomerForm onDone={() => setEditing(null)}/>}
    {customers.length ? <div className="bk-table-wrap"><table className="bk-table">
      <thead><tr><th>Mijoz</th><th className="is-left">Hudud</th><th className="is-left">Telefon</th><th>Kiritilgan oylar</th><th className="is-left">Holat</th>{canEdit && <th><span className="bk-sr-only">Amallar</span></th>}</tr></thead>
      <tbody>{customers.map(customer => editing === customer.id ? <tr key={customer.id}><td colSpan={canEdit ? 6 : 5} className="is-left"><CustomerForm customer={customer} onDone={() => setEditing(null)}/></td></tr> : <tr key={customer.id}>
        <td className="is-strong">{customer.name}</td><td className="is-left">{customer.regionCode ? regionName(customer.regionCode) : COUNTRY_NAMES[customer.country as CountryCode] ?? customer.country}</td>
        <td className="is-left bk-muted">{customer.phone || "—"}</td><td>{customer.salesCount}</td>
        <td className="is-left"><span className={`bk-badge${customer.isActive ? "" : " is-grey"}`}>{customer.isActive ? "Faol" : "Nofaol"}</span></td>
        {canEdit && <td><button type="button" className="bk-btn bk-icon-btn" onClick={() => setEditing(customer.id)} aria-label={`${customer.name} — tahrirlash`}><Pencil size={15}/></button></td>}
      </tr>)}</tbody>
    </table></div> : editing !== "new" && <div className="bk-empty">Hali doimiy mijoz yo‘q.</div>}
  </section>;
}

function CustomerForm({ customer, onDone }: { customer?: Customer; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(customer?.name ?? ""), [country, setCountry] = useState<CountryCode>((customer?.country as CountryCode) ?? "UZ"), [regionCode, setRegionCode] = useState(customer?.regionCode ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? ""), [note, setNote] = useState(customer?.note ?? ""), [isActive, setIsActive] = useState(customer?.isActive ?? true), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError("");
      const result = await saveCustomerAction(customer?.id ?? null, { name, country, regionCode, phone, note, isActive });
      if (!result.ok) { setError(result.error); return; }
      onDone(); router.refresh();
    });
  };
  return <form onSubmit={submit} style={{ display: "grid", gap: 12, padding: "12px 0" }} aria-label={customer ? `${customer.name} — tahrirlash` : "Yangi doimiy mijoz"}>
    <div className="bk-row">
      <label className="bk-field"><span>Mijoz nomi</span><input value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder="Mijoz A MChJ" required/></label>
      <label className="bk-field"><span>Davlat</span><select value={country} onChange={event => { setCountry(event.target.value as CountryCode); setRegionCode(""); }}>{COUNTRY_CODES.map(code => <option key={code} value={code}>{COUNTRY_NAMES[code]}</option>)}</select></label>
      <label className="bk-field"><span>Viloyat / hudud</span><select value={regionCode} onChange={event => setRegionCode(event.target.value)}><option value="">Tanlanmagan</option>{regionsOf(country).map(region => <option key={region.code} value={region.code}>{region.name}</option>)}</select></label>
    </div>
    <div className="bk-row">
      <label className="bk-field"><span>Telefon (ixtiyoriy)</span><input value={phone} onChange={event => setPhone(event.target.value)} maxLength={40} inputMode="tel"/></label>
      <label className="bk-field"><span>Izoh (ixtiyoriy)</span><input value={note} onChange={event => setNote(event.target.value)} maxLength={500}/></label>
      <label className="bk-field" style={{ alignContent: "end" }}><span><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} style={{ width: "auto", minHeight: 0, marginRight: 8 }}/>Faol (reytingda ko‘rinadi)</span></label>
    </div>
    {error && <p className="bk-note is-soft" role="alert">{error}</p>}
    <div className="bk-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="bk-btn" onClick={onDone}>Bekor qilish</button><button type="submit" className="bk-btn is-primary" disabled={pending || name.trim().length < 2}>{pending ? "Saqlanmoqda…" : "Saqlash"}</button></div>
  </form>;
}

/** Settings: prize text for places 1–3 of a year's regular customer ranking. */
export function PrizesForm({ year, prizes }: { year: number; prizes: Record<1 | 2 | 3, string> }) {
  const router = useRouter();
  const [values, setValues] = useState(prizes), [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const submit = (event: React.FormEvent) => { event.preventDefault(); startTransition(async () => { const result = await savePrizesAction(year, ([1, 2, 3] as const).map(place => ({ place, prizeText: values[place] }))); setMessage(result.ok ? "Saqlandi." : result.error); if (result.ok) router.refresh(); }); };
  return <form className="bk-card" onSubmit={submit} style={{ display: "grid", gap: 12 }} aria-labelledby="bk-prizes-title">
    <div><h2 id="bk-prizes-title">Doimiy mijozlar reytingi sovrinlari — {year}</h2><span className="bk-muted">Dashboard’dagi podiumda ko‘rinadi</span></div>
    <div className="bk-row">{([1, 2, 3] as const).map(place => <label className="bk-field" key={place}><span>{place}-o‘rin sovrini</span><input value={values[place]} maxLength={200} onChange={event => setValues(current => ({ ...current, [place]: event.target.value }))} placeholder={place === 1 ? "Masalan: sayohat" : ""}/></label>)}</div>
    <div className="bk-actions"><button type="submit" className="bk-btn is-primary" disabled={pending}>Saqlash</button>{message && <span className="bk-status-line is-ok" role="status">{message}</span>}</div>
  </form>;
}

const TIP_KEYS = [["all", "Barchasi"], ...COUNTRY_CODES.map(code => [code, COUNTRY_NAMES[code]] as const)] as const;
/** Settings: one-line tip under the map ranking, per tab. */
export function TipsForm({ tips }: { tips: Record<string, string> }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(TIP_KEYS.map(([key]) => [key, tips[key] ?? ""]))), [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const submit = (event: React.FormEvent) => { event.preventDefault(); startTransition(async () => { const result = await saveTipsAction(values); setMessage(result.ok ? "Saqlandi." : result.error); if (result.ok) router.refresh(); }); };
  return <form className="bk-card" onSubmit={submit} style={{ display: "grid", gap: 12 }} aria-labelledby="bk-tips-title">
    <div><h2 id="bk-tips-title">Xarita maslahatlari</h2><span className="bk-muted">“Hududlar bo‘yicha lidlar” reytingi ostidagi bir qatorli maslahat, har bir tab uchun</span></div>
    {TIP_KEYS.map(([key, label]) => <label className="bk-field" key={key}><span>{label}</span><input value={values[key]} maxLength={300} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))}/></label>)}
    <div className="bk-actions"><button type="submit" className="bk-btn is-primary" disabled={pending}>Saqlash</button>{message && <span className="bk-status-line is-ok" role="status">{message}</span>}</div>
  </form>;
}
