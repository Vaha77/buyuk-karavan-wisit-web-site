"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { saveKitAction } from "@/app/admin/(protected)/calculations/configurator/actions";
import { formatSignedUsd, formatUsd, sellPrice } from "@/lib/prays/rules";
import { KIT_MARKUP_MAX, kitClientPrice, type KitSelection, type KitSlot } from "@/lib/sex/configurator";
import type { KitView } from "@/lib/sex/kit-service";
import { BusyLabel } from "@/components/admin/feedback";

type Option = { id: string; name: string };
const SLOTS: Array<{ key: KitSlot; short: string; title: string }> = [
  { key: "comp", short: "KM", title: "KOMPRESSOR" },
  { key: "cond", short: "FN", title: "KONDENSATOR BLOKI · resiver + rama bilan" },
  { key: "evap", short: "DD", title: "ISPARITEL QISMI" },
];
const standardOf = (template: KitView): KitSelection => ({ comp: template.model, cond: template.fn, evap: template.evaporator });
const amount = (text: string) => { const value = Number(text.replace(",", ".").replace(/\s/g, "")); return Number.isFinite(value) && value > 0 ? value : 0; };

/** Everyone sees price-list and client prices; `showMargin` (SUPER_ADMIN) adds the tannarx / marja block. */
export function KitConfigurator({ templates, showMargin, usdToUzs, customers, leads }: { templates: KitView[]; showMargin: boolean; usdToUzs: number | null; customers: Option[]; leads: Option[] }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const template = templates.find(item => item.id === templateId) ?? templates[0];
  const [selection, setSelection] = useState<KitSelection | null>(template ? standardOf(template) : null);
  const [open, setOpen] = useState<KitSlot | null>("cond");
  const [markup, setMarkup] = useState(10);
  const [extras, setExtras] = useState([{ name: "Montaj", price: "" }]);
  const [customer, setCustomer] = useState(customers[0] ? `customer:${customers[0].id}` : "new");
  const [newName, setNewName] = useState(""), [newPhone, setNewPhone] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"save" | "pdf">("save");

  const chosen = useMemo(() => template && selection ? SLOTS.map(slot => ({ slot, option: template.options[slot.key].find(option => option.key === selection[slot.key]) ?? template.options[slot.key][0], standard: template.options[slot.key][0] })) : [], [template, selection]);
  const extrasTotal = extras.reduce((sum, extra) => sum + amount(extra.price), 0);
  const partsBase = chosen.reduce((sum, item) => sum + (item.option?.price ?? 0), 0);
  const baseAll = Math.round((partsBase + extrasTotal) * 100) / 100;
  const deltaFromStandard = Math.round(chosen.reduce((sum, item) => sum + (item.option?.price ?? 0) - (item.standard?.price ?? 0), 0) * 100) / 100;
  const changedCount = chosen.filter(item => item.option?.key !== item.standard?.key).length;
  const payload = template && selection ? { templateId: template.id, selection, markup, extras: extras.map(extra => ({ name: extra.name, price: amount(extra.price) })) } : null;

  const clientPrice = kitClientPrice(baseAll, markup);

  if (!template || !selection) return <div className="sx"><div className="sx-head"><div><span className="sx-crumb">Hisob-kitob / Yangi konfiguratsiya</span><h1>Komplekt konfiguratori</h1></div></div><p className="sx-note">Praysda prays narxi kiritilgan vazdushniy agregat komplekti (masalan “… vazdushniy agregat komplekti FN160 DD160”) hamda shu modelning agregati va kompressori kerak.</p></div>;

  const reset = () => { setSelection(standardOf(template)); setMarkup(10); setSaved(null); };
  const [kind, id] = customer.split(":");
  const save = (thenPdf: boolean) => startTransition(async () => {
    setMessage(null);
    let calculationId = saved;
    if (!calculationId) {
      const result = await saveKitAction({ ...payload!, customer: { kind: kind as "customer" | "lead" | "new", id: id ?? null, name: newName, phone: newPhone } });
      if (!result.ok) { setMessage({ ok: false, text: result.error }); return; }
      calculationId = result.id; setSaved(result.id);
    }
    setMessage({ ok: true, text: "Saqlandi — hisob-kitoblar ro‘yxatida" });
    // The PDF route answers with an attachment, so a download link click keeps this page open.
    if (thenPdf) { const link = document.createElement("a"); link.href = `/admin/calculations/${calculationId}/pdf`; link.download = ""; link.click(); }
  });
  const change = (next: () => void) => { next(); setSaved(null); setMessage(null); };

  return <div className="sx">
    <div className="sx-head">
      <div><span className="sx-crumb">Hisob-kitob / Yangi konfiguratsiya</span><h1>Komplekt konfiguratori</h1><p className="sx-lead">Hisob prays narxida · ustama faqat oxirida qo‘yiladi</p></div>
      <div className="sx-actions">
        <label className="sx-btn" style={{ fontWeight: 600, gap: 8 }}>Mijoz
          <select value={customer} onChange={event => change(() => setCustomer(event.target.value))} style={{ border: 0, background: "transparent", font: "inherit", color: "#1E4E8C", fontWeight: 700, maxWidth: 220 }}>
            <option value="new">+ Yangi mijoz</option>
            {customers.length > 0 && <optgroup label="Doimiy mijozlar">{customers.map(item => <option key={item.id} value={`customer:${item.id}`}>{item.name}</option>)}</optgroup>}
            {leads.length > 0 && <optgroup label="Lidlar">{leads.map(item => <option key={item.id} value={`lead:${item.id}`}>{item.name}</option>)}</optgroup>}
          </select></label>
        <button type="button" className="sx-btn is-outline" disabled={pending} onClick={() => { setAction("save"); save(false); }}><BusyLabel busy={pending && action === "save"}>{saved ? "✓ Saqlangan" : "Saqlash"}</BusyLabel></button>
        <button type="button" className="sx-btn is-primary" disabled={pending} onClick={() => { setAction("pdf"); save(true); }}><BusyLabel busy={pending && action === "pdf"} busyText="Tayyorlanmoqda…">Tijorat taklifi PDF</BusyLabel></button>
      </div>
    </div>
    {customer === "new" && <div className="sx-card" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 14 }}>
      <label className="sx-field" style={{ flex: "1 1 220px" }}>Yangi mijoz ismi<input value={newName} onChange={event => change(() => setNewName(event.target.value))} maxLength={160} placeholder="Rustam aka · Namangan"/></label>
      <label className="sx-field" style={{ flex: "1 1 180px" }}>Telefon<input value={newPhone} onChange={event => change(() => setNewPhone(event.target.value))} maxLength={40} inputMode="tel" placeholder="+998 90 123 45 67"/></label>
    </div>}
    {message && <p className={`sx-note ${message.ok ? "is-ok" : "is-error"}`} role={message.ok ? "status" : "alert"}>{message.text}{message.ok && saved && <> · <Link href={`/admin/calculations/${saved}`}>Hisob-kitobni ochish</Link></>}</p>}

    <div className="sx-split">
      <div className="sx-main">
        <div className="sx-card" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: "1 1 300px" }}>
            <span className="sx-section-label">Standart shablon · prays</span>
            <select className="sx-input" style={{ fontSize: 16, fontWeight: 800, height: 46 }} value={template.id} onChange={event => { const next = templates.find(item => item.id === event.target.value); change(() => { setTemplateId(event.target.value); if (next) setSelection(standardOf(next)); }); }} aria-label="Standart shablon">{templates.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
            <span className="sx-muted" style={{ fontSize: 13 }}>Prays narxi <b style={{ color: "#14213D" }}>{formatUsd(template.base)}</b> · saytda {formatUsd(template.sitePrice)}</span>
          </div>
          <div className="sx-actions">
            <span className={`sx-pill ${changedCount ? "is-yellow" : "is-green"}`}>{changedCount ? `${changedCount} ta qism o‘zgartirilgan` : "Standart holatda"}</span>
            <button type="button" className="sx-btn is-sm" style={{ height: 36 }} onClick={() => change(reset)}>Standartga qaytarish</button>
          </div>
        </div>

        {chosen.map(({ slot, option, standard }) => {
          const isOpen = open === slot.key, changed = option?.key !== standard?.key;
          return <div key={slot.key} className={`sx-card ${isOpen ? "is-focus" : ""}`}>
            <div className="sx-slot-top">
              <span className="sx-slot-icon">{slot.key === "evap" && option ? option.name.slice(0, 2) : slot.short}</span>
              <div className="sx-slot-text"><span className="sx-section-label" style={{ letterSpacing: ".04em" }}>{slot.title}</span><span style={{ fontSize: 17, fontWeight: 800 }}>{option?.name}</span>{option?.spec && <span className="sx-muted" style={{ fontSize: 13 }}>{option.spec}</span>}</div>
              {changed && <span className="sx-pill is-yellow">O‘zgartirildi · standart: {standard?.name}</span>}
              <span style={{ fontSize: 17, fontWeight: 800, minWidth: 80, textAlign: "right" }}>{formatUsd(option?.price ?? null)}</span>
              <button type="button" className={`sx-btn is-md ${isOpen ? "is-primary" : "is-outline"}`} onClick={() => setOpen(isOpen ? null : slot.key)}>{isOpen ? "Yopish" : "Almashtirish"}</button>
            </div>
            <div className="sx-source">Manba: {option?.source}</div>
            {isOpen && <div className="sx-options">{template.options[slot.key].map((item, index) => {
              const on = item.key === option?.key, diff = Math.round((item.price - (option?.price ?? 0)) * 100) / 100;
              return <button key={item.key} type="button" className="sx-option" aria-pressed={on} onClick={() => change(() => setSelection({ ...selection, [slot.key]: item.key }))}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}><b style={{ fontSize: 15 }}>{item.name}{index === 0 ? " · standart" : ""}</b><span style={{ fontSize: 13, fontWeight: 800, color: on ? "#1E4E8C" : diff > 0 ? "#14213D" : "#1B6B43" }}>{on ? "tanlangan" : formatSignedUsd(diff)}</span></span>
                {item.spec && <span className="sx-muted">{item.spec}</span>}
                <span style={{ fontSize: 13, fontWeight: 700 }}>Prays: {formatUsd(item.price)} · <span style={{ color: "#1E4E8C" }}>Sotuv: {formatUsd(sellPrice(item.price, markup))}</span></span>
              </button>;
            })}</div>}
          </div>;
        })}

        <div className="sx-card" style={{ gap: 12 }}>
          <div className="sx-card-head"><h3>Qo‘shimchalar <span className="sx-muted" style={{ fontSize: 13, fontWeight: 600 }}>· prays narxida</span></h3><button type="button" className="sx-btn is-dashed" style={{ height: 36 }} onClick={() => change(() => setExtras([...extras, { name: "", price: "" }]))}>+ Qator qo‘shish</button></div>
          {extras.map((extra, index) => <div key={index} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10, padding: "8px 0", borderTop: "1px solid #EEF1F6" }}>
            <label className="sx-field" style={{ flex: "1 1 220px", fontSize: 12, color: "#4F5A70" }}>Nomi<input value={extra.name} onChange={event => change(() => setExtras(extras.map((row, i) => i === index ? { ...row, name: event.target.value } : row)))} maxLength={200} style={{ height: 40, fontSize: 14 }}/></label>
            <label className="sx-field" style={{ width: 140, fontSize: 12, color: "#4F5A70" }}>Narx, $<input value={extra.price} onChange={event => change(() => setExtras(extras.map((row, i) => i === index ? { ...row, price: event.target.value } : row)))} inputMode="decimal" placeholder="0" style={{ height: 40, fontSize: 14 }}/></label>
            <button type="button" className="sx-btn is-danger-ghost" style={{ width: 40, height: 40, padding: 0, fontSize: 18 }} onClick={() => change(() => setExtras(extras.filter((_, i) => i !== index)))} aria-label="Qatorni o‘chirish">×</button>
          </div>)}
        </div>
      </div>

      <div className="sx-side">
        <div className="sx-card" style={{ gap: 10 }}>
          <h3>Hisob · prays narxida</h3>
          {chosen.map(({ slot, option }) => <div key={slot.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14 }}><span style={{ color: "#3E4A60" }}>{option?.name}</span><b>{formatUsd(option?.price ?? null)}</b></div>)}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span style={{ color: "#3E4A60" }}>Qo‘shimchalar</span><b>{formatUsd(extrasTotal)}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 10, borderTop: "1px solid #EEF1F6" }}><span style={{ fontSize: 14, fontWeight: 800 }}>Prays jami</span><span style={{ fontSize: 20, fontWeight: 800 }}>{formatUsd(baseAll)}</span></div>
          <span className="sx-muted" style={{ fontWeight: 700, color: deltaFromStandard === 0 ? "#1B6B43" : "#6E5200" }}>{deltaFromStandard === 0 ? "Standart komplekt bilan bir xil" : `Standart komplektdan ${formatSignedUsd(deltaFromStandard)} (qismlar bo‘yicha)`}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, marginTop: 6, borderRadius: 12, background: "#EAF1FB" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 14, fontWeight: 800 }}>Ustama</span><span style={{ fontSize: 22, fontWeight: 800, color: "#1E4E8C" }}>{markup}%</span></div>
            <input type="range" min={0} max={KIT_MARKUP_MAX} step={1} value={markup} onChange={event => change(() => setMarkup(Number(event.target.value)))} aria-label="Ustama foizi" style={{ width: "100%", accentColor: "#1E4E8C" }}/>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[0, 5, 10, 15].map(value => <button key={value} type="button" className="sx-btn is-sm" style={{ minWidth: 52, ...(markup === value ? { background: "#1E4E8C", color: "#fff", borderColor: "#1E4E8C" } : {}) }} onClick={() => change(() => setMarkup(value))}>{value}%</button>)}</div>
            <span className="sx-muted" style={{ color: "#3E4A60" }}>0% dan 15% gacha</span>
          </div>
          <div className="sx-total"><span style={{ fontSize: 15 }}>Mijoz uchun narx</span><strong style={{ fontSize: 30 }}>{formatUsd(clientPrice)}</strong></div>
          {showMargin && <div className="sx-note is-info" style={{ display: "grid", gap: 2 }}><b>Tannarx / marja · faqat Super Admin</b><span>Prays jami {formatUsd(baseAll)} → mijoz narxi {formatUsd(clientPrice)} · marja {formatUsd(Math.round((clientPrice - baseAll) * 100) / 100)}{baseAll > 0 ? ` (${(Math.round((clientPrice - baseAll) / baseAll * 1000) / 10).toString().replace(".", ",")}%)` : ""}</span></div>}
          <span className="sx-muted">Butun dollarga yuqoriga yaxlitlangan{usdToUzs ? ` · ≈ ${String(Math.round(clientPrice * usdToUzs)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so‘m (CBU)` : ""}</span>
        </div>
      </div>
    </div>
  </div>;
}
