"use client";
import { useEffect, useState, useTransition } from "react";
import { revealPasswordAction, setUserPasswordAction } from "./actions";

const HIDE_AFTER_MS = 30_000;

/** ●●●●●● + 👁 (fetched from the server on click only, hidden again after 30 s) + Nusxalash + ✏️ (the Super Admin types a new one). */
export function PasswordCell({ userId, stored, viewEnabled }: { userId: string; stored: boolean; viewEnabled: boolean }) {
  const [shown, setShown] = useState<string | null>(null), [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const [error, setError] = useState(""), [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => { if (!shown) return; const timer = setTimeout(() => setShown(null), HIDE_AFTER_MS); return () => clearTimeout(timer); }, [shown]);
  const fetchPassword = async () => { const result = await revealPasswordAction(userId); if (!result.ok) { setError(result.error); return null; } return result.password; };
  const reveal = () => startTransition(async () => { setError(""); setNote(""); if (shown) { setShown(null); return; } const password = await fetchPassword(); if (password) setShown(password); });
  const copy = () => startTransition(async () => { setError(""); const password = shown ?? await fetchPassword(); if (!password) return; try { await navigator.clipboard.writeText(password); setNote("Nusxalandi ✓"); } catch { setError("Nusxalab bo‘lmadi."); } });
  const save = () => startTransition(async () => { setError(""); const result = await setUserPasswordAction(userId, draft); if (!result.ok) { setError(result.error); return; } setEditing(false); setDraft(""); setShown(null); setNote("Yangi parol saqlandi ✓"); });
  if (editing) return <div className="admin-password-cell">
    <input type="text" value={draft} onChange={event => setDraft(event.target.value)} minLength={12} maxLength={72} placeholder="Yangi parol (12+ belgi)" aria-label="Yangi parol" autoComplete="off"/>
    <button type="button" className="admin-user-button is-outline" onClick={save} disabled={pending || draft.length < 12}>{pending ? "…" : "Saqlash"}</button>
    <button type="button" className="admin-user-button is-outline" onClick={() => { setEditing(false); setDraft(""); setError(""); }} aria-label="Bekor qilish">×</button>
    {error && <small className="is-error" role="alert">{error}</small>}
  </div>;
  return <div className="admin-password-cell">
    {stored ? <code aria-live="polite">{shown ?? "●●●●●●"}</code> : <small className="is-muted">Parol saqlanmagan · ✏️ yangisini o‘rnating</small>}
    {stored && <button type="button" className="admin-user-button is-outline is-icon" onClick={reveal} disabled={pending || !viewEnabled} title={viewEnabled ? (shown ? "Yashirish" : "Ko‘rish (30 soniya)") : "Vercel’da PASSWORD_VIEW_KEY o‘rnating"} aria-label="Parolni ko‘rish">👁</button>}
    {stored && <button type="button" className="admin-user-button is-outline" onClick={copy} disabled={pending || !viewEnabled}>Nusxalash</button>}
    <button type="button" className="admin-user-button is-outline is-icon" onClick={() => { setEditing(true); setError(""); setNote(""); }} title="Parolni o‘zgartirish" aria-label="Parolni o‘zgartirish">✏️</button>
    {!viewEnabled && stored && <small className="is-muted">Vercel’da PASSWORD_VIEW_KEY o‘rnating</small>}
    {note && <small className="is-ok" role="status">{note}</small>}
    {error && <small className="is-error" role="alert">{error}</small>}
  </div>;
}
