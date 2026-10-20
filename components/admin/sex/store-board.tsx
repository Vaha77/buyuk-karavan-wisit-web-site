"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/admin/bklead/dialog";
import { BusyLabel } from "@/components/admin/feedback";
import { storeRequestAction, storeStepAction } from "@/app/admin/(sex)/seh/actions";
import type { OrderRow } from "@/lib/sex/queries";
import { STATUS_LABEL, STATUS_TONE, daysInStore, shortDay, when } from "@/lib/sex/rules";
import { TelegramLink } from "./telegram-link";
import { PartRows } from "./orders-board";

// Omborchi (STOREKEEPER) screens of /admin/seh (design: Claude outputs/omborchi_rol.html). No prices anywhere.
type Result = { ok: boolean; error?: string; duplicate?: { number: string } };
const issuedTotal = (row: OrderRow) => row.type === "AGREGAT" ? row.qty : row.items.reduce((sum, item) => sum + (item.issuedQty ?? item.qty), 0);
const purposeText = (row: OrderRow) => row.purpose === "CLIENT" ? `Mijozga` : "Magazinga";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const run = (key: string, task: () => Promise<Result>, after?: (result: Result) => void) => {
    setBusy(key);
    startTransition(async () => {
      setError("");
      const result = await task();
      if (!result.ok) { setError(result.error ?? "Xatolik."); after?.(result); return; }
      after?.(result); router.refresh();
    });
  };
  return { pending, error, setError, run, isBusy: (key: string) => pending && busy === key };
}

