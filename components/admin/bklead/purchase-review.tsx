"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { approvePurchaseAction, rejectPurchaseAction } from "@/app/admin/(protected)/customers/actions";
import { Dialog } from "./dialog";

/** Approve / reject (with a reason) one pending purchase. */
export function PurchaseReviewButtons({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false), [reason, setReason] = useState(""), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => {
    setError("");
    const result = await action();
    if (!result.ok) { setError(result.error ?? "Xatolik."); return; }
    setRejecting(false); router.refresh();
  });
  return <div className="bk-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
    <button type="button" className="bk-btn is-primary" disabled={pending} onClick={() => run(() => approvePurchaseAction(id))} aria-label={`${label} — tasdiqlash`}><Check size={15}/>Tasdiqlash</button>
    <button type="button" className="bk-btn is-danger-ghost" disabled={pending} onClick={() => { setError(""); setRejecting(true); }} aria-label={`${label} — rad etish`}><X size={15}/>Rad etish</button>
    {error && !rejecting && <span className="bk-status-line is-bad" role="alert">{error}</span>}
    {rejecting && <Dialog title="Xaridni rad etish" onClose={() => setRejecting(false)} busy={pending}>
      <form onSubmit={event => { event.preventDefault(); run(() => rejectPurchaseAction(id, reason)); }} style={{ display: "grid", gap: 12 }}>
        <p className="bk-muted">{label}</p>
        <label className="bk-field"><span>Sabab (sotuvchi ko‘radi)</span><input value={reason} onChange={event => setReason(event.target.value)} maxLength={300} required minLength={3}/></label>
        {error && <p className="bk-note is-soft" role="alert">{error}</p>}
        <div className="bk-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="bk-btn" onClick={() => setRejecting(false)} disabled={pending}>Bekor qilish</button><button type="submit" className="bk-btn is-danger" disabled={pending || reason.trim().length < 3}>Rad etish</button></div>
      </form>
    </Dialog>}
  </div>;
}
