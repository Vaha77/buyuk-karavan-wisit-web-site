"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { loadCustomerYearAction, saveMonthlySaleAction } from "@/app/admin/(protected)/customers/actions";
import type { CustomerYearData } from "@/lib/customers/queries";
import { formatInt, formatUsd, MONTHS_LONG } from "@/lib/dashboard/format";
import { regionName } from "@/lib/dashboard/regions";
import { previewRank, rankCustomers } from "@/lib/dashboard/rules";

const MONTH_LETTERS = ["Y", "F", "M", "A", "M", "I", "I", "A", "S", "O", "N", "D"];

/** "Oylik savdo kiritish": button + dialog. The right panel previews the customer's year total and rank after saving. */
export function MonthlySaleButton({ data, now, uzsPerUsd }: { data: CustomerYearData; now: { year: number; month: number }; uzsPerUsd: number | null }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="bk-btn is-primary" onClick={() => setOpen(true)}><Plus size={15}/>Oylik savdo kiritish</button>
    {open && <MonthlySaleDialog data={data} now={now} uzsPerUsd={uzsPerUsd} onClose={() => setOpen(false)}/>}
  </>;
}

function MonthlySaleDialog({ data, now, uzsPerUsd, onClose }: { data: CustomerYearData; now: { year: number; month: number }; uzsPerUsd: number | null; onClose: () => void }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(data.customers[0]?.id ?? ""), [search, setSearch] = useState("");
  const [year, setYear] = useState(data.year), [month, setMonth] = useState(data.year === now.year ? now.month : 12);
  const [amount, setAmount] = useState(""), [currency, setCurrency] = useState<"USD" | "UZS">("USD"), [note, setNote] = useState("");
  const [yearData, setYearData] = useState(data), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) onClose(); };
    document.addEventListener("keydown", onKey); dialogRef.current?.querySelector<HTMLElement>("input,select")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);
  useEffect(() => {
    if (yearData.year === year) return;
    let active = true;
    void loadCustomerYearAction(year).then(result => { if (active) setYearData(result); });
    return () => { active = false; };
  }, [year, yearData.year]);

  const customers = useMemo(() => yearData.year === year ? yearData.customers : [], [yearData, year]);
  const filtered = data.customers.filter(customer => customer.name.toLocaleLowerCase("uz-UZ").includes(search.trim().toLocaleLowerCase("uz-UZ")));
  const amountNumber = Number(amount.replace(/\s/g, "").replace(",", "."));
  const amountUsd = !(amountNumber > 0) ? 0 : currency === "USD" ? amountNumber : uzsPerUsd ? amountNumber / uzsPerUsd : 0;
  const current = customers.find(customer => customer.id === customerId);
  const preview = useMemo(() => current && amountUsd ? previewRank(customers, customerId, month, amountUsd) : null, [current, customers, customerId, month, amountUsd]);
  const ranking = useMemo(() => rankCustomers(customers, year, now), [customers, year, now]);
  const thirdPlace = ranking[2]?.total ?? 0;
  const months = current?.months.map((value, index) => index === month - 1 && amountUsd ? amountUsd : value) ?? Array(12).fill(null);
  const maxMonth = Math.max(1, ...months.map(value => value || 0));
  const valid = !!customerId && amountNumber > 0 && (currency === "USD" || !!uzsPerUsd);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || pending) return;
    startTransition(async () => {
      setError("");
      const result = await saveMonthlySaleAction({ customerId, year, month, amount, currency, note });
      if (!result.ok) { setError(result.error); return; }
      onClose(); router.refresh();
    });
  };

  return <div className="bk-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <div ref={dialogRef} className="bk bk-dialog" role="dialog" aria-modal="true" aria-labelledby="bk-entry-title">
      <div className="bk-form-layout">
        <form onSubmit={submit} noValidate>
          <div className="bk-head"><div><h1 id="bk-entry-title">Oylik savdo kiritish</h1><p className="bk-muted">Doimiy mijozning oy davomidagi jami xaridi</p></div><button type="button" className="bk-btn bk-icon-btn" onClick={onClose} aria-label="Yopish"><X size={16}/></button></div>
          {!data.customers.length ? <div className="bk-empty"><strong>Hali doimiy mijoz yo‘q</strong><Link className="bk-btn is-primary" href="/admin/customers?new=1">+ Yangi doimiy mijoz qo‘shish</Link></div> : <>
            <div className="bk-field"><span id="bk-customer-label">Doimiy mijoz</span>
              {data.customers.length > 8 && <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Mijozni qidirish…" aria-label="Mijozni qidirish"/>}
              <select value={customerId} onChange={event => setCustomerId(event.target.value)} aria-labelledby="bk-customer-label">{filtered.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.regionCode ? ` — ${regionName(customer.regionCode).replace(/ viloyati$/, "")}` : ""}</option>)}</select>
            </div>
            <div className="bk-row">
              <label className="bk-field"><span>Yil</span><select value={year} onChange={event => setYear(Number(event.target.value))}>{[now.year, now.year - 1, now.year - 2].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="bk-field"><span>Oy</span><select value={month} onChange={event => setMonth(Number(event.target.value))}>{MONTHS_LONG.map((label, index) => <option key={label} value={index + 1} disabled={year === now.year && index + 1 > now.month}>{label}</option>)}</select></label>
            </div>
            <div className="bk-row" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)" }}>
              <label className="bk-field"><span>Savdo summasi</span><input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value.replace(/[^\d.,\s]/g, ""))} placeholder="1 050" aria-invalid={amount !== "" && !(amountNumber > 0)} required/></label>
              <label className="bk-field"><span>Valyuta</span><select value={currency} onChange={event => setCurrency(event.target.value as "USD" | "UZS")}><option value="USD">USD</option><option value="UZS">UZS</option></select></label>
            </div>
            {currency === "UZS" && <p className="bk-muted">{uzsPerUsd ? `USD ga Markaziy bank kursi bo‘yicha o‘tkaziladi: 1 USD = ${formatInt(uzsPerUsd)} so‘m.` : "Markaziy bank kursi hozir olinmadi — summani USD da kiriting."}</p>}
            <label className="bk-field"><span>Izoh (ixtiyoriy)</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="Masalan: 2 ta BR +20PG, montaj bilan"/></label>
            <p className="bk-note">Bu oy uchun oldin summa kiritilgan bo‘lsa, yangisi uning o‘rniga yoziladi va o‘zgarish faoliyat tarixida saqlanadi.</p>
            {error && <p className="bk-note is-soft" role="alert">{error}</p>}
            <div className="bk-toolbar"><Link href="/admin/customers?new=1" style={{ fontWeight: 700, textDecoration: "none" }}>+ Yangi doimiy mijoz qo‘shish</Link><div className="bk-actions"><button type="button" className="bk-btn" onClick={onClose}>Bekor qilish</button><button type="submit" className="bk-btn is-primary" disabled={!valid || pending}>{pending ? "Saqlanmoqda…" : "Saqlash"}</button></div></div>
          </>}
        </form>
        <aside className="bk-form-side" aria-label="Saqlangandan keyin" aria-live="polite">
          <span className="bk-eyebrow">Saqlangandan keyin</span>
          {current ? <>
            <div style={{ display: "grid", gap: 4 }}><span>{current.name} · {year} jami</span><strong className="bk-num" style={{ fontSize: 34 }}>{formatUsd(preview?.total ?? current.months.reduce<number>((sum, value) => sum + (value || 0), 0))}</strong><small>hozir {formatUsd(current.months.reduce<number>((sum, value) => sum + (value || 0), 0))}</small></div>
            <div className="bk-rank-box"><strong>{preview?.rank ?? (ranking.find(row => row.id === current.id)?.place ?? "—")}</strong><span>-o‘rin{preview ? preview.rank === preview.previousRank ? ", o‘zgarmaydi" : preview.rank < preview.previousRank ? `, ${preview.previousRank}-o‘rindan ko‘tariladi` : `, ${preview.previousRank}-o‘rindan tushadi` : ""}</span></div>
            <div style={{ display: "grid", gap: 6 }}><small>{year}-yil oylari</small>
              <div className="bk-mini-bars" aria-hidden="true">{months.map((value, index) => <i key={index} className={index === month - 1 ? "is-current" : value === null ? "is-empty" : ""} style={{ height: `${Math.max(4, ((value || 0) / maxMonth) * 100)}%` }}/>)}</div>
              <div className="bk-mini-labels" aria-hidden="true">{MONTH_LETTERS.map((letter, index) => <span key={index} className={index === month - 1 ? "is-current" : ""}>{letter}</span>)}</div>
            </div>
          </> : <small>Mijozni tanlang.</small>}
          <small style={{ marginTop: "auto" }}>Sovrin chegarasi: 3-o‘rin {thirdPlace ? formatUsd(thirdPlace) : "—"}</small>
        </aside>
      </div>
    </div>
  </div>;
}
