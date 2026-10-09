"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAgregatOrderAction, createZapchastOrderAction, resendTelegramAction, type SexActionResult } from "@/app/admin/(sex)/seh/actions";
import { personalKeyboard, personalMessage, type BotOrder } from "@/lib/sex/bot-text";
import { formatSignedUsd, formatUsd } from "@/lib/prays/rules";
import { ASSEMBLIES, quoteZborka, type Assembly, type ZborkaCatalog } from "@/lib/sex/zborka";
import { orderNumber } from "@/lib/sex/rules";
import { PartRows, PurposePicker } from "./orders-board";
import { BusyLabel, LinkButton, PendingArea, startNavigationProgress } from "@/components/admin/feedback";

type Option = { id: string; name: string };
export type PartChoice = { id: string; label: string; basePriceUsd?: number | null };
type Props = { type: "agregat" | "zapchast"; userName: string; catalog: ZborkaCatalog; parts: PartChoice[]; customers: Option[] };
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

/** Outcome of "Buyurtma berish": saved on the site, then sent to the Seh mas’uli in Telegram (never to the group). */
type SentResult = { ok: boolean; tone: "ok" | "warn" | "error"; text: string; orderId?: string; number?: string; retry?: boolean };
const sentText = (number: string) => `✓ ${number} seh mas’uliga yuborildi`;
function sentResult(response: SexActionResult, label: "Zakaz" | "Zayavka"): SentResult {
  if (!response.ok) return { ok: false, tone: "error", text: response.error };
  const number = orderNumber(response.number ?? 0), base = { ok: true, orderId: response.id, number };
  if (response.telegram === "no-recipients") return { ...base, tone: "warn", text: `⚠️ ${label} saytda saqlandi, lekin seh mas’uli Telegramga ulanmagan` };
  if (response.telegram === "failed") return { ...base, tone: "warn", text: "⚠️ Telegramga yuborilmadi", retry: true };
  return { ...base, tone: "ok", text: sentText(number) };
}
const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
/**
 * One submit at a time: a ref blocks a second click before React re-renders the disabled button, and the requestId
 * (new after every created order) lets the server return the same order instead of creating a second one.
 */
