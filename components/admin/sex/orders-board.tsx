"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/admin/bklead/dialog";
import { confirmNoRequestAction, createNoRequestAction, transitionOrderAction } from "@/app/admin/(sex)/seh/actions";
import type { OrderRow } from "@/lib/sex/queries";
import { ACTION_LABEL, STATUS_LABEL, STATUS_TONE, actionFor, type OrderAction } from "@/lib/sex/rules";
import { formatUsd } from "@/lib/prays/rules";
import { AcceptedBadge, WorkingStatus } from "./working-progress";
import { BusyLabel, DownloadButton, LinkButton, PendingArea, startNavigationProgress } from "@/components/admin/feedback";

type Option = { id: string; name: string };
type PartOption = { id: string; label: string };
type Props = {
  role: string; userName: string; rows: OrderRow[]; month: { key: string; label: string }; months: Array<{ key: string; label: string }>;
  parts: PartOption[]; sellers: Option[]; customers: Option[];
};

const WAIT_TEXT = { NEW: "Seh qabul qilishi kutilmoqda", ACCEPTED: "Sehda ishlanmoqda", ISSUED: "Krimga olish kutilmoqda", RECEIVED: "✓ Yopildi" } as const;

export function OrdersBoard({ role, userName, rows, month, months, parts, sellers, customers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Month change: the old table stays visible, dimmed, until the new month is rendered.
  const [monthPending, startMonth] = useTransition();
  // Which button was pressed ("<orderId>:<action>"), so only that one shows the spinner.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [issuing, setIssuing] = useState<OrderRow | null>(null);
  const [noRequestOpen, setNoRequestOpen] = useState(false);
  const boss = role === "SUPER_ADMIN", workshop = role === "WORKSHOP", seller = role === "SELLER", staff = !workshop && !seller;
  const run = (task: () => Promise<{ ok: boolean; error?: string }>, after?: () => void, key: string | null = null) => {
    setBusyKey(key);
    startTransition(async () => {
      setError("");
      const result = await task();
      if (!result.ok) { setError(result.error ?? "Xatolik."); return; }
      after?.(); router.refresh();
    });
  };
  const isBusy = (key: string) => pending && busyKey === key;
  const act = (row: OrderRow, action: OrderAction) => {
    if (action === "issue" && row.type === "ZAPCHAST") { setIssuing(row); return; }
    run(() => transitionOrderAction({ id: row.id, action }), undefined, `${row.id}:${action}`);
  };
  const count = (status: OrderRow["status"]) => rows.filter(row => row.status === status).length;
  const stats = workshop
    ? [{ k: "Qabul qilishim kerak", v: count("NEW"), tone: "is-blue" }, { k: "Ishlanmoqda · chiqarishim kerak", v: count("ACCEPTED"), tone: "is-yellow" }]
    : [{ k: "Yangi · qabul kutmoqda", v: count("NEW"), tone: "is-blue" }, { k: "Sehda ishlanmoqda", v: count("ACCEPTED"), tone: "is-yellow" }, { k: "Chiqib ketdi · krim kutmoqda", v: count("ISSUED"), tone: "is-red" }, { k: "Krimga olindi", v: count("RECEIVED"), tone: "is-green" }];
  const title = workshop ? `Mening vazifalarim · ${userName}` : seller ? "Mening zakazlarim" : `Seh zakazlari · ${month.label}`;
  const subtitle = workshop ? "Zapchast va agregat zakazlari · qabul qiling, chiqqach “Chiqib ketdi” bosing" : seller ? "Bergan zakazlaringiz va ularning holati" : boss ? "Hammasini ko‘rasiz · sizning tugmangiz faqat “Krimga oldim”" : "Hammasini ko‘rasiz · holatni seh va Super Admin o‘zgartiradi";

  return <div className="sx">
    <div className="sx-head">
      <div><span className="sx-crumb">Seh / {workshop ? "Vazifalar" : "Zakazlar"}</span><h1>{title}</h1><p className="sx-lead">{subtitle}</p></div>
      <div className="sx-actions">
        {!workshop && <><LinkButton className="sx-btn is-outline" href="/admin/seh/new?type=agregat">+ Zborka buyurtmasi</LinkButton><LinkButton className="sx-btn is-outline" href="/admin/seh/new?type=zapchast">+ Zapchast zayavkasi</LinkButton></>}
        {workshop && <button type="button" className="sx-btn is-warn" onClick={() => setNoRequestOpen(true)} disabled={!parts.length}>+ Zayavkasiz chiqim</button>}
        {staff && <select className="sx-input" style={{ width: "auto", fontWeight: 700 }} value={month.key} disabled={monthPending} onChange={event => { const next = event.target.value; startNavigationProgress(); startMonth(() => router.push(`/admin/seh?month=${next}`)); }} aria-label="Oy">{months.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select>}
        {boss && <DownloadButton className="sx-btn is-primary" href={`/admin/seh/export?month=${month.key}`} fallbackName={`seh-zakazlari-${month.key}.xlsx`}/>}
      </div>
    </div>

    {!seller && <div className="sx-stats">{stats.map(stat => <div key={stat.k} className={`sx-stat is-flat ${stat.tone}`}><span>{stat.k}</span><strong>{stat.v}</strong></div>)}</div>}
    {error && <p className="sx-note is-error" role="alert">{error}</p>}

    <PendingArea pending={monthPending}><div className="sx-card">
      <div className="sx-table-wrap"><table className="sx-table" style={{ minWidth: 1180 }}>
        <thead><tr><th>№</th><th>Sana</th><th>Turi</th><th>Mahsulot</th><th>Zayavka beruvchi</th><th>Kimga</th><th>Jarayon</th><th>Holat</th><th>Amal</th></tr></thead>
        <tbody>{rows.map(row => {
          const action = actionFor(role, row.status);
          return <tr key={row.id} className={row.overdue ? "is-late" : row.isNew ? "is-new" : ""}>
            <td><b>{row.number}</b></td>
            <td style={{ color: "#3E4A60", whiteSpace: "nowrap" }}>{row.day}</td>
            <td><span className="sx-tag">{row.type === "AGREGAT" ? "Agregat" : "Zapchast"}</span>{row.noRequest && <><br/><span className="sx-pill is-sm is-orange" style={{ marginTop: 4 }}>Zayavkasiz</span></>}</td>
            <td style={{ minWidth: 220, fontWeight: 600, lineHeight: 1.35 }}>{row.product}{row.dueDate && <div className="sx-muted" style={{ fontWeight: 500 }}>Muddat: {row.dueDate.split("-").reverse().join(".")}</div>}{row.note && <div className="sx-muted" style={{ fontWeight: 500 }}>Izoh: {row.note}</div>}{row.prices && <PriceLine prices={row.prices}/>}</td>
            <td><div style={{ display: "grid", gap: 2 }}><b style={{ fontWeight: 600 }}>{row.sellerName}</b><span className="sx-muted">{row.sellerAt}</span></div></td>
            <td style={{ fontWeight: 700, color: row.purpose === "SHOP" ? "#3E4A60" : "#1E4E8C" }}>{row.purpose === "SHOP" ? "Vitrina" : `Mijoz: ${row.customerName ?? "—"}`}</td>
            <td style={{ minWidth: 230 }}><div className="sx-steps">{row.steps.map(step => <span key={step.label} className={`sx-step ${step.state === "done" ? "is-done" : step.state === "wait" ? "is-wait" : ""}`}><b>{step.label}:</b> {step.text}</span>)}</div></td>
            <td>{row.status === "ACCEPTED" ? <AcceptedBadge label={STATUS_LABEL.ACCEPTED} dueDate={row.dueDate}/> : <span className={`sx-pill is-${STATUS_TONE[row.status]}`}>{STATUS_LABEL[row.status]}</span>}{row.overdue && <div className="sx-muted" style={{ color: "#A41F15", fontWeight: 700, marginTop: 4 }}>24 soatdan oshdi</div>}</td>
            <td style={{ minWidth: 210 }}>
              {action ? <button type="button" className={`sx-btn is-md ${action === "receive" ? "is-red" : "is-primary"}`} disabled={pending} aria-busy={isBusy(`${row.id}:${action}`)} onClick={() => act(row, action)}><BusyLabel busy={isBusy(`${row.id}:${action}`)}>{ACTION_LABEL[action]}</BusyLabel></button>
                : seller && row.noRequest && !row.sellerConfirmed ? <button type="button" className="sx-btn is-md is-primary" disabled={pending} onClick={() => run(() => confirmNoRequestAction(row.id), undefined, `${row.id}:confirm`)}><BusyLabel busy={isBusy(`${row.id}:confirm`)}>Tasdiqlayman</BusyLabel></button>
                : row.status !== "ACCEPTED" && <span className="sx-muted">{WAIT_TEXT[row.status]}</span>}
              {row.status === "ACCEPTED" && row.acceptedAt && <WorkingStatus acceptedAt={row.acceptedAt} dueDate={row.dueDate}/>}
            </td>
          </tr>;
        })}</tbody>
      </table>
      {!rows.length && <p className="sx-muted" style={{ padding: 16, textAlign: "center" }}>{workshop ? "Hozircha vazifa yo‘q." : "Zakazlar yo‘q."}</p>}
      </div>
    </div></PendingArea>

    {issuing && <Dialog title={`${issuing.number} · Chiqib ketdi`} onClose={() => setIssuing(null)} busy={pending}>
      <IssueForm row={issuing} busy={pending} onSubmit={issuedQty => run(() => transitionOrderAction({ id: issuing.id, action: "issue", issuedQty }), () => setIssuing(null))}/>
      {error && <p className="sx-note is-error" role="alert" style={{ marginTop: 10 }}>{error}</p>}
    </Dialog>}
    {noRequestOpen && <Dialog title="Zayavkasiz chiqim" onClose={() => setNoRequestOpen(false)} busy={pending} wide>
      <NoRequestForm parts={parts} sellers={sellers} customers={customers} busy={pending} onSubmit={draft => run(() => createNoRequestAction(draft), () => setNoRequestOpen(false))}/>
      {error && <p className="sx-note is-error" role="alert" style={{ marginTop: 10 }}>{error}</p>}
    </Dialog>}
  </div>;
}

function PriceLine({ prices }: { prices: NonNullable<OrderRow["prices"]> }) {
  return <div className="sx-muted" style={{ fontWeight: 600 }}>Prays narxi {formatUsd(prices.totalBaseUsd ?? null)}</div>;
}

/** "berildi" per item: defaults to the requested quantity, the workshop corrects it. */
function IssueForm({ row, busy, onSubmit }: { row: OrderRow; busy: boolean; onSubmit: (issued: Record<string, number>) => void }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(row.items.map(item => [item.id, String(item.qty)])));
  const parsed = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, Number(value)]));
  const valid = Object.values(parsed).every(value => Number.isInteger(value) && value >= 0);
  return <form style={{ display: "grid", gap: 10 }} onSubmit={event => { event.preventDefault(); if (valid) onSubmit(parsed); }}>
    {row.items.map(item => <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 110px", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid #EEF1F6" }}>
      <span style={{ fontWeight: 600 }}>{item.title}</span><span className="sx-muted">so‘raldi: {item.qty}</span>
      <label className="sx-muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>berildi<input className="sx-input" style={{ width: 56, height: 34 }} value={values[item.id]} onChange={event => setValues({ ...values, [item.id]: event.target.value })} inputMode="numeric" aria-label={`${item.title} — berilgan soni`}/></label>
    </div>)}
    <button type="submit" className="sx-btn is-primary" disabled={busy || !valid} style={{ height: 48, borderRadius: 12 }}><BusyLabel busy={busy}>Berib yubordim</BusyLabel></button>
  </form>;
}

