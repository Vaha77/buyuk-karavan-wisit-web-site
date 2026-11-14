"use client";

import { useState, useTransition } from "react";
import { saveImportApproverAction } from "@/app/admin/(protected)/settings/actions";
import { BusyLabel } from "@/components/admin/feedback";
import { roleLabel } from "@/lib/telegram/start-rules";

/** Sozlamalar (Super Admin): who approves import orders. */
export function ImportApproverForm({ approverId, users }: { approverId: string | null; users: Array<{ id: string; name: string; role: string }> }) {
  const [value, setValue] = useState(approverId ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return <section className="bk-card" aria-labelledby="imp-approver-title" style={{ display: "grid", gap: 12 }}>
    <div><h2 id="imp-approver-title">Import buyurtma — tasdiqlovchi</h2><p className="bk-muted">Tanlangan foydalanuvchi import zayavkalarini tasdiqlaydi va narxlarni ko‘radi; yangi zayavka unga Telegram orqali keladi.</p></div>
    <form className="bk-actions" onSubmit={event => { event.preventDefault(); startTransition(async () => { const result = await saveImportApproverAction(value || null); setMessage(result.ok ? { ok: true, text: "Saqlandi ✓" } : { ok: false, text: result.error }); }); }}>
      <label className="bk-field" style={{ minWidth: 0, flex: "1 1 240px" }}><span>Tasdiqlovchi</span>
        <select value={value} onChange={event => { setValue(event.target.value); setMessage(null); }}>
          <option value="">— tanlanmagan (faqat Super Admin) —</option>
          {users.map(user => <option key={user.id} value={user.id}>{user.name} · {roleLabel(user.role)}</option>)}
        </select>
      </label>
      <button type="submit" className="bk-btn is-primary" style={{ alignSelf: "end", minHeight: 44 }} disabled={pending}><BusyLabel busy={pending}>Saqlash</BusyLabel></button>
      {message && <span className="bk-muted" role={message.ok ? "status" : "alert"} style={{ alignSelf: "end", paddingBottom: 12, color: message.ok ? "#34d399" : "#fb7185", fontWeight: 700 }}>{message.text}</span>}
    </form>
  </section>;
}