function useSubmitOnce() {
  const busy = useRef(false);
  const [requestId, setRequestId] = useState(newRequestId);
  return { busy, requestId, renew: () => setRequestId(newRequestId()) };
}
/** "⚠️ Bu zakaz 1 daqiqa oldin yuborilgan (#0002). Baribir yana yuborasizmi?" [Ha, yuborish] [Yo‘q]. */
function DuplicateQuestion({ text, busy, onYes, onNo }: { text: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return <div className="sx-note" role="alertdialog" aria-label="Takroriy zakaz" style={{ display: "grid", gap: 8, fontSize: 13 }}>
    <span>{text}</span>
    <span className="sx-actions"><button type="button" className="sx-btn is-sm is-primary" disabled={busy} onClick={onYes}><BusyLabel busy={busy}>Ha, yana yuborish</BusyLabel></button><button type="button" className="sx-btn is-sm" disabled={busy} onClick={onNo}>Yo‘q</button></span>
  </div>;
}

/** Result line under the order card (yellow when Telegram did not get it); a failed delivery can be retried here. */
function SentNote({ result, onResent }: { result: SentResult; onResent: (next: SentResult) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const retry = () => startTransition(async () => {
    setError("");
    const response = await resendTelegramAction(result.orderId);
    if (response.ok) onResent({ ...result, tone: "ok", text: sentText(result.number ?? ""), retry: false }); else setError(response.error);
  });
  return <p className={`sx-note ${result.tone === "ok" ? "is-ok" : result.tone === "warn" ? "" : "is-error"}`} role={result.tone === "error" ? "alert" : "status"}>
    {result.text}{result.retry && result.orderId && <> · <button type="button" className="sx-btn is-sm" style={{ height: 26 }} disabled={pending} onClick={retry}><BusyLabel busy={pending} busyText="Yuborilmoqda…">qayta yuborish</BusyLabel></button></>}{error && <> ({error})</>}
  </p>;
}

/** Price block of the order card: price-list price only (the workshop sells to the seller at prays price) and the change from the standard. */
function PriceBlock({ base, delta }: { base: number; delta: number | null }) {
  return <>
    <div className="sx-total"><span>Prays narxi</span><strong>{formatUsd(base)}</strong></div>
    {delta !== null && delta !== 0 && <span className="sx-muted" style={{ fontWeight: 700, color: "#6E5200" }}>Standartdan {formatSignedUsd(Math.round(delta * 100) / 100)} (prays narxida)</span>}
  </>;
}

/** Date as kk.oo.yyyy text (the native date input shows the browser locale, e.g. Russian "дд.мм.гггг"); `onChange` gets YYYY-MM-DD or "". */
function DateField({ label, value, onChange }: { label: React.ReactNode; value: string; onChange: (iso: string) => void }) {
  const [text, setText] = useState(value ? value.split("-").reverse().join(".") : "");
  const parse = (raw: string) => {
    const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return "";
    const iso = `${match[3]}-${match[2]}-${match[1]}`, date = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso && iso >= today() ? iso : "";
  };
  const invalid = text.length === 10 && !parse(text);
  return <label className="sx-field">{label}
    <input value={text} inputMode="numeric" placeholder="kk.oo.yyyy" maxLength={10} aria-invalid={invalid} style={invalid ? { borderColor: "#A41F15" } : undefined}
      onChange={event => { const digits = event.target.value.replace(/\D+/g, "").slice(0, 8); const next = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("."); setText(next); onChange(parse(next)); }}/>
    {invalid && <small style={{ color: "#A41F15" }}>Sanani kk.oo.yyyy ko‘rinishida kiriting (bugundan oldin emas)</small>}
  </label>;
}

export function NewOrder(props: Props) {
  const router = useRouter();
  // Switching Zborka ↔ Zapchast keeps the current form visible (dimmed) until the other one is ready.
  const [switching, startSwitch] = useTransition();
  return <div className="sx">
    <div className="sx-head">
      <div><span className="sx-crumb">Seh / {props.type === "agregat" ? "Zborka buyurtmasi" : "Zapchast zayavkasi"}</span><h1>{props.type === "agregat" ? "Zborka buyurtmasi" : "Sehdan olish"}</h1><p className="sx-lead">{props.type === "agregat" ? "Prays bo‘yicha tanlang — buyurtma seh Telegram guruhiga avtomatik ketadi" : "Zayavka → Seh beradi → Krim qilinadi. Har qadamni bitta odam tasdiqlaydi."}</p></div>
      <div className="sx-actions">
        <div className="sx-tabs" role="tablist" aria-label="Zakaz turi">{(["agregat", "zapchast"] as const).map(type => <button key={type} type="button" role="tab" className="sx-tab" aria-selected={props.type === type} disabled={switching} onClick={() => { if (type === props.type) return; startNavigationProgress(); startSwitch(() => router.push(`/admin/seh/new?type=${type}`)); }}>{type === "agregat" ? "Zborka (agregat)" : "Zapchast"}</button>)}</div>
        <LinkButton className="sx-btn is-outline" href="/admin/seh">Zakazlar ro‘yxati →</LinkButton>
      </div>
    </div>
    <PendingArea pending={switching}>{props.type === "agregat" ? <AgregatForm {...props}/> : <ZapchastForm {...props}/>}</PendingArea>
  </div>;
}

function AgregatForm({ userName, catalog, customers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [groupKey, setGroupKey] = useState(catalog.groups[0]?.key ?? "");
  const group = catalog.groups.find(item => item.key === groupKey) ?? catalog.groups[0];
  const [modelKey, setModelKey] = useState(group?.models[0]?.key ?? "");
  const model = group?.models.find(item => item.key === modelKey) ?? group?.models[0];
  const [assembly, setAssembly] = useState<Assembly>("vz");
  const [liters, setLiters] = useState<string | null>(null), [hp, setHp] = useState<string | null>(null), [fn, setFn] = useState<string | null>(null);
  const [qty, setQty] = useState("1"), [dueDate, setDueDate] = useState(""), [purpose, setPurpose] = useState<"SHOP" | "CLIENT">("CLIENT"), [customer, setCustomer] = useState(""), [note, setNote] = useState("");
  const [result, setResult] = useState<SentResult | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const { busy: submittingRef, requestId, renew } = useSubmitOnce();
  const available = (key: Assembly) => !!model?.[key];
  const effective = model && !available(assembly) ? ASSEMBLIES.find(item => available(item.key))?.key ?? assembly : assembly;
  const quote = useMemo(() => model && group ? quoteZborka(model, group, catalog.receivers, { assembly: effective, liters, hp, fn }) : null, [model, group, catalog.receivers, effective, liters, hp, fn]);
  const resetParts = () => { setLiters(null); setHp(null); setFn(null); setResult(null); };
  if (!group || !model) return <div className="sx-card"><p className="sx-note">Praysda prays narxi kiritilgan kompressor/agregat topilmadi. Avval Prays bo‘limida narxlarni kiriting.</p></div>;

  const receiverKnown = !!model.liters && catalog.receivers[model.liters] !== undefined;
  const receiverOptions = receiverKnown ? Object.keys(catalog.receivers) : [model.liters ?? ""].filter(Boolean);
  const parts = [] as Array<{ key: string; label: string; value: string; standard: string; options: Array<{ value: string; label: string; price?: number }>; set: (value: string) => void; table: Record<string, number>; disabledNote?: string; format: (value: string) => string }>;
  if (effective !== "k" && model.liters) parts.push({ key: "res", label: "Resiver bachok", value: quote?.ok ? quote.options.liters : model.liters, standard: model.liters, options: receiverOptions.map(value => ({ value, label: `${value} L` })), set: value => { setLiters(value); setResult(null); }, table: catalog.receivers, disabledNote: receiverKnown ? undefined : "Resiver narxi kiritilmagan", format: value => `${value} L` });
  if (effective === "vd" && model.hp) parts.push({ key: "vk", label: "Vadinoy kondensator", value: hp ?? model.hp, standard: model.hp, options: Object.keys(group.hpTable).map(value => ({ value, label: `${value} HP` })), set: value => { setHp(value); setResult(null); }, table: group.hpTable, format: value => `${value} HP` });
  if (effective === "vz" && model.fn) parts.push({ key: "fn", label: "Vazdushniy kondensator (rama bilan)", value: fn ?? model.fn, standard: model.fn, options: Object.keys(group.fnTable).map(value => ({ value, label: value })), set: value => { setFn(value); setResult(null); }, table: group.fnTable, format: value => value });

  const qtyNumber = Number(qty);
  const price = quote?.ok ? quote.base : null;
  const ready = quote?.ok && Number.isInteger(qtyNumber) && qtyNumber >= 1 && (purpose === "SHOP" || customer.trim());
  const known = customers.find(item => item.name === customer.trim());
  const submit = (confirmDuplicate = false) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        setResult(null); setDuplicate(null);
        const response = await createAgregatOrderAction({ requestId, confirmDuplicate, groupKey: group.key, modelKey: model.key, assembly: effective, liters: effective === "k" ? null : liters, hp: effective === "vd" ? hp : null, fn: effective === "vz" ? fn : null, qty: qtyNumber, dueDate: dueDate || null, purpose, customerId: purpose === "CLIENT" ? known?.id ?? null : null, customerName: purpose === "CLIENT" ? customer.trim() : null, note: note.trim() || null });
        if (!response.ok && response.duplicate) { setDuplicate(response.error); return; }
        setResult(sentResult(response, "Zakaz"));
        if (!response.ok) return;
        renew();
        router.refresh();
      } finally { submittingRef.current = false; }
    });
  };

  return <div className="sx-split">
    <div className="sx-main">
      <div className="sx-card" style={{ gap: 16 }}>
        <span className="sx-section-label">1 · Prays va kompressor</span>
        <div className="sx-fields" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          <label className="sx-field">Prays<select className="is-big" value={group.key} onChange={event => { const next = catalog.groups.find(item => item.key === event.target.value); setGroupKey(event.target.value); setModelKey(next?.models[0]?.key ?? ""); resetParts(); }}>{catalog.groups.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <label className="sx-field">Kompressor<select className="is-big" value={model.key} onChange={event => { setModelKey(event.target.value); resetParts(); }}>{group.models.map(item => <option key={item.key} value={item.key}>{group.brand} {item.model}{item.hp ? ` · ${item.hp} HP` : ""}</option>)}</select></label>
        </div>
      </div>
      <div className="sx-card" style={{ gap: 16 }}>
        <span className="sx-section-label">2 · Nima yig‘iladi</span>
        <div className="sx-tiles">{ASSEMBLIES.map(item => <button key={item.key} type="button" className="sx-tile" aria-pressed={effective === item.key} disabled={!available(item.key)} style={!available(item.key) ? { opacity: .45, cursor: "not-allowed" } : undefined} onClick={() => { setAssembly(item.key); setResult(null); }}><b>{item.name}</b><span>{available(item.key) ? item.sub : "praysda yo‘q"}</span></button>)}</div>
        {parts.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid #EEF1F6", paddingTop: 16 }}>
          {parts.map(part => {
            const changed = part.value !== part.standard, delta = changed && part.table[part.value] !== undefined && part.table[part.standard] !== undefined ? part.table[part.value] - part.table[part.standard] : 0;
            return <div key={part.key} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
              <label className="sx-field" style={{ flex: "1 1 240px" }}>{part.label}
                <select className={`is-big ${changed ? "is-changed" : ""}`} value={part.value} disabled={!!part.disabledNote} onChange={event => part.set(event.target.value)}>{part.options.map(option => <option key={option.value} value={option.value}>{option.label}{option.value === part.standard ? "  · standart" : ""}</option>)}</select>
              </label>
              {part.disabledNote ? <span className="sx-pill is-grey" style={{ height: 46, borderRadius: 10, padding: "0 12px" }}>{part.disabledNote}</span>
                : changed ? <span className="sx-pill is-yellow" style={{ height: 46, borderRadius: 10, padding: "0 12px", fontSize: 13 }}>standart {part.format(part.standard)} · {formatSignedUsd(Math.round(delta))}</span>
                : <span className="sx-pill is-green" style={{ height: 46, borderRadius: 10, padding: "0 12px", fontSize: 13 }}>standart</span>}
            </div>;
          })}
        </div>}
      </div>
      <div className="sx-card">
        <span className="sx-section-label">3 · Buyurtma ma’lumoti</span>
        <div className="sx-fields">
          <label className="sx-field">Soni<input value={qty} onChange={event => setQty(event.target.value.replace(/\D+/g, ""))} inputMode="numeric"/></label>
          <DateField label="Tayyor bo‘lishi kerak" value={dueDate} onChange={setDueDate}/>
        </div>
        <PurposePicker purpose={purpose} setPurpose={setPurpose} customer={customer} setCustomer={setCustomer} customers={customers}/>
        <label className="sx-field">Izoh seh uchun<input value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="Masalan: ramani ko‘k rangga bo‘yash"/></label>
      </div>
    </div>

    <div className="sx-side">
      <div className="sx-card is-focus" style={{ gap: 12 }}>
        <span className="sx-section-label">Buyurtma</span>
        <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{quote?.ok ? quote.title : `${group.brand} ${model.model}`}</span>
        {quote?.ok && quote.lines.map(line => <div key={line.k} className="sx-summary-line"><span>{line.k}</span><b>{line.v}</b></div>)}
        <div className="sx-summary-line"><span>Soni</span><b>{qtyNumber || "—"}</b></div>
        {price !== null && quote?.ok && <PriceBlock base={Math.round(price * Math.max(qtyNumber, 1) * 100) / 100} delta={quote.changes.length ? (quote.base - quote.standard) * Math.max(qtyNumber, 1) : null}/>}
        {quote && !quote.ok && <p className="sx-note is-error">{quote.error}</p>}
        {duplicate && <DuplicateQuestion text={duplicate} busy={pending} onYes={() => submit(true)} onNo={() => setDuplicate(null)}/>}
        {result && <SentNote result={result} onResent={setResult}/>}
        <button type="button" className={`sx-btn is-block ${result?.ok ? "is-green" : "is-primary"}`} disabled={pending || !ready || !!duplicate} aria-busy={pending} onClick={() => submit()}><BusyLabel busy={pending}>{result?.ok ? "✓ Sehga yuborildi" : "Buyurtma berish"}</BusyLabel></button>
        {result?.ok && <button type="button" className="sx-btn" onClick={() => { setResult(null); setNote(""); }}>Yana buyurtma berish</button>}
      </div>
      <TelegramPreview order={{ type: "AGREGAT", qty: qtyNumber || 1, purpose, customerName: customer || "…", dueDate: dueDate || null, note: note || null, sellerName: userName, details: quote?.ok ? quote.telegram : [], items: [{ title: quote?.ok ? quote.title : `${group.brand} ${model.model}`, qty: qtyNumber || 1 }] }}/>
    </div>
  </div>;
}