function NoRequestForm({ parts, sellers, customers, busy, onSubmit }: { parts: PartOption[]; sellers: Option[]; customers: Option[]; busy: boolean; onSubmit: (draft: Record<string, unknown>) => void }) {
  const [sellerId, setSellerId] = useState(""), [items, setItems] = useState([{ partId: "", qty: "1" }]), [purpose, setPurpose] = useState<"SHOP" | "CLIENT">("SHOP"), [customer, setCustomer] = useState(""), [note, setNote] = useState("");
  const ready = sellerId && items.every(item => item.partId && Number(item.qty) >= 1) && (purpose === "SHOP" || customer.trim());
  const known = customers.find(item => item.name === customer.trim());
  return <form style={{ display: "grid", gap: 12 }} onSubmit={event => { event.preventDefault(); if (ready) onSubmit({ sellerId, purpose, customerId: purpose === "CLIENT" ? known?.id ?? null : null, customerName: purpose === "CLIENT" ? customer.trim() : null, dueDate: null, note: note.trim() || null, items: items.map(item => ({ partId: item.partId, qty: Number(item.qty) })) }); }}>
    <p className="sx-note">Shoshilinch berilgan tovar: “Chiqib ketdi” holatida yoziladi, sotuvchi tasdiqlaydi, Super Admin krimga oladi.</p>
    <label className="sx-field">Sotuvchi<select value={sellerId} onChange={event => setSellerId(event.target.value)} required><option value="">Tanlang</option>{sellers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <PartRows parts={parts} items={items} setItems={setItems}/>
    <PurposePicker purpose={purpose} setPurpose={setPurpose} customer={customer} setCustomer={setCustomer} customers={customers}/>
    <label className="sx-field">Izoh<input value={note} onChange={event => setNote(event.target.value)} maxLength={500}/></label>
    <button type="submit" className="sx-btn is-primary" disabled={busy || !ready} style={{ height: 48, borderRadius: 12 }}><BusyLabel busy={busy}>Chiqimni yozish</BusyLabel></button>
  </form>;
}

export function PartRows({ parts, items, setItems, priceOf }: { parts: PartOption[]; items: Array<{ partId: string; qty: string }>; setItems: (items: Array<{ partId: string; qty: string }>) => void; priceOf?: (partId: string) => string | null }) {
  return <div style={{ display: "grid", gap: 8 }}>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 44px", gap: 10, fontSize: 12, fontWeight: 700, color: "#4F5A70" }}><span>Seh mahsuloti</span><span>Soni</span><span/></div>
    {items.map((item, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 44px", gap: 10, alignItems: "center" }}>
      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <select className="sx-input" style={{ fontSize: 14, fontWeight: 600 }} value={item.partId} onChange={event => setItems(items.map((row, i) => i === index ? { ...row, partId: event.target.value } : row))} aria-label="Seh mahsuloti"><option value="">Tanlang</option>{parts.map(part => <option key={part.id} value={part.id}>{part.label}</option>)}</select>
        {priceOf && item.partId && <span className="sx-muted">{priceOf(item.partId) ?? "narxi kiritilmagan"}</span>}
      </div>
      <input className="sx-input" style={{ fontSize: 14 }} value={item.qty} onChange={event => setItems(items.map((row, i) => i === index ? { ...row, qty: event.target.value.replace(/\D+/g, "") } : row))} inputMode="numeric" aria-label="Soni"/>
      <button type="button" className="sx-btn is-danger-ghost" style={{ padding: 0, fontSize: 18 }} onClick={() => setItems(items.length > 1 ? items.filter((_, i) => i !== index) : [{ partId: "", qty: "1" }])} aria-label="Qatorni o‘chirish">×</button>
    </div>)}
    <button type="button" className="sx-btn is-dashed" style={{ justifySelf: "start" }} onClick={() => setItems([...items, { partId: "", qty: "1" }])}>+ Mahsulot qo‘shish</button>
  </div>;
}

export function PurposePicker({ purpose, setPurpose, customer, setCustomer, customers }: { purpose: "SHOP" | "CLIENT"; setPurpose: (value: "SHOP" | "CLIENT") => void; customer: string; setCustomer: (value: string) => void; customers: Option[] }) {
  return <div style={{ display: "grid", gap: 8 }}>
    <span style={{ fontSize: 13, fontWeight: 700 }}>Kimga · ikkalasi ham magazinga kirim bo‘ladi</span>
    <div className="sx-tiles" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
      <button type="button" className="sx-tile is-short" aria-pressed={purpose === "SHOP"} onClick={() => setPurpose("SHOP")}><b>Magazinga (vitrina)</b><span>Mijozsiz — sotuvga turadi</span></button>
      <button type="button" className="sx-tile is-short" aria-pressed={purpose === "CLIENT"} onClick={() => setPurpose("CLIENT")}><b>Mijozga</b><span>Mijoz nomi bilan</span></button>
    </div>
    {purpose === "CLIENT" && <label className="sx-field">Mijoz <small>· doimiy mijozdan tanlang yoki ismini yozing</small>
      <input value={customer} onChange={event => setCustomer(event.target.value)} list="sx-customers" maxLength={160} placeholder="Rustam aka · Namangan" required/>
      <datalist id="sx-customers">{customers.map(item => <option key={item.id} value={item.name}/>)}</datalist>
    </label>}
  </div>;
}
