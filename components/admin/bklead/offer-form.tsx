"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, Send } from "lucide-react";
import { saveOfferAction, sendOfferTelegramAction } from "@/app/admin/(seller)/my/offers/actions";
import { formatUsd } from "@/lib/dashboard/format";

type Product = { id: string; title: string; category: string; baseUsd: number };
type Line = { category: string; productId: string; qty: string; markup: string };
type Initial = { customerId: string | null; customerName: string; customerPhone: string; markupPercent: number; lines: Array<{ productId: string; qty: number; markupPercent: number | null }> };

/** PDF / Telegram / copy for one saved offer. */
export function OfferActions({ id, copy = true }: { id: string; copy?: boolean }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null), [pending, startTransition] = useTransition();
  const send = () => startTransition(async () => { const result = await sendOfferTelegramAction(id); setMessage(result.ok ? { ok: true, text: "Telegram’ga yuborildi — mijozga forward qiling." } : { ok: false, text: result.error }); });
  return <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
    <div className="bk-actions">
      <a className="bk-btn" href={`/admin/my/offers/${id}/pdf?inline=1`} target="_blank" rel="noopener"><Eye size={14}/> Ko‘rish</a>
      <a className="bk-btn" href={`/admin/my/offers/${id}/pdf`} download><Download size={14}/> PDF yuklash</a>
      <button type="button" className="bk-btn" disabled={pending} onClick={send}><Send size={14}/> {pending ? "Yuborilmoqda…" : "Telegram’ga yuborish"}</button>
      {copy && <Link className="bk-btn" href={`/admin/my/offers/new?copy=${id}`}>Nusxalash</Link>}
    </div>
    {message && <span className={message.ok ? "bk-muted" : "sl-alert"} role="status" style={{ fontSize: 12 }}>{message.text}</span>}
  </div>;
}

/** Client prices here are only a preview; the server prices the offer from the Prays when it is saved. */
export function OfferForm({ products, customers, initial }: { products: Product[]; customers: Array<{ id: string; name: string; phone: string | null }>; initial?: Initial }) {
  const router = useRouter();
  const byId = new Map(products.map(product => [product.id, product]));
  const categories = [...new Set(products.map(product => product.category))];
  const [customerId, setCustomerId] = useState(initial?.customerId ?? ""), [name, setName] = useState(initial?.customerName ?? ""), [phone, setPhone] = useState(initial?.customerPhone ?? "");
  const [markup, setMarkup] = useState(String(initial?.markupPercent ?? 15));
  const [lines, setLines] = useState<Line[]>(initial?.lines.length ? initial.lines.map(line => ({ category: byId.get(line.productId)?.category ?? "", productId: byId.has(line.productId) ? line.productId : "", qty: String(line.qty), markup: line.markupPercent === null ? "" : String(line.markupPercent) })) : [{ category: "", productId: "", qty: "1", markup: "" }]);
  const [saved, setSaved] = useState<string | null>(null), [error, setError] = useState(""), [pending, startTransition] = useTransition();
  const update = (index: number, patch: Partial<Line>) => { setSaved(null); setLines(lines.map((line, i) => i === index ? { ...line, ...patch } : line)); };
  const percent = (value: string) => Number(value.replace(",", "."));
  const priceOf = (line: Line) => { const product = byId.get(line.productId); return product ? Math.round(product.baseUsd * (1 + (line.markup.trim() ? percent(line.markup) : percent(markup)) / 100) * 100) / 100 : 0; };
  const total = lines.reduce((sum, line) => sum + priceOf(line) * (Number(line.qty) || 0), 0);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError("");
      const result = await saveOfferAction({ customerId: customerId || null, customerName: name, customerPhone: phone, markupPercent: percent(markup), lines: lines.filter(line => line.productId).map(line => ({ productId: line.productId, qty: Number(line.qty), markupPercent: line.markup.trim() ? percent(line.markup) : null })) });
      if (!result.ok) { setError(result.error); return; }
      setSaved(result.id ?? null); router.refresh();
    });
  };
  return <form onSubmit={submit} className="bk-card" style={{ display: "grid", gap: 14 }} aria-label="Tijorat taklifi">
    <div className="bk-row">
      <label className="bk-field"><span>Mijoz</span><select value={customerId} onChange={event => { setCustomerId(event.target.value); setSaved(null); }}><option value="">Yangi mijoz (ism + telefon)</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      {!customerId && <><label className="bk-field"><span>Ism</span><input value={name} onChange={event => setName(event.target.value)} maxLength={120} required/></label><label className="bk-field"><span>Telefon</span><input value={phone} onChange={event => setPhone(event.target.value)} maxLength={40} inputMode="tel"/></label></>}
      <label className="bk-field"><span>Umumiy ustama, %</span><input value={markup} onChange={event => { setMarkup(event.target.value); setSaved(null); }} inputMode="decimal" required/></label>
    </div>
    <div style={{ display: "grid", gap: 8 }}>
      {lines.map((line, index) => <div key={index} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
        <label className="bk-field" style={{ flex: "1 1 150px" }}><span>Kategoriya</span><select value={line.category} onChange={event => update(index, { category: event.target.value, productId: "" })}><option value="">Tanlang</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
        <label className="bk-field" style={{ flex: "2 1 240px" }}><span>Mahsulot</span><select value={line.productId} onChange={event => update(index, { productId: event.target.value })} required><option value="">Tanlang</option>{products.filter(product => product.category === line.category).map(product => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label>
        <label className="bk-field" style={{ width: 80 }}><span>Soni</span><input value={line.qty} onChange={event => update(index, { qty: event.target.value.replace(/\D+/g, "") })} inputMode="numeric" required/></label>
        <label className="bk-field" style={{ width: 100 }}><span>Ustama %</span><input value={line.markup} onChange={event => update(index, { markup: event.target.value })} inputMode="decimal" placeholder={markup}/></label>
        <span style={{ minWidth: 90, textAlign: "right", fontWeight: 700, paddingBottom: 10 }}>{line.productId ? formatUsd(priceOf(line) * (Number(line.qty) || 0)) : "—"}</span>
        <button type="button" className="bk-btn" aria-label="Qatorni o‘chirish" onClick={() => { setSaved(null); setLines(lines.length > 1 ? lines.filter((_, i) => i !== index) : [{ category: "", productId: "", qty: "1", markup: "" }]); }}>×</button>
      </div>)}
      <button type="button" className="bk-btn" style={{ justifySelf: "start" }} onClick={() => setLines([...lines, { category: "", productId: "", qty: "1", markup: "" }])}>+ Mahsulot qo‘shish</button>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <strong style={{ fontSize: 18 }}>Jami: {formatUsd(total)}</strong>
      <button type="submit" className="bk-btn is-primary" disabled={pending}>{pending ? "Saqlanmoqda…" : "Saqlash"}</button>
    </div>
    {error && <p className="bk-note is-soft" role="alert">{error}</p>}
    {saved && <div className="bk-note" role="status" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span>Taklif saqlandi.</span><OfferActions id={saved} copy={false}/></div>}
  </form>;
}
