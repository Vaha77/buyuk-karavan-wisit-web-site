"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/admin/bklead/dialog";
import { removeUserAction, restoreUserAction, userRemovalPreviewAction } from "./actions";

/** 🗑 O‘chirish: the dialog says first whether the user is deleted or archived (linked records keep the history). */
export function RemoveUserButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState<{ mode: "delete" | "archive"; text: string } | null>(null), [open, setOpen] = useState(false), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const ask = () => startTransition(async () => { setError(""); setPlan(null); setOpen(true); const result = await userRemovalPreviewAction(userId); if (!result.ok) { setError(result.error); return; } setPlan({ mode: result.mode, text: result.text }); });
  const confirm = () => startTransition(async () => { setError(""); const result = await removeUserAction(userId); if (!result.ok) { setError(result.error); return; } setOpen(false); router.refresh(); });
  return <>
    <button type="button" className="admin-user-button is-danger" onClick={ask} disabled={pending}>🗑 O‘chirish</button>
    {open && <Dialog title={`${name} o‘chirilsinmi?`} onClose={() => setOpen(false)} busy={pending}>
      <div style={{ display: "grid", gap: 12 }}>
        {plan ? <p className="bk-note">{plan.text}</p> : !error && <p className="bk-muted">Tekshirilmoqda…</p>}
        <p className="bk-muted" style={{ fontSize: 13 }}>Sessiyalari yopiladi, Telegram bog‘lanishi uziladi.</p>
        {error && <p className="bk-note is-soft" role="alert">{error}</p>}
        <div className="bk-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="bk-btn" onClick={() => setOpen(false)} disabled={pending}>Yo‘q</button>
          <button type="button" className="bk-btn is-danger" onClick={confirm} disabled={pending || !plan}>{pending && plan ? "Bajarilmoqda…" : plan?.mode === "archive" ? "Ha, arxivlash" : "Ha, o‘chirish"}</button>
        </div>
      </div>
    </Dialog>}
  </>;
}

/** "Qayta tiklash" in the Arxiv filter. */
export function RestoreUserButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [error, setError] = useState(""), [pending, startTransition] = useTransition();
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
    <button type="button" className="admin-user-button is-outline" disabled={pending} onClick={() => startTransition(async () => { setError(""); const result = await restoreUserAction(userId); if (!result.ok) setError(result.error); else router.refresh(); })}>{pending ? "Tiklanmoqda…" : "Qayta tiklash"}</button>
    {error && <small style={{ color: "#B42318" }} role="alert">{error}</small>}
  </span>;
}
