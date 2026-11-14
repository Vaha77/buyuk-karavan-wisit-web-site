"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideImportOrderAction } from "@/app/admin/(import)/import/actions";
import { BusyLabel } from "@/components/admin/feedback";

export type ApproveOrder = {
  id: string; number: string; created: string; seller: string; catalogs: string; sum: string; neededBy: string; client: string; comment: string;
  items: Array<{ id: string; model: string; nameUz: string; qty: number }>;
};

/** "Tasdiqlash kerak": PENDING import orders with approve / edit quantities / return / reject. */
export function ApproveBoard({ orders }: { orders: ApproveOrder[] }) {
  const withSum = orders.some(order => order.sum);
  return <section className="bk-card impa-board">
    <h2 className="impa-title">Tasdiqlash kerak <span className="impa-pill p3">{orders.length} ta</span></h2>
    {orders.length ? <div className="bk-table-wrap"><table className="bk-table impa-table">
      <thead><tr><th>Zayavka</th><th>Sotuvchi</th><th>Katalog</th><th>Pozitsiya</th>{withSum && <th className="impa-hm">Summa</th>}<th className="impa-hm">Muddat</th><th>Mijoz / Izoh</th><th>Amal</th></tr></thead>
      <tbody>{orders.map(order => <OrderRow key={order.id} order={order} withSum={withSum}/>)}</tbody>
    </table></div> : <div className="bk-empty">Tasdiq kutayotgan zayavka yo‘q.</div>}
    <p className="bk-muted">Tasdiqlangan zayavka avtomatik “Zavod bo‘yicha yig‘ma”ga tushadi. Qaytarilgani sotuvchiga izoh bilan boradi.</p>
  </section>;
}

function OrderRow({ order, withSum }: { order: ApproveOrder; withSum: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"edit" | "return" | "reject" | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const decide = (decision: "approve" | "return" | "reject") => startTransition(async () => {
    // Only lines whose number was actually changed are sent as approvedQty.
    const quantities = Object.fromEntries(order.items.filter(item => qty[item.id] != null && qty[item.id] !== "" && Number(qty[item.id]) !== item.qty).map(item => [item.id, Number(qty[item.id])]));
    const result = await decideImportOrderAction({ orderId: order.id, decision, note: note.trim() || null, quantities: decision === "approve" && mode === "edit" ? quantities : undefined });
    if (!result.ok) { setMessage({ ok: false, text: result.error }); return; }
    setMessage({ ok: true, text: result.already ? "Allaqachon bajarilgan." : { approve: "Tasdiqlandi ✓", return: "Qaytarildi ↩", reject: "Rad etildi ✕" }[decision] });
    setMode(null);
    router.refresh();
  });
  const open = (next: typeof mode) => { setMode(mode === next ? null : next); setMessage(null); };
  return <tr>
    <td><b>{order.number}</b><br/><span className="bk-muted">{order.created}</span></td>
    <td>{order.seller}</td>
    <td>{order.catalogs}</td>
    <td><ul className="impa-lines">{order.items.map(item => <li key={item.id}>{item.model} — {item.nameUz} × {mode === "edit"
      ? <input className="impa-qty" inputMode="numeric" aria-label={`${item.model} soni`} value={qty[item.id] ?? String(item.qty)} onChange={event => setQty({ ...qty, [item.id]: event.target.value.replace(/\D+/g, "").slice(0, 5) })}/>
      : <b>{item.qty}</b>}</li>)}</ul></td>
    {withSum && <td className="impa-hm">{order.sum || "—"}</td>}
    <td className="impa-hm">{order.neededBy || "—"}</td>
    <td>{order.client && <div>{order.client}</div>}{order.comment && <div className="bk-muted">{order.comment}</div>}{!order.client && !order.comment && "—"}</td>
    <td><div className="impa-actions">
      <button type="button" className="impa-btn is-green" disabled={pending} onClick={() => decide("approve")}><BusyLabel busy={pending} busyText="…">✓ Tasdiqlash</BusyLabel></button>
      <button type="button" className="impa-btn" disabled={pending} aria-pressed={mode === "edit"} onClick={() => open("edit")}>✎ Sonini o‘zgartirish</button>
      <button type="button" className="impa-btn is-red" disabled={pending} aria-pressed={mode === "return"} onClick={() => open("return")}>↩ Izoh bilan qaytarish</button>
      <button type="button" className="impa-btn is-red" disabled={pending} aria-pressed={mode === "reject"} onClick={() => open("reject")}>✕ Rad etish</button>
      {(mode === "return" || mode === "reject") && <div className="impa-confirm">
        <textarea className="impa-note" rows={2} maxLength={500} value={note} onChange={event => setNote(event.target.value)} aria-label="Izoh" placeholder={mode === "return" ? "Qaytarish sababi (majburiy)" : "Izoh (ixtiyoriy)"}/>
        <button type="button" className="impa-btn is-red" disabled={pending || (mode === "return" && !note.trim())} onClick={() => decide(mode)}>{mode === "return" ? "↩ Qaytarish" : "✕ Rad etish"}</button>
      </div>}
      {message && <span role={message.ok ? "status" : "alert"} className={message.ok ? "impa-ok" : "impa-err"}>{message.text}</span>}
    </div></td>
  </tr>;
}
