"use client";

import { useState, useTransition } from "react";
import { saveWorkshopLimitAction } from "@/app/admin/(protected)/settings/actions";
import { BusyLabel } from "@/components/admin/feedback";

/** Sozlamalar: how many orders the workshop should start per day. */
export function WorkshopLimitForm({ limit }: { limit: number }) {
  const [value, setValue] = useState(String(limit));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return <section className="bk-card" aria-labelledby="ws-limit-title" style={{ display: "grid", gap: 12 }}>
    <div><h2 id="ws-limit-title">Seh kunlik limiti</h2><p className="bk-muted">Seh mas’uli bir kunda nechta zakazni terishni boshlashi kerak. Limitdan oshsa faqat ogohlantiriladi.</p></div>
    <form className="bk-actions" onSubmit={event => { event.preventDefault(); startTransition(async () => { const result = await saveWorkshopLimitAction(Number(value)); setMessage(result.ok ? { ok: true, text: "Saqlandi ✓" } : { ok: false, text: result.error }); }); }}>
      <label className="bk-field" style={{ width: 140 }}><span>Kuniga</span><input value={value} onChange={event => { setValue(event.target.value.replace(/\D+/g, "")); setMessage(null); }} inputMode="numeric" aria-label="Seh kunlik limiti"/></label>
      <button type="submit" className="bk-btn is-primary" style={{ alignSelf: "end", minHeight: 44 }} disabled={pending || !value}><BusyLabel busy={pending}>Saqlash</BusyLabel></button>
      {message && <span className={`bk-muted`} role={message.ok ? "status" : "alert"} style={{ alignSelf: "end", paddingBottom: 12, color: message.ok ? "#1B6B43" : "#B42318", fontWeight: 700 }}>{message.text}</span>}
    </form>
  </section>;
}
