"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { approvePurchaseAction, rejectPurchaseAction } from "@/app/admin/(protected)/customers/actions";
import { checkStoreDiffAction, rejectCorrectionAction, resolveRejectedAction } from "@/app/admin/(sex)/seh/actions";
import { LinkButton } from "@/components/admin/feedback";
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

/** Seh "Tuzatish so‘rovi" (SUPER_ADMIN): open the order's edit form, or reject with a reason (the requester gets it in Telegram). */
export function CorrectionReviewButtons({ id, href, label }: { id: string; href: string; label: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false), [reason, setReason] = useState(""), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const reject = () => startTransition(async () => {
    setError("");
    const result = await rejectCorrectionAction({ id, reason });
    if (!result.ok) { setError(result.error); return; }
    setRejecting(false); router.refresh();
  });
  return <div className="bk-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
    <LinkButton className="bk-btn is-primary" href={href}>Ko‘rib tahrirlash</LinkButton>
    <button type="button" className="bk-btn is-danger-ghost" disabled={pending} onClick={() => { setError(""); setRejecting(true); }} aria-label={`${label} — rad etish`}><X size={15}/>Rad etish</button>
    {rejecting && <Dialog title="Tuzatish so‘rovini rad etish" onClose={() => setRejecting(false)} busy={pending}>
      <form onSubmit={event => { event.preventDefault(); reject(); }} style={{ display: "grid", gap: 12 }}>
        <p className="bk-muted">{label}</p>
        <label className="bk-field"><span>Sabab (so‘rovchi Telegramda ko‘radi)</span><input value={reason} onChange={event => setReason(event.target.value)} maxLength={300} required minLength={3}/></label>
        {error && <p className="bk-note is-soft" role="alert">{error}</p>}
        <div className="bk-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="bk-btn" onClick={() => setRejecting(false)} disabled={pending}>Bekor qilish</button><button type="submit" className="bk-btn is-danger" disabled={pending || reason.trim().length < 3}>Rad etish</button></div>
      </form>
    </Dialog>}
  </div>;
}

/** Omborchi shortage report: Super Admin marks it seen ("Tasdiqlash"). */
export function StoreDiffButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const check = () => startTransition(async () => {
    setError("");
    const result = await checkStoreDiffAction(id);
    if (!result.ok) { setError(result.error); return; }
    router.refresh();
  });
  return <div className="bk-actions" style={{ justifyContent: "flex-end" }}>
    <button type="button" className="bk-btn is-primary" disabled={pending} onClick={check} aria-label={`${label} — tasdiqlash`}><Check size={15}/>Tasdiqlash</button>
    {error && <span className="bk-muted" role="alert">{error}</span>}
  </div>;
}

/** Seh "Meniki emas" (SUPER_ADMIN): "Boshqa sotuvchiga o‘tkazish" (the order resumes, that seller confirms it) or "Bekor qilish". */
export function RejectedOrderButtons({ id, label, sellers }: { id: string; label: string; sellers: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [sellerId, setSellerId] = useState(""), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const run = (to: string | null) => startTransition(async () => {
    setError("");
    const result = await resolveRejectedAction({ id, sellerId: to });
    if (!result.ok) { setError(result.error); return; }
    router.refresh();
  });
  return <div className="bk-actions" style={{ justifyContent: "flex-end" }}>
    <label className="bk-field" style={{ minWidth: 150 }}><select value={sellerId} onChange={event => setSellerId(event.target.value)} aria-label={`${label} — yangi sotuvchi`}><option value="">Sotuvchi…</option>{sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</select></label>
    <button type="button" className="bk-btn is-primary" disabled={pending || !sellerId} onClick={() => run(sellerId)}>Boshqa sotuvchiga o‘tkazish</button>
    <button type="button" className="bk-btn is-danger-ghost" disabled={pending} onClick={() => run(null)} aria-label={`${label} — bekor qilish`}><X size={15}/>Bekor qilish</button>
    {error && <span className="bk-status-line is-bad" role="alert">{error}</span>}
  </div>;
}