function ZapchastForm({ userName, parts, customers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState([{ partId: "", qty: "1" }]), [purpose, setPurpose] = useState<"SHOP" | "CLIENT">("SHOP"), [customer, setCustomer] = useState(""), [dueDate, setDueDate] = useState(""), [note, setNote] = useState("");
  const [result, setResult] = useState<SentResult | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const { busy: submittingRef, requestId, renew } = useSubmitOnce();
  const byId = new Map(parts.map(part => [part.id, part]));
  const ready = items.every(item => item.partId && Number(item.qty) >= 1) && (purpose === "SHOP" || customer.trim());
  const total = Math.round(items.reduce((sum, item) => sum + (byId.get(item.partId)?.basePriceUsd ?? 0) * (Number(item.qty) || 0), 0) * 100) / 100;
  const known = customers.find(item => item.name === customer.trim());
  const submit = (confirmDuplicate = false) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        setResult(null); setDuplicate(null);
        const response = await createZapchastOrderAction({ requestId, confirmDuplicate, items: items.map(item => ({ partId: item.partId, qty: Number(item.qty) })), purpose, customerId: purpose === "CLIENT" ? known?.id ?? null : null, customerName: purpose === "CLIENT" ? customer.trim() : null, dueDate: dueDate || null, note: note.trim() || null });
        if (!response.ok && response.duplicate) { setDuplicate(response.error); return; }
        setResult(sentResult(response, "Zayavka"));
        if (!response.ok) return;
        renew();
        setItems([{ partId: "", qty: "1" }]); setNote("");
        router.refresh();
      } finally { submittingRef.current = false; }
    });
  };
  if (!parts.length) return <div className="sx-card"><p className="sx-note">Seh zapchastlari hali kiritilmagan. Super Admin ularni Prays bo‘limida qo‘shadi.</p></div>;
  return <div className="sx-split">
    <div className="sx-main">
      <div className="sx-card">
        <div className="sx-card-head"><h2>Yangi zayavka</h2><span className="sx-muted">Sotuvchi: {userName}</span></div>
        <PartRows parts={parts.map(part => ({ id: part.id, label: part.label }))} items={items} setItems={next => { setItems(next); setResult(null); }} priceOf={id => { const part = byId.get(id); return part?.basePriceUsd === null || part?.basePriceUsd === undefined ? null : `Prays: ${formatUsd(part.basePriceUsd)}`; }}/>
        <PurposePicker purpose={purpose} setPurpose={setPurpose} customer={customer} setCustomer={setCustomer} customers={customers}/>
        <div className="sx-fields">
          <DateField label={<>Kerak bo‘ladigan sana <small>(ixtiyoriy)</small></>} value={dueDate} onChange={setDueDate}/>
          <label className="sx-field">Izoh<input value={note} onChange={event => setNote(event.target.value)} maxLength={500}/></label>
        </div>
        {total > 0 && <PriceBlock base={total} delta={null}/>}
        {duplicate && <DuplicateQuestion text={duplicate} busy={pending} onYes={() => submit(true)} onNo={() => setDuplicate(null)}/>}
        {result && <SentNote result={result} onResent={setResult}/>}
        <button type="button" className={`sx-btn is-block ${result?.ok ? "is-green" : "is-primary"}`} style={{ height: 50, fontSize: 15 }} disabled={pending || !ready || !!duplicate} aria-busy={pending} onClick={() => submit()}><BusyLabel busy={pending}>{result?.ok ? "✓ Sehga yuborildi" : "Zayavka yuborish"}</BusyLabel></button>
      </div>
    </div>
    <div className="sx-side">
      <TelegramPreview order={{ type: "ZAPCHAST", qty: 1, purpose, customerName: customer || "…", dueDate: dueDate || null, note: note || null, sellerName: userName, details: [], items: items.filter(item => item.partId).map(item => ({ title: byId.get(item.partId)?.label ?? "—", qty: Number(item.qty) || 0 })) }}/>
    </div>
  </div>;
}