function Card({ row, meta, children }: { row: OrderRow; meta: string; children?: React.ReactNode }) {
  return <article className="sx-card" style={{ padding: "11px 12px", gap: 4 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><b className="sx-mono" style={{ fontSize: 17 }}>{row.number}</b>{row.isTest && <span className="sx-pill is-sm is-grey">Test</span>}<span className={`sx-pill is-sm ${row.purpose === "CLIENT" ? "is-blue" : "is-slate"}`} style={{ marginLeft: "auto" }}>{purposeText(row)}</span></div>
    <div style={{ fontWeight: 600 }}>{row.product}</div>
    <div className="sx-muted" style={{ fontSize: 12 }}>{meta}</div>
    {children}
  </article>;
}
const form = (entries: Record<string, string | Blob | null>) => { const data = new FormData(); for (const [key, value] of Object.entries(entries)) if (value !== null) data.set(key, value); return data; };

/** "Qabul": Sehdan keldi — qabul qiling (ISSUED) · Mijozga yuklash kutilmoqda · bugun bajarilganlar. */
export function StoreBoard({ rows, userName, telegramLinked }: { rows: OrderRow[]; userName: string; telegramLinked: boolean }) {
  const { pending, error, setError, run, isBusy } = useRun();
  const [diff, setDiff] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState<OrderRow | null>(null);
  const now = new Date(), today = shortDay(now);
  const issued = rows.filter(row => row.status === "ISSUED");
  const waiting = rows.filter(row => row.status === "RECEIVED_STORE" && row.purpose === "CLIENT");
  const done = rows.flatMap(row => [
    row.store.loadedAt && shortDay(row.store.loadedAt) === today ? { key: `${row.id}:l`, text: `🚚 ${row.number} ${row.product} — ${when(row.store.loadedAt, now).replace("bugun ", "")} da mijozga yuklandi` } : null,
    row.store.receivedAt && shortDay(row.store.receivedAt) === today && row.status !== "ISSUED" ? { key: `${row.id}:r`, text: `✓ ${row.number} ${row.product} — ${when(row.store.receivedAt, now).replace("bugun ", "")} da qabul qilindi` } : null,
  ]).filter(Boolean) as Array<{ key: string; text: string }>;
  const firstName = userName.trim().split(/\s+/)[0] || userName;
  const step = (row: OrderRow, action: "store" | "load", extra: Record<string, string | Blob | null> = {}, after?: () => void) =>
    run(`${row.id}:${action}`, () => storeStepAction(form({ id: row.id, action, ...extra })), result => { if (result.ok) after?.(); });

  return <div className="sx sx-panel">
    <div className="sx-head"><div><span className="sx-crumb">Ombor · Qabul</span><h1>Salom, {firstName}</h1><p className="sx-lead">Sehdan chiqqan tovarni qabul qiling; mijoz zakazini yuklagach “Mijozga yuklandi” bosing.</p></div></div>
    <div className="sx-card" style={{ padding: 14, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span className="sx-muted" style={{ fontSize: 13 }}>{telegramLinked ? "Sehdan chiqqan tovar Telegramga ham keladi — tugmalar bilan qabul qilishingiz mumkin." : "Botni ulang: sehdan chiqqan tovar Telegramga tugmalar bilan keladi."}</span>
      <TelegramLink linked={telegramLinked} compact/>
    </div>
    {error && !diff && !loading && <p className="sx-note is-error" role="alert">{error}</p>}

    <section className="sx-panel-section" aria-labelledby="omb-in">
      <div className="sx-panel-title"><span style={{ background: "#D2372B" }}/><h2 id="omb-in">Sehdan keldi — qabul qiling</h2><b>{issued.length}</b></div>
      {issued.length ? issued.map(row => <Card key={row.id} row={row} meta={`${row.store.issuedBy ?? "Seh"} chiqardi · ${row.store.issuedAt ? when(row.store.issuedAt, now) : "—"}${row.customerName ? ` · mijoz: ${row.customerName}` : ""}`}>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button type="button" className="sx-btn is-md is-primary" style={{ flex: 1, background: "#15803d", borderColor: "#15803d" }} disabled={pending} aria-busy={isBusy(`${row.id}:store`)} onClick={() => step(row, "store")}><BusyLabel busy={isBusy(`${row.id}:store`)}>✓ Qabul qildim</BusyLabel></button>
          <button type="button" className="sx-btn is-md" style={{ flex: 1 }} disabled={pending} onClick={() => { setError(""); setDiff(row); }}>{row.purpose === "CLIENT" ? "Kamchilik bor" : "Soni boshqa"}</button>
        </div>
      </Card>) : <div className="sx-panel-empty">Hozir qabul qilinadigan tovar yo‘q</div>}
    </section>

    <section className="sx-panel-section" aria-labelledby="omb-load">
      <div className="sx-panel-title"><span style={{ background: "#c2410c" }}/><h2 id="omb-load">Mijozga yuklash kutilmoqda</h2><b>{waiting.length}</b></div>
      {waiting.length ? waiting.map(row => <Card key={row.id} row={row} meta={`Mijoz: ${row.customerName ?? "—"} · sotuvchi ${row.sellerName} · omborda ${row.store.receivedAt ? daysInStore(row.store.receivedAt, now) : 0} kun`}>
        <button type="button" className="sx-btn is-md is-primary" style={{ marginTop: 8 }} disabled={pending} onClick={() => { setError(""); setLoading(row); }}>🚚 Mijozga yuklandi</button>
      </Card>) : <div className="sx-panel-empty">Yuklanadigan mijoz zakazi yo‘q</div>}
    </section>

    {done.length > 0 && <div className="sx-done-today" style={{ flexDirection: "column", alignItems: "flex-start" }}><b>Bugun bajarildi:</b>{done.map(item => <span key={item.key}>{item.text}</span>)}</div>}
    <p className="sx-muted">Omborchi narxni ko‘rmaydi. Qoldiq — GBS’da.</p>

    {diff && <Dialog title={`${diff.number} · ${diff.product}`} onClose={() => setDiff(null)} busy={pending}>
      <DiffForm row={diff} busy={pending} onSubmit={(qty, note) => step(diff, "store", { qty: String(qty), note }, () => setDiff(null))}/>
      {error && <p className="sx-note is-error" role="alert" style={{ marginTop: 10 }}>{error}</p>}
    </Dialog>}
    {loading && <Dialog title={`${loading.number} · Mijozga yuklandi`} onClose={() => setLoading(null)} busy={pending}>
      <form style={{ display: "grid", gap: 10 }} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); step(loading, "load", { car: data.get("car"), photo: data.get("photo") }, () => setLoading(null)); }}>
        <p className="sx-muted">{loading.product} · mijoz: {loading.customerName ?? "—"}</p>
        <label className="sx-field">Mashina raqami (ixtiyoriy)<input name="car" maxLength={20} placeholder="01 A 123 BC" autoComplete="off"/></label>
        <label className="sx-field">Rasm (ixtiyoriy)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"/></label>
        <button type="submit" className="sx-btn is-primary" disabled={pending} style={{ height: 48, borderRadius: 12 }}><BusyLabel busy={pending}>🚚 Mijozga yuklandi</BusyLabel></button>
      </form>
      {error && <p className="sx-note is-error" role="alert" style={{ marginTop: 10 }}>{error}</p>}
    </Dialog>}
  </div>;
}

/** "Soni boshqa / Kamchilik bor": the real count and a reason (required); the difference goes to Super Admin. */
function DiffForm({ row, busy, onSubmit }: { row: OrderRow; busy: boolean; onSubmit: (qty: number, note: string) => void }) {
  const expected = issuedTotal(row);
  const [qty, setQty] = useState(expected), [note, setNote] = useState("");
  const delta = qty - expected, valid = note.trim().length >= 3;
  return <form style={{ display: "grid", gap: 10 }} onSubmit={event => { event.preventDefault(); if (valid) onSubmit(qty, note.trim()); }}>
    <p className="sx-muted">Seh chiqargan: <b>{expected} ta</b></p>
    <div className="sx-field">Aslida qancha keldi?
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="sx-btn is-md" onClick={() => setQty(Math.max(0, qty - 1))} aria-label="Kamaytirish">−</button>
        <input className="sx-input" style={{ width: 70, height: 38, textAlign: "center", fontSize: 18, fontWeight: 800 }} value={qty} onChange={event => setQty(Math.max(0, Math.min(9999, Math.floor(Number(event.target.value)) || 0)))} inputMode="numeric" aria-label="Kelgan soni"/>
        <button type="button" className="sx-btn is-md" onClick={() => setQty(Math.min(9999, qty + 1))} aria-label="Ko‘paytirish">+</button>
      </div>
    </div>
    <label className="sx-field">Sabab (majburiy)<textarea className="sx-input" value={note} onChange={event => setNote(event.target.value)} maxLength={300} rows={2} placeholder="masalan: 2 tasi singan keldi" required/></label>
    <p className="sx-note is-info">⚠ {delta ? `Farq: ${delta > 0 ? "+" : ""}${delta} ta. ` : ""}{qty} ta qabul qilinadi, xabar Super Admin’ga Telegram orqali boradi va “Tasdiqlash kerak”da ko‘rinadi.</p>
    <button type="submit" className="sx-btn is-primary" disabled={busy || !valid} style={{ height: 48, borderRadius: 12 }}><BusyLabel busy={busy}>{qty} tasini qabul qildim</BusyLabel></button>
  </form>;
}

const newRequestId = () => crypto.randomUUID();

/** "Sehdan so‘rash": a spare part for the shop → an ordinary zapchast request, "Magazinga". */
export function StoreRequest({ parts, rows }: { parts: Array<{ id: string; label: string; group: string }>; rows: OrderRow[] }) {
  const { pending, error, run, isBusy } = useRun();
  const [items, setItems] = useState([{ partId: "", qty: "1" }]), [note, setNote] = useState(""), [requestId, setRequestId] = useState(newRequestId);
  const [duplicate, setDuplicate] = useState(false), [sent, setSent] = useState("");
  const chosen = items.filter(item => item.partId), ready = chosen.length > 0 && chosen.every(item => Number(item.qty) >= 1);
  const send = (confirmDuplicate: boolean) => run("send", () => storeRequestAction({ items: chosen.map(item => ({ productId: item.partId, qty: Number(item.qty) })), note: note.trim() || null, requestId, confirmDuplicate }), result => {
    setDuplicate(!!result.duplicate);
    if (!result.ok) return;
    setSent(`✓ Sehga yuborildi${"number" in result && result.number ? ` · ${result.number}` : ""}`); setItems([{ partId: "", qty: "1" }]); setNote(""); setRequestId(newRequestId());
  });
  const mine = rows.filter(row => row.mine);
  return <div className="sx sx-panel">
    <div className="sx-head"><div><span className="sx-crumb">Ombor · Sehdan so‘rash</span><h1>Sehdan so‘rash</h1><p className="sx-lead">Do‘konga sotuv uchun zapchast</p></div></div>
    <form className="sx-card" style={{ padding: 14, gap: 10 }} onSubmit={event => { event.preventDefault(); send(false); }}>
      <div className="sx-field">Zapchast<PartRows parts={parts} items={items} setItems={next => { setItems(next); setDuplicate(false); setSent(""); }}/></div>
      <label className="sx-field">Izoh (ixtiyoriy)<input className="sx-input" value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="masalan: vitrinaga"/></label>
      <p className="sx-muted" style={{ fontSize: 12 }}>Zayavka sehga “Magazinga” bo‘lib boradi. Seh chiqargach, “Qabul” ekranida “Qabul qildim” chiqadi.</p>
      {error && <p className="sx-note is-error" role="alert">{error}</p>}
      {sent && !error && <p className="sx-note is-ok" role="status">{sent}</p>}
      <button type="submit" className="sx-btn is-primary" disabled={pending || !ready} style={{ height: 48, borderRadius: 12 }}><BusyLabel busy={isBusy("send") && !duplicate} busyText="Yuborilmoqda…">Sehga yuborish</BusyLabel></button>
      {duplicate && <button type="button" className="sx-btn" disabled={pending} onClick={() => send(true)}>Baribir yuborish</button>}
    </form>
    <section className="sx-panel-section" aria-labelledby="omb-mine">
      <div className="sx-panel-title"><span style={{ background: "#2457a6" }}/><h2 id="omb-mine">Mening so‘rovlarim</h2><b>{mine.length}</b></div>
      {mine.length ? mine.map(row => <article key={row.id} className="sx-card" style={{ padding: "11px 12px", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><b className="sx-mono" style={{ fontSize: 17 }}>{row.number}</b><span className={`sx-pill is-sm is-${STATUS_TONE[row.status]}`} style={{ marginLeft: "auto" }}>{STATUS_LABEL[row.status]}</span></div>
        <div style={{ fontWeight: 600 }}>{row.product}</div>
      </article>) : <div className="sx-panel-empty">Hali so‘rov yo‘q</div>}
    </section>
  </div>;
}

/** "Tarix": what reached the store, newest first, with the whole path (who / when). */
export function StoreHistory({ rows }: { rows: OrderRow[] }) {
  const past = rows.filter(row => row.status === "RECEIVED_STORE" || row.status === "CLIENT_LOADED").sort((a, b) => (b.store.receivedAt ?? "").localeCompare(a.store.receivedAt ?? ""));
  return <div className="sx sx-panel">
    <div className="sx-head"><div><span className="sx-crumb">Ombor · Tarix</span><h1>Tarix</h1><p className="sx-lead">Omborga qabul qilingan va mijozga yuklangan tovar</p></div></div>
    {past.length ? past.map(row => <Card key={row.id} row={row} meta={row.purpose === "CLIENT" ? `Mijoz: ${row.customerName ?? "—"} · sotuvchi ${row.sellerName}` : `Sotuvchi ${row.sellerName}`}>
      <div className="sx-steps" style={{ marginTop: 6 }}>{row.steps.slice(2).map(item => <span key={item.label} className={`sx-step ${item.state === "done" ? "is-done" : item.state === "wait" ? "is-wait" : ""}`}><b>{item.label}:</b> {item.text}</span>)}</div>
      {row.store.receivedNote && <p className="sx-note is-info" style={{ marginTop: 6 }}>⚠ Keldi: {row.store.receivedQty} ta · {row.store.receivedNote}</p>}
    </Card>) : <div className="sx-panel-empty">Hali tarix yo‘q</div>}
  </div>;
}
