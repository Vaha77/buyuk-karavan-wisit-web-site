"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, Dialog } from "@/components/admin/bklead/dialog";
import { BusyLabel } from "@/components/admin/feedback";
import { createNoRequestAction, transitionOrderAction } from "@/app/admin/(sex)/seh/actions";
import type { OrderRow } from "@/lib/sex/queries";
import { ACTION_LABEL, dailyCapView, daysPastDue, workingSince, type OrderAction } from "@/lib/sex/rules";
import { IssueForm, NoRequestForm } from "./orders-board";

type Option = { id: string; name: string };
type Props = { userName: string; rows: OrderRow[]; started: number; limit: number; issuedToday: string[]; parts: Array<{ id: string; label: string }>; sellers: Option[]; customers: Option[] };

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const dueLabel = (date: string) => { const [, month, day] = date.split("-"); return `${day}-${MONTHS[Number(month) - 1]}`; };
// Stage colours of the receipt's top stripe and its button (design seh-panel.dc.html).
const STAGE: Record<"NEW" | "ACCEPTED" | "STARTED", { action: OrderAction; top: string; button: string }> = {
  NEW: { action: "accept", top: "#1E4E8C", button: "#1E4E8C" },
  ACCEPTED: { action: "start", top: "#7B97C4", button: "#B8860B" },
  STARTED: { action: "issue", top: "#F2C230", button: "#1B6B43" },
};
const SECTIONS = [
  { status: "NEW" as const, title: "Yangi zakazlar", dot: "#1E4E8C", hint: "Ko‘rib chiqib qabul qiling", empty: "Yangi zakaz yo‘q" },
  { status: "ACCEPTED" as const, title: "Navbatda", dot: "#7B97C4", hint: "Qabul qilingan · navbat bilan terasiz", empty: "Navbat bo‘sh" },
  { status: "STARTED" as const, title: "Terilmoqda", dot: "#F2C230", hint: "Tayyor bo‘lgach “Chiqib ketdi”", empty: "Hozir hech narsa terilmayapti" },
];

function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
  return now;
}

