"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteEntryAction, restoreEntryAction } from "@/app/admin/(protected)/kassa/actions";

/** 🗑 on a desktop row, or the red ghost "O‘chirish" in the correction panel: confirm with an optional reason, then the undo toast. */
export function DeleteEntryButton({ id, label, ghost }: { id: string; label: string; ghost?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const confirm = () => start(async () => {
    const result = await deleteEntryAction(id, reason);
    if (!result.ok) return setError(result.error);
    dialog.current?.close();
    window.dispatchEvent(new CustomEvent("kassa:deleted", { detail: id }));
  });
  return <>
    <button type="button" className={ghost ? "btn-ghost kassa-delete" : "kassa-trash"} aria-label={`O‘chirish: ${label}`} onClick={() => { setError(""); dialog.current?.showModal(); }}>{ghost ? "O‘chirish" : <Trash2 size={15}/>}</button>
    <dialog ref={dialog} className="glass kassa-dialog" onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <p><b>{label}</b> — o‘chirilsinmi?</p>
      <input value={reason} onChange={event => setReason(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); confirm(); } }} maxLength={200} placeholder="Sabab (ixtiyoriy), masalan: qaytarib berildi" aria-label="Sabab"/>
      {error && <p className="kassa-error" role="alert">{error}</p>}
      <div><button type="button" className="btn-ghost" onClick={() => dialog.current?.close()}>Bekor</button><button type="button" className="btn-ghost kassa-delete" onClick={confirm} disabled={pending}>{pending ? "O‘chirilmoqda…" : "O‘chirish"}</button></div>
    </dialog>
  </>;
}

/** "O‘chirildi · Qaytarish" for 6 seconds after a delete (mounted once on the page, so it outlives the removed row). */
export function KassaUndoToast() {
  const [id, setId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onDeleted = (event: Event) => { clearTimeout(timer); setId((event as CustomEvent<string>).detail); timer = setTimeout(() => setId(null), 6000); };
    window.addEventListener("kassa:deleted", onDeleted);
    return () => { window.removeEventListener("kassa:deleted", onDeleted); clearTimeout(timer); };
  }, []);
  if (!id) return null;
  return <div className="glass-blur kassa-toast" role="status">O‘chirildi<button type="button" disabled={pending} onClick={() => start(async () => { await restoreEntryAction(id); setId(null); })}>Qaytarish</button></div>;
}
