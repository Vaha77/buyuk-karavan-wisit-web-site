"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { dismissDirectAction, saveDirectSettingsAction } from "@/app/admin/(protected)/instagram/actions";
import { BusyLabel } from "@/components/admin/feedback";
import { withAccount } from "@/lib/instagram/constants";
import { STATUS_LABELS, directLink, duration, messagePreview, personLabel, type DirectStatus } from "@/lib/instagram/direct-rules";
import type { DirectBoard as Board } from "@/lib/instagram/direct-queries";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const STATUS_CLASS: Record<DirectStatus, string> = { UNREAD: "is-bad", OPENED: "is-wait", ANSWERED: "is-ok", DISMISSED: "" };
const time = (iso: string) => new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function useAction() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>) => startTransition(async () => { const result = await action(); setMessage(result.ok ? { ok: true, text: result.message ?? "Bajarildi ✓" } : { ok: false, text: result.error }); });
  return { pending, run, note: message && <span className={message.ok ? "ig-ok" : "ig-error"} role={message.ok ? "status" : "alert"}>{message.text}</span>, clear: () => setMessage(null) };
}

function Settings({ accountId, groupChatId, settings, recipients }: { accountId: string; groupChatId: string | null; settings: NonNullable<Board["settings"]>; recipients: Board["recipients"] }) {
  const [form, setForm] = useState(settings);
  const { pending, run, note, clear } = useAction();
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => { setForm(current => ({ ...current, [key]: value })); clear(); };
  return <form className="bk-card ig-general" onSubmit={event => { event.preventDefault(); run(() => saveDirectSettingsAction({ ...form, accountId })); }}>
    <div><h2>Direct → Telegram</h2><p className="bk-muted">Madina Direct’da javob bermaydi. Har yangi yozishma Telegram’ga keladi; 30 daqiqada javob bo‘lmasa eslatma, 2 soatda Super Admin’ga ham. Ish vaqtidan tashqari kelganlar ertalab bitta ro‘yxat bo‘lib keladi, kechqurun hisobot.</p></div>
    <div className="bk-actions">
      <label className="bk-field" style={{ width: 120 }}><span>Ish boshlanishi</span><input value={form.workStart} onChange={event => set("workStart", event.target.value)} placeholder="09:00"/></label>
      <label className="bk-field" style={{ width: 120 }}><span>Ish tugashi</span><input value={form.workEnd} onChange={event => set("workEnd", event.target.value)} placeholder="20:00"/></label>
    </div>
    <label className="ig-switch"><input type="checkbox" checked={form.autoAckEnabled} onChange={event => set("autoAckEnabled", event.target.checked)}/><span>Birinchi yozganda bir martalik avto-xabar</span></label>
    {form.autoAckEnabled && <label className="bk-field"><span>Avto-xabar <small className="bk-muted">(narx yoki boshqa ma’lumot yozmang)</small></span><textarea rows={2} value={form.autoAckText} onChange={event => set("autoAckText", event.target.value)} maxLength={600}/></label>}
    <p className="bk-muted">Telegram’da oladi: {groupChatId ? `guruh ${groupChatId} (Kommentlar → Akkaunt va aloqa)` : recipients.length ? recipients.map(person => `${person.name}${person.linked ? "" : " (Telegram ulanmagan)"}`).join(", ") : "hech kim — Foydalanuvchilar sahifasida “Instagram so‘rovlarini oladi”ni belgilang"}.</p>
    <div className="bk-actions"><button type="submit" className="bk-btn is-primary" disabled={pending}><BusyLabel busy={pending}>Saqlash</BusyLabel></button>{note}</div>
  </form>;
}

function DismissButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState("Spam");
  const { pending, run, note } = useAction();
  if (!open) return <button type="button" className="bk-btn" onClick={() => setOpen(true)}>Kerak emas</button>;
  return <form className="ig-dismiss" onSubmit={event => { event.preventDefault(); run(() => dismissDirectAction(id, reason)); }}>
    <select value={reason} onChange={event => setReason(event.target.value)} aria-label="Sabab">{["Spam", "Reklama", "Kerak emas", "Boshqa kanal orqali javob berildi"].map(item => <option key={item}>{item}</option>)}</select>
    <button type="submit" className="bk-btn is-danger-ghost" disabled={pending}><BusyLabel busy={pending} busyText="…">Tasdiqlash</BusyLabel></button>
    <button type="button" className="bk-btn" onClick={() => setOpen(false)}>Bekor</button>{note}
  </form>;
}

export function DirectBoard({ board, status }: { board: Board; status: DirectStatus | null }) {
  const now = board.now;
  if (!board.connected || !board.settings) return <div className="bk-empty"><strong>Instagram ulanmagan</strong><span>Sozlamalar → Instagram</span></div>;
  const total = Object.values(board.counts).reduce((sum, value) => sum + (value ?? 0), 0);
  return <div className="ig">
    <Settings accountId={board.accountId} groupChatId={board.groupChatId} settings={board.settings} recipients={board.recipients}/>
    <section className="bk-card" aria-labelledby="ig-direct">
      <div className="bk-card-head"><div><h2 id="ig-direct">Yozishmalar</h2><p className="bk-muted">“Javob berildi” faqat Instagram’dan javob yozilganda (avto-xabarlar hisobga olinmaydi)</p></div></div>
      <nav className="bk-chips" aria-label="Holat">
        <Link className={`bk-chip${status ? "" : " is-active"}`} href={withAccount("/admin/instagram?tab=direct", board.accountId)}>Hammasi<small>{total}</small></Link>
        {(Object.keys(STATUS_LABELS) as DirectStatus[]).map(key => <Link key={key} className={`bk-chip${status === key ? " is-active" : ""}`} href={withAccount(`/admin/instagram?tab=direct&status=${key}`, board.accountId)}>{STATUS_LABELS[key]}<small>{board.counts[key] ?? 0}</small></Link>)}
      </nav>
      {board.conversations.length ? <div className="bk-table-wrap"><table className="bk-table ig-table"><thead><tr><th className="is-left">Kim</th><th className="is-left">Oxirgi xabar</th><th className="is-left">Holat</th><th>Kutish / javob</th><th className="is-left">Mas’ul</th><th className="is-left">Amal</th></tr></thead><tbody>
        {board.conversations.map(row => <tr key={row.id}>
          <td className="is-left"><a href={directLink(row.username)} target="_blank" rel="noreferrer">{personLabel(row)} <ExternalLink size={12}/></a>{row.leadId && <span className="ig-tag is-ok">lid</span>}</td>
          <td className="is-left ig-wrap">{row.last ? messagePreview(row.last) : "—"}<small className="ig-reason">{row.lastIncomingAt ? time(row.lastIncomingAt) : ""} · {row.messageCount} ta xabar{row.deferred ? " · ertalabki ro‘yxatda" : ""}</small></td>
          <td className="is-left ig-wrap"><span className={`ig-tag ${STATUS_CLASS[row.status]}`}>{STATUS_LABELS[row.status]}</span>{row.status === "DISMISSED" && row.dismissReason && <small className="ig-reason">{row.dismissReason}{row.dismissedBy ? ` — ${row.dismissedBy}` : ""}</small>}</td>
          <td>{row.waitingSince ? <strong className={now - Date.parse(row.waitingSince) > 30 * 60_000 ? "ig-error" : ""}>{duration(now - Date.parse(row.waitingSince))}</strong> : row.lastResponseMs !== null ? `✅ ${duration(row.lastResponseMs)}` : "—"}</td>
          <td className="is-left">{row.openedByName ?? "—"}</td>
          <td className="is-left">{(row.status === "UNREAD" || row.status === "OPENED") ? <DismissButton id={row.id}/> : "—"}</td>
        </tr>)}
      </tbody></table></div> : <div className="bk-empty">Yozishma yo‘q</div>}
    </section>
  </div>;
}