/** WORKSHOP view of /admin/seh: three sections of receipt cards (Yangi → Navbatda → Terilmoqda). No prices anywhere. */
export function WorkshopBoard({ userName, rows, started, limit, issuedToday, parts, sellers, customers }: Props) {
  const router = useRouter();
  const now = useMinuteClock();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [issuing, setIssuing] = useState<OrderRow | null>(null);
  const [confirmStart, setConfirmStart] = useState<OrderRow | null>(null);
  const [noRequestOpen, setNoRequestOpen] = useState(false);
  const cap = dailyCapView(started, limit);
  const firstName = userName.trim().split(/\s+/)[0] || userName;

  const run = (task: () => Promise<{ ok: boolean; error?: string }>, key: string | null, after?: () => void) => {
    setBusyKey(key);
    startTransition(async () => {
      setError("");
      const result = await task();
      if (!result.ok) { setError(result.error ?? "Xatolik."); return; }
      after?.(); router.refresh();
    });
  };
  const press = (row: OrderRow, action: OrderAction) => {
    if (action === "issue" && row.type === "ZAPCHAST") { setIssuing(row); return; }
    // The daily limit only warns: past it, starting asks for a confirmation.
    if (action === "start" && started >= limit) { setConfirmStart(row); return; }
    run(() => transitionOrderAction({ id: row.id, action }), `${row.id}:${action}`);
  };

  return <div className="sx sx-panel">
    <div className="sx-head">
      <div><span className="sx-crumb">Seh / Mening vazifalarim</span><h1>Salom, {firstName}</h1><p className="sx-lead">Qabul qiling → navbatda turadi → terishni boshlang → tayyor bo‘lgach “Chiqib ketdi”</p></div>
      <div className="sx-actions">
        <div className="sx-cap"><span>Bugun terish boshlandi</span><div><b className={cap.tone === "red" ? "is-red" : ""}>{started} / {limit}</b><small className={cap.tone === "red" ? "is-red" : ""}>{cap.note}</small></div></div>
        <button type="button" className="sx-btn is-warn" style={{ height: 48 }} onClick={() => setNoRequestOpen(true)} disabled={!parts.length}>+ Zayavkasiz chiqim</button>
      </div>
    </div>
    {error && <p className="sx-note is-error" role="alert">{error}</p>}

    {SECTIONS.map(section => {
      const cards = rows.filter(row => row.status === section.status).sort((a, b) => section.status === "ACCEPTED" ? (a.queue ?? 0) - (b.queue ?? 0) : 0);
      return <section key={section.status} className="sx-panel-section" aria-labelledby={`sx-sec-${section.status}`}>
        <div className="sx-panel-title"><span style={{ background: section.dot }}/><h2 id={`sx-sec-${section.status}`}>{section.title}</h2><b>{cards.length}</b><small>{section.hint}</small></div>
        {cards.length ? <div className="sx-receipts">{cards.map(row => {
          const stage = STAGE[section.status], late = daysPastDue(row.dueDate, now) > 0, key = `${row.id}:${stage.action}`;
          const items = row.type === "AGREGAT" ? [{ id: row.items[0]?.id ?? row.id, title: row.items[0]?.title ?? row.product, qty: row.qty }] : row.items.map(item => ({ id: item.id, title: item.title, qty: item.qty }));
          return <article key={row.id} className="sx-receipt">
            <div className="sx-receipt-body" style={{ borderTopColor: late ? "#D2372B" : stage.top }}>
              <div className="sx-receipt-head">
                <div><span className="sx-mono sx-receipt-brand">BUYUK KARAVAN · SEH</span><b className="sx-mono sx-receipt-no">{row.number}</b></div>
                {section.status === "ACCEPTED" && row.queue && <span className="sx-queue"><b>{row.queue}</b><span>NAVBAT</span></span>}
                <span className="sx-tag">{row.type === "AGREGAT" ? "Agregat" : "Zapchast"}</span>
              </div>
              <hr className="sx-dash"/>
              <div className="sx-mono sx-receipt-items">{items.map(item => <div key={item.id}><span>{item.title}</span><b>×{item.qty}</b></div>)}</div>
              {row.note && <div className="sx-receipt-note">Izoh: {row.note}</div>}
              <hr className="sx-dash"/>
              <dl className="sx-receipt-meta">
                <dt>Kimga</dt><dd style={{ color: row.purpose === "SHOP" ? "#3E4A60" : "#1E4E8C" }}>{row.purpose === "SHOP" ? "Vitrina" : `Mijoz: ${row.customerName ?? "—"}`}</dd>
                <dt>Sotuvchi</dt><dd>{row.sellerName}</dd>
                <dt>Muddat</dt><dd style={{ color: late ? "#A41F15" : undefined }}>{row.dueDate ? dueLabel(row.dueDate) : "—"}</dd>
                <dt>Keldi</dt><dd style={{ fontWeight: 400 }}>{row.sellerAt}</dd>
              </dl>
              {section.status === "STARTED" && row.startedAt && <div className={`sx-receipt-working${late ? " is-late" : ""}`}>
                <span className="sx-wave-fill" aria-hidden/>
                <svg className="sx-wrench" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>
                <span><b>Terilmoqda</b><small suppressHydrationWarning>{workingSince(row.startedAt, now)}{late ? " · muddat o‘tdi" : ""}</small></span>
              </div>}
              <button type="button" className="sx-receipt-button" style={{ background: stage.button }} disabled={pending} aria-busy={pending && busyKey === key} onClick={() => press(row, stage.action)}><BusyLabel busy={pending && busyKey === key}>{ACTION_LABEL[stage.action]}</BusyLabel></button>
            </div>
            <div className="sx-receipt-zig" aria-hidden/>
          </article>;
        })}</div> : <div className="sx-panel-empty">{section.empty}</div>}
      </section>;
    })}

    {issuedToday.length > 0 && <div className="sx-done-today"><b>Bugun chiqib ketdi:</b>{issuedToday.map(number => <span key={number}>{number} ✓</span>)}</div>}
    <p className="sx-muted">Seh narxni ko‘rmaydi.</p>

    {confirmStart && <ConfirmDialog title="Kunlik limit" message={`Bugun ${started} ta boshlangan. Baribir boshlaysizmi?`} confirmLabel="Ha, boshlayman" busy={pending} error={error || undefined}
      onClose={() => setConfirmStart(null)} onConfirm={() => run(() => transitionOrderAction({ id: confirmStart.id, action: "start" }), `${confirmStart.id}:start`, () => setConfirmStart(null))}/>}
    {issuing && <Dialog title={`${issuing.number} · Chiqib ketdi`} onClose={() => setIssuing(null)} busy={pending}>
      <IssueForm row={issuing} busy={pending} onSubmit={issuedQty => run(() => transitionOrderAction({ id: issuing.id, action: "issue", issuedQty }), `${issuing.id}:issue`, () => setIssuing(null))}/>
      {error && <p className="sx-note is-error" role="alert" style={{ marginTop: 10 }}>{error}</p>}
    </Dialog>}
    {noRequestOpen && <Dialog title="Zayavkasiz chiqim" onClose={() => setNoRequestOpen(false)} busy={pending} wide>
      <NoRequestForm parts={parts} sellers={sellers} customers={customers} busy={pending} onSubmit={draft => run(() => createNoRequestAction(draft), null, () => setNoRequestOpen(false))}/>
      {error && <p className="sx-note is-error" role="alert" style={{ marginTop: 10 }}>{error}</p>}
    </Dialog>}
  </div>;
}
