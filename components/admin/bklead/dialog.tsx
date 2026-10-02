"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Modal shell for .bk pages: Escape and backdrop close it (unless busy), focus moves to the first field. */
export function Dialog({ title, onClose, busy = false, wide = false, children }: { title: string; onClose: () => void; busy?: boolean; wide?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("input,select,button:not(.bk-dialog-close)")?.focus(); }, []);
  return <div className="bk-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={ref} className={`bk bk-dialog bk-card bk-dialog-panel${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="bk-dialog-title">
      <div className="bk-card-head"><h2 id="bk-dialog-title">{title}</h2><button type="button" className="bk-btn bk-icon-btn bk-dialog-close" onClick={onClose} disabled={busy} aria-label="Yopish"><X size={16}/></button></div>
      {children}
    </div>
  </div>;
}

/** Yes/no confirmation for destructive actions. */
export function ConfirmDialog({ title, message, confirmLabel = "O‘chirish", busy, error, onConfirm, onClose }: { title: string; message: string; confirmLabel?: string; busy: boolean; error?: string; onConfirm: () => void; onClose: () => void }) {
  return <Dialog title={title} onClose={onClose} busy={busy}>
    <p style={{ fontSize: 14 }}>{message}</p>
    {error && <p className="bk-note is-soft" role="alert" style={{ marginTop: 12 }}>{error}</p>}
    <div className="bk-actions" style={{ justifyContent: "flex-end", marginTop: 18 }}>
      <button type="button" className="bk-btn" onClick={onClose} disabled={busy}>Bekor qilish</button>
      <button type="button" className="bk-btn is-danger" onClick={onConfirm} disabled={busy}>{busy ? "O‘chirilmoqda…" : confirmLabel}</button>
    </div>
  </Dialog>;
}
