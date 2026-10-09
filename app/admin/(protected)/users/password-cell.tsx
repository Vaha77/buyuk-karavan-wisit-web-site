"use client";
import { useEffect, useState, useTransition } from "react";
import { revealPasswordAction } from "./actions";

const HIDE_AFTER_MS = 30_000;

/** ●●●●●● + 👁 (fetched from the server on click only, hidden again after 30 s) + Nusxalash. Nothing else. */
export function PasswordCell({ userId, stored, viewEnabled }: { userId: string; stored: boolean; viewEnabled: boolean }) {
  const [shown, setShown] = useState<string | null>(null), [error, setError] = useState(""), [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => { if (!shown) return; const timer = setTimeout(() => setShown(null), HIDE_AFTER_MS); return () => clearTimeout(timer); }, [shown]);
  const fetchPassword = async () => { const result = await revealPasswordAction(userId); if (!result.ok) { setError(result.error); return null; } return result.password; };
  const reveal = () => startTransition(async () => { setError(""); setNote(""); if (shown) { setShown(null); return; } const password = await fetchPassword(); if (password) setShown(password); });
  const copy = () => startTransition(async () => { setError(""); const password = shown ?? await fetchPassword(); if (!password) return; try { await navigator.clipboard.writeText(password); setNote("Nusxalandi ✓"); } catch { setError("Nusxalab bo‘lmadi."); } });
  if (!stored) return <div className="admin-password-cell"><small className="is-muted">Xodim saytga bir marta kirgach ko‘rinadi</small></div>;
  return <div className="admin-password-cell">
    <code aria-live="polite">{shown ?? "●●●●●●"}</code>
    <button type="button" className="admin-user-button is-outline is-icon" onClick={reveal} disabled={pending || !viewEnabled} title={viewEnabled ? (shown ? "Yashirish" : "Ko‘rish (30 soniya)") : "Vercel’da PASSWORD_VIEW_KEY o‘rnating"} aria-label="Parolni ko‘rish">👁</button>
    <button type="button" className="admin-user-button is-outline" onClick={copy} disabled={pending || !viewEnabled}>Nusxalash</button>
    {!viewEnabled && <small className="is-muted">Vercel’da PASSWORD_VIEW_KEY o‘rnating</small>}
    {note && <small className="is-ok" role="status">{note}</small>}
    {error && <small className="is-error" role="alert">{error}</small>}
  </div>;
}