type PreviewOrder = Pick<BotOrder, "type" | "qty" | "purpose" | "customerName" | "dueDate" | "note" | "sellerName" | "details" | "items">;
/** The personal message the Seh mas’uli receives in the bot (same text builder as the bot), with its first button. */
function TelegramPreview({ order }: { order: PreviewOrder }) {
  const message: BotOrder = { ...order, id: "preview", number: 0, noRequest: false, status: "NEW", startedAt: null, issuedAt: null, issuedByName: null };
  const [head, ...lines] = personalMessage(message, null).replace("#0000", "#…").split("\n");
  const buttons = personalKeyboard("preview", "NEW").inline_keyboard.flat();
  return <div className="sx-tg">
    <span className="sx-section-label" style={{ color: "#3E4A60" }}>Telegram · seh mas’uli</span>
    <div className="sx-tg-msg"><b style={{ color: "#1E4E8C" }}>BK bot · shaxsiy xabar</b><b>{head}</b>{lines.map((line, index) => <span key={index}>{line}</span>)}
      <div className="sx-tg-buttons">{buttons.map(button => <span key={button.callback_data} style={{ background: "#E2F3E8", color: "#1B6B43" }}>{button.text}</span>)}</div>
    </div>
    <span className="sx-muted" style={{ color: "#3E4A60" }}>Seh mas’uli botda qabul qiladi → navbat → terishni boshlaydi → “Chiqib ketdi”. Guruhga faqat yakuniy “✅ Sehdan chiqdi” boradi. Narx ko‘rinmaydi.</span>
  </div>;
}
