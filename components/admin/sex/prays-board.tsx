"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import { applyMarkupAction, confirmPreviewAction, createPartAction, previewExcelAction, previewImageAction, previewPercentAction, removeEntryAction, updateBaseAction, type PreviewResult } from "@/app/admin/(protected)/prays/actions";
import type { HistoryEntry, PraysPart, PraysProduct } from "@/lib/prays/queries";
import { BusyLabel, DownloadButton, PendingArea } from "@/components/admin/feedback";
import { CHANGE_LABEL, MARKUP_MAX, MARKUP_MIN, STALE_PRICE_LIST_DAYS, daysSince, formatShortDate, formatUsd, sellPrice, type ChangeStatus } from "@/lib/prays/rules";

type Row = { id: string; entityType: "PRODUCT" | "SEX_PART"; name: string; tag: string; base: number | null; sale: number | null; date: string | null };
type Preview = Extract<PreviewResult, { ok: true }>;
const STATUS_TONE: Record<ChangeStatus, string> = { UP: "is-orange", DOWN: "is-green", NEW: "is-blue", SAME: "is-grey", NOT_FOUND: "is-red" };
const today = () => new Date().toISOString().slice(0, 10);

export function PraysBoard({ products, parts, markup, history }: { products: PraysProduct[]; parts: PraysPart[]; markup: number; history: HistoryEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Tab / chip switch re-renders hundreds of rows: keep the old table visible, dimmed, meanwhile.
  const [filtering, startFilter] = useTransition();
  const [tab, setTab] = useState<"ready" | "sex">("ready");
  const [chip, setChip] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [percentOpen, setPercentOpen] = useState(false);
  const [percentScope, setPercentScope] = useState("product:all");
  const [percentValue, setPercentValue] = useState("+5");
  const [markupDraft, setMarkupDraft] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const excelInput = useRef<HTMLInputElement>(null), imageInput = useRef<HTMLInputElement>(null);

  const brands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) counts.set(product.brand, (counts.get(product.brand) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [products]);
  const groups = useMemo(() => [...new Set(parts.map(part => part.group))].sort(), [parts]);

  const rows: Row[] = useMemo(() => tab === "ready"
    ? products.map(product => ({ id: product.id, entityType: "PRODUCT" as const, name: product.name, tag: product.brand, base: product.basePriceUsd, sale: product.basePriceUsd === null ? product.priceUsd : sellPrice(product.basePriceUsd, markup), date: product.priceListDate }))
    : parts.map(part => ({ id: part.id, entityType: "SEX_PART" as const, name: [part.name, part.size].filter(Boolean).join(" "), tag: part.group, base: part.basePriceUsd, sale: part.basePriceUsd === null ? null : sellPrice(part.basePriceUsd, markup), date: part.priceListDate })),
  [tab, products, parts, markup]);
  const needle = query.trim().toLowerCase(), compact = needle.replace(/[^a-z0-9]+/g, "");
  const visible = rows.filter(row => (chip === "all" || row.tag === chip) && (!needle || row.name.toLowerCase().includes(needle) || (compact && row.name.toLowerCase().replace(/[^a-z0-9]+/g, "").includes(compact))));

  const oldest = useMemo(() => {
    const dated = [...products.map(product => ({ label: product.brand, date: product.priceListDate })), ...parts.map(part => ({ label: `Sex · ${part.group}`, date: part.priceListDate }))].filter(item => item.date) as Array<{ label: string; date: string }>;
    dated.sort((a, b) => a.date.localeCompare(b.date));
    return dated[0] ?? null;
  }, [products, parts]);
  const oldestDays = oldest ? daysSince(new Date(oldest.date)) : null;
  const undated = products.filter(product => !product.priceListDate).length;

  const markupPreview = useMemo(() => {
    if (markupDraft === null) return null;
    const changed = products.filter(product => product.basePriceUsd !== null && sellPrice(product.basePriceUsd, markupDraft) !== product.priceUsd);
    const example = changed[0];
    return { count: changed.length, example: example ? `${example.name}: ${formatUsd(example.priceUsd)} → ${formatUsd(sellPrice(example.basePriceUsd!, markupDraft))}` : null };
  }, [markupDraft, products]);

  const run = (task: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) => startTransition(async () => {
    setMessage(null);
    const result = await task();
    if (!result.ok) { setMessage({ tone: "error", text: result.error }); return; }
    after?.();
    if (result.message) setMessage({ tone: "ok", text: result.message });
    router.refresh();
  });
  const runPreview = (task: () => Promise<PreviewResult>) => startTransition(async () => {
    setMessage(null); setPercentOpen(false);
    const result = await task();
    if (!result.ok) { setMessage({ tone: "error", text: result.error }); return; }
    setPreview(result); setShowMissing(false);
  });
  const upload = (file: File | undefined, kind: "excel" | "image") => {
    if (!file) return;
    const form = new FormData(); form.set("file", file);
    runPreview(() => kind === "excel" ? previewExcelAction(form) : previewImageAction(form));
  };

  const found = preview?.rows.filter(row => row.status !== "NOT_FOUND") ?? [];
  const missing = preview?.rows.filter(row => row.status === "NOT_FOUND") ?? [];
  const count = (status: ChangeStatus) => found.filter(row => row.status === status).length;
  const confirmPreview = () => preview && run(() => confirmPreviewAction({ source: preview.source, priceListName: preview.priceListName, listDate: preview.listDate, rows: found.map(row => ({ entityType: row.entityType, entityId: row.entityId, newBase: row.newBase, create: row.create })) }), () => setPreview(null));

  const saveEdit = (row: Row) => {
    const value = Number((editing?.draft ?? "").replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) { setMessage({ tone: "error", text: "Narxni to‘g‘ri kiriting." }); return; }
    run(() => updateBaseAction({ entityType: row.entityType, id: row.id, base: value }), () => setEditing(null));
  };
  const pctNumber = Number(percentValue.replace(",", ".").replace(/\s/g, ""));

  return <div className="sx">
    <div className="sx-head">
      <div><span className="sx-crumb">Admin / Prays · faqat Super Admin</span><h1>Prays</h1><p className="sx-lead">Barcha narxlarning yagona manbai · katalog, konfigurator, zborka va sex shu yerdan oladi</p></div>
      <div className="sx-actions">
        <DownloadButton className="sx-btn" href="/admin/prays/export" fallbackName="prays.xlsx"/>
        <button type="button" className="sx-btn is-outline" disabled={pending} onClick={() => excelInput.current?.click()}>Excel yuklash</button>
        <button type="button" className="sx-btn is-outline" disabled={pending} onClick={() => imageInput.current?.click()}>Rasm orqali (AI)</button>
        <button type="button" className="sx-btn is-primary" disabled={pending} onClick={() => { setPercentOpen(open => !open); setPreview(null); setPercentScope(tab === "ready" ? "product:all" : "part:all"); }}>Foiz bilan o‘zgartirish</button>
        <input ref={excelInput} className="sx-hidden-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" tabIndex={-1} aria-hidden onChange={event => { upload(event.target.files?.[0], "excel"); event.target.value = ""; }}/>
        <input ref={imageInput} className="sx-hidden-input" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-hidden onChange={event => { upload(event.target.files?.[0], "image"); event.target.value = ""; }}/>
      </div>
    </div>

    <div className="sx-stats">
      <div className="sx-stat"><span>Tayyor mahsulotlar</span><strong>{products.length}</strong><small>{brands.map(([brand, n]) => `${brand} ${n}`).join(" · ") || "—"}</small></div>
      <div className="sx-stat"><span>Sex zapchastlari</span><strong>{parts.length}</strong><small>{groups.length} tur · o‘lchamlari bilan</small></div>
      <div className="sx-stat is-blue"><label htmlFor="prays-markup">Sotuv ustamasi</label>
        <select id="prays-markup" value={markupDraft ?? markup} disabled={pending} onChange={event => { const value = Number(event.target.value); setMarkupDraft(value === markup ? null : value); }}>
          {Array.from({ length: MARKUP_MAX - MARKUP_MIN + 1 }, (_, index) => MARKUP_MIN + index).map(value => <option key={value} value={value}>+{value}%</option>)}
        </select>
        <small>sotuv narxlari tasdiqlangach qayta hisoblanadi</small></div>
      <div className={`sx-stat ${oldestDays !== null && oldestDays >= STALE_PRICE_LIST_DAYS ? "is-yellow" : ""}`}><span>Eng eski prays</span>
        <strong>{oldestDays === null ? "—" : `${oldestDays} kun`}</strong>
        <small>{oldest ? `${oldest.label} · ${formatShortDate(new Date(oldest.date))}${oldestDays! >= STALE_PRICE_LIST_DAYS ? " — yangilashni tekshiring" : ""}` : "Prays sanasi hali kiritilmagan"}{undated ? ` · ${undated} ta sanasiz` : ""}</small></div>
    </div>

    {message && <p className={`sx-note ${message.tone === "ok" ? "is-ok" : "is-error"}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}
    {pending && !preview && <p className="sx-note is-info" role="status">Bajarilmoqda…</p>}

    {markupPreview && <div className="sx-card is-focus">
      <div className="sx-card-head"><div><h2>Ustama: +{markup}% → +{markupDraft}%</h2><span className="sx-muted">{markupPreview.count} ta sotuv narxi o‘zgaradi{markupPreview.example ? `, masalan ${markupPreview.example}` : ""} · prays narxi kiritilmagan mahsulotlarga tegilmaydi</span></div>
        <div className="sx-actions"><button type="button" className="sx-btn" onClick={() => setMarkupDraft(null)} disabled={pending}>Bekor qilish</button><button type="button" className="sx-btn is-green" disabled={pending} onClick={() => run(() => applyMarkupAction(markupDraft), () => setMarkupDraft(null))}><BusyLabel busy={pending}>Tasdiqlash</BusyLabel></button></div></div>
    </div>}

    {percentOpen && <div className="sx-card is-focus" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
      <label className="sx-field">Qaysi narxlar
        <select value={percentScope} onChange={event => setPercentScope(event.target.value)} style={{ minWidth: 220 }}>
          <option value="product:all">Tayyor mahsulotlar — hammasi ({products.length})</option>
          {brands.map(([brand, n]) => <option key={brand} value={`product:${brand}`}>{brand} — hammasi ({n})</option>)}
          {parts.length > 0 && <option value="part:all">Sex — hammasi ({parts.length})</option>}
          {groups.map(group => <option key={group} value={`part:${group}`}>Sex — {group}</option>)}
        </select></label>
      <label className="sx-field">Foiz<input value={percentValue} onChange={event => setPercentValue(event.target.value)} inputMode="decimal" style={{ width: 100, fontWeight: 700 }}/></label>
      <div className="sx-actions" style={{ marginLeft: "auto" }}><button type="button" className="sx-btn" onClick={() => setPercentOpen(false)}>Bekor qilish</button><button type="button" className="sx-btn is-primary" disabled={pending || !Number.isFinite(pctNumber) || pctNumber === 0} onClick={() => runPreview(() => previewPercentAction({ scope: percentScope, percent: pctNumber }))}><BusyLabel busy={pending} busyText="Tahlil qilinmoqda…">Ko‘rib chiqish</BusyLabel></button></div>
    </div>}

    {preview && <div className="sx-card is-focus">
      <div className="sx-card-head">
        <div><h2>Yangi prays: tekshirib tasdiqlang</h2><span className="sx-muted">{preview.source === "PERCENT" ? "Foiz bilan" : "Fayl"}: {preview.fileName}{preview.priceListName ? ` · ${preview.priceListName}` : ""} · {count("UP") + count("DOWN")} ta narx o‘zgaradi · {count("NEW")} ta yangi · {count("SAME")} ta o‘zgarmaydi{missing.length ? ` · ${missing.length} ta topilmadi` : ""}</span></div>
        <div className="sx-actions"><button type="button" className="sx-btn" onClick={() => setPreview(null)} disabled={pending}>Bekor qilish</button><button type="button" className="sx-btn is-green" disabled={pending || !found.length} onClick={confirmPreview}><BusyLabel busy={pending}>Tasdiqlash</BusyLabel></button></div>
      </div>
      {found.length > 0 ? <PreviewTable rows={found}/> : <p className="sx-note">Praysdagi qatorlarga mos mahsulot topilmadi — hech narsa o‘zgarmaydi.</p>}
      {missing.length > 0 && <div style={{ display: "grid", gap: 8 }}>
        <button type="button" className="sx-btn is-sm" style={{ justifySelf: "start" }} onClick={() => setShowMissing(open => !open)} aria-expanded={showMissing}>Topilmadi: {missing.length} ta {showMissing ? "· yashirish" : "· ko‘rish"}</button>
        {showMissing && <><span className="sx-muted">Bu qatorlar saytdagi mahsulotlarga mos kelmadi — avtomatik yaratilmaydi, o‘zgartirilmaydi.</span><PreviewTable rows={missing}/></>}
      </div>}
    </div>}

    <div className="sx-split">
      <div className="sx-card" style={{ flex: "999 1 720px" }}>
        <div className="sx-card-head">
          <div className="sx-tabs" role="tablist" aria-label="Prays turi">
            <button type="button" role="tab" className="sx-tab" aria-selected={tab === "ready"} onClick={() => startFilter(() => { setTab("ready"); setChip("all"); setEditing(null); setDeleting(null); })}>Tayyor mahsulotlar · {products.length}</button>
            <button type="button" role="tab" className="sx-tab" aria-selected={tab === "sex"} onClick={() => startFilter(() => { setTab("sex"); setChip("all"); setEditing(null); setDeleting(null); })}>Sex zapchastlari · {parts.length}</button>
          </div>
          <label className="sx-search"><Search size={15} color="#4F5A70"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nomi yoki model bo‘yicha qidirish" aria-label="Qidirish"/></label>
        </div>
        <div className="sx-chips">
          {["all", ...(tab === "ready" ? brands.map(([brand]) => brand) : groups)].map(value => <button key={value} type="button" className="sx-chip" aria-pressed={chip === value} onClick={() => startFilter(() => setChip(value))}>{value === "all" ? "Hammasi" : value}</button>)}
          {tab === "sex" && <button type="button" className="sx-btn is-dashed" onClick={() => setAddOpen(open => !open)}>+ Zapchast qo‘shish</button>}
        </div>
        {tab === "sex" && addOpen && <AddPartForm groups={groups} busy={pending} onSubmit={draft => run(() => createPartAction(draft), () => setAddOpen(false))}/>}
        <PendingArea pending={filtering}><div className="sx-table-wrap"><table className="sx-table" style={{ minWidth: 760 }}>
          <thead><tr><th>Nomi</th><th>{tab === "ready" ? "Brend" : "Guruh"}</th><th className="is-num">Prays narxi</th><th className="is-num">Sotuv (+{markup}%)</th><th>O‘zgargan</th><th className="is-num">Amal</th></tr></thead>
          <tbody>{visible.map(row => {
            const isEditing = editing?.id === row.id, isDeleting = deleting === row.id, changedToday = row.date?.slice(0, 10) === today();
            return <tr key={row.id} className={isDeleting ? "is-red" : changedToday ? "is-green" : ""}>
              <td style={{ fontWeight: 600, minWidth: 240 }}>{row.name}</td>
              <td><span className="sx-muted" style={{ fontWeight: 700 }}>{row.tag}</span></td>
              <td className="is-num">{isEditing
                ? <input className="sx-input is-price" value={editing.draft} onChange={event => setEditing({ id: row.id, draft: event.target.value })} onKeyDown={event => { if (event.key === "Enter") saveEdit(row); if (event.key === "Escape") setEditing(null); }} inputMode="decimal" aria-label="Yangi prays narxi" autoFocus/>
                : <span className="sx-price-box">{row.base === null ? "—" : formatUsd(row.base)}</span>}</td>
              <td className="is-num" style={{ fontWeight: 700, color: "#1E4E8C" }}>{formatUsd(row.sale)}</td>
              <td><span className="sx-muted" style={changedToday ? { color: "#1B6B43", fontWeight: 800 } : undefined}>{changedToday ? "bugun" : row.date ? formatShortDate(new Date(row.date)) : "—"}</span></td>
              <td><div className="sx-row-actions">
                {isEditing && <><button type="button" className="sx-btn is-sm is-green" disabled={pending} onClick={() => saveEdit(row)}><BusyLabel busy={pending}>Saqlash</BusyLabel></button><button type="button" className="sx-btn is-sm is-icon" onClick={() => setEditing(null)} aria-label="Bekor qilish">×</button></>}
                {isDeleting && <><button type="button" className="sx-btn is-sm is-red" disabled={pending} onClick={() => run(() => removeEntryAction({ entityType: row.entityType, id: row.id }), () => setDeleting(null))}>Ha, o‘chirish</button><button type="button" className="sx-btn is-sm is-icon" onClick={() => setDeleting(null)} aria-label="Bekor qilish">×</button></>}
                {!isEditing && !isDeleting && <><button type="button" className="sx-btn is-sm is-outline" onClick={() => { setEditing({ id: row.id, draft: row.base === null ? "" : String(row.base) }); setDeleting(null); }}>O‘zgartirish</button><button type="button" className="sx-btn is-sm is-icon is-danger-ghost" onClick={() => { setDeleting(row.id); setEditing(null); }} aria-label={`${row.name} — o‘chirish`}><Trash2 size={15}/></button></>}
              </div></td>
            </tr>;
          })}</tbody>
        </table>
        {!visible.length && <p className="sx-muted" style={{ padding: 16, textAlign: "center" }}>{rows.length ? "Hech narsa topilmadi." : tab === "sex" ? "Sex zapchastlari hali kiritilmagan — “+ Zapchast qo‘shish” yoki Excel yuklash orqali qo‘shing." : "Mahsulotlar yo‘q."}</p>}
        </div></PendingArea>
        <span className="sx-muted">“O‘zgartirish” — prays narxini tahrirlash · o‘chirishdan oldin tasdiq so‘raladi (mahsulot saytdan yashiriladi, o‘chib ketmaydi) · sotuv narxi ustama bo‘yicha o‘zi hisoblanadi</span>
      </div>

      <div className="sx-card" style={{ flex: "1 1 300px", gap: 10 }}>
        <h3>Narx tarixi</h3>
        <div className="sx-history">{history.length ? history.map(entry => <div key={entry.id}><b>{entry.title}</b><span>{entry.detail}</span><small>{entry.who}</small></div>) : <div><span>Hali o‘zgarish yo‘q.</span></div>}</div>
        <span className="sx-muted" style={{ paddingTop: 6, borderTop: "1px solid #EEF1F6" }}>Zakaz berilgan paytdagi narx zakaz ichida saqlanadi — keyingi o‘zgarishlar eski zakazlarga ta’sir qilmaydi.</span>
      </div>
    </div>
  </div>;
}

function PreviewTable({ rows }: { rows: Preview["rows"] }) {
  return <div className="sx-table-wrap"><table className="sx-table" style={{ minWidth: 680 }}>
    <thead><tr><th>Mahsulot</th><th className="is-num">Eski</th><th className="is-num">Yangi</th><th className="is-num">Farq</th><th>Holat</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.key}>
      <td style={{ fontWeight: 600 }}>{row.name}</td>
      <td className="is-num" style={{ color: "#4F5A70" }}>{formatUsd(row.oldBase)}</td>
      <td className="is-num is-strong">{formatUsd(row.newBase)}</td>
      <td className="is-num" style={{ fontWeight: 700 }}>{row.status === "NEW" ? "yangi" : row.percent === null ? "—" : `${row.percent > 0 ? "+" : ""}${row.percent.toString().replace(".", ",")}%`}</td>
      <td><span className={`sx-pill is-sm ${STATUS_TONE[row.status]}`}>{CHANGE_LABEL[row.status]}</span></td>
    </tr>)}</tbody>
  </table></div>;
}

function AddPartForm({ groups, busy, onSubmit }: { groups: string[]; busy: boolean; onSubmit: (draft: { name: string; size: string | null; group: string; unit: string; base: number | null }) => void }) {
  const [name, setName] = useState(""), [size, setSize] = useState(""), [group, setGroup] = useState(""), [unit, setUnit] = useState("dona"), [price, setPrice] = useState("");
  const base = price.trim() ? Number(price.replace(",", ".").replace(/\s/g, "")) : null;
  return <form className="sx-fields" style={{ alignItems: "end", padding: 12, borderRadius: 12, background: "#F6F8FB" }} onSubmit={event => { event.preventDefault(); onSubmit({ name: name.trim(), size: size.trim() || null, group: group.trim(), unit: unit.trim() || "dona", base: base !== null && Number.isFinite(base) && base > 0 ? base : null }); }}>
    <label className="sx-field">Nomi<input value={name} onChange={event => setName(event.target.value)} required maxLength={120} placeholder="Vibro shlang"/></label>
    <label className="sx-field">O‘lcham<input value={size} onChange={event => setSize(event.target.value)} maxLength={40} placeholder="F22, 3/8, 20 L"/></label>
    <label className="sx-field">Guruh<input value={group} onChange={event => setGroup(event.target.value)} required maxLength={60} list="sx-part-groups" placeholder="Shlang"/><datalist id="sx-part-groups">{["Glazok", "Klapan", "Shlang", "Filtr", "Resiver", "Kompressor", "Kondensator", ...groups].filter((value, index, all) => all.indexOf(value) === index).map(value => <option key={value} value={value}/>)}</datalist></label>
    <label className="sx-field">Birlik<input value={unit} onChange={event => setUnit(event.target.value)} maxLength={20}/></label>
    <label className="sx-field">Prays narxi, $<input value={price} onChange={event => setPrice(event.target.value)} inputMode="decimal" placeholder="0"/></label>
    <button type="submit" className="sx-btn is-primary" disabled={busy || !name.trim() || !group.trim()}>Qo‘shish</button>
  </form>;
}
