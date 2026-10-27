import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { amountText } from "@/lib/kassa/bot-core";
import { LOG_ACTIONS, logAction, type LogAction } from "@/lib/kassa/rules";
import "@/components/admin/kassa/kassa.css";

export const metadata: Metadata = { title: "Kassa tarixi — Admin | BUYUK KARAVAN" };
type Search = { action?: string; from?: string; to?: string; q?: string };
type Row = { id: string; at: Date; who: string; action: LogAction; note: string; amount: string; reason: string | null; changes: Record<string, [string | null, string | null]> | null };

const day = (value: string | undefined, end = false) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}+05:00`) : undefined;
const time = new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", dateStyle: "medium", timeStyle: "short" });

/** Kassa "Tarix": every KassaEntryLog (add / correct / delete / restore / bot confirm) plus bot drafts cancelled before they became entries. */
export default async function KassaHistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("SUPER_ADMIN");
  const search = await searchParams, q = search.q?.trim().slice(0, 100);
  const createdAt = { gte: day(search.from), lte: day(search.to, true) }, note = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const [logs, cancelled] = await Promise.all([
    getDb().kassaEntryLog.findMany({ where: { createdAt, entry: note && { note } }, orderBy: { createdAt: "desc" }, take: 300, include: { user: { select: { name: true } }, entry: { select: { note: true, type: true, amount: true, currency: true, deleteReason: true } } } }),
    !search.action || search.action === "BOT_CANCELLED" ? getDb().kassaDraft.findMany({ where: { status: "CANCELLED", updatedAt: createdAt, note }, orderBy: { updatedAt: "desc" }, take: 100 }) : [],
  ]);
  const rows: Row[] = [
    ...logs.map(log => {
      const changes = log.changes as Row["changes"] & object, action = logAction(changes);
      return { id: log.id, at: log.createdAt, who: log.user.name, action, note: log.entry.note, amount: amountText(log.entry), reason: action === "DELETED" ? changes.deleteReason?.[1] ?? null : null, changes };
    }),
    ...cancelled.map(draft => ({ id: draft.id, at: draft.updatedAt, who: "Super Admin", action: "BOT_CANCELLED" as const, note: draft.note, amount: amountText(draft), reason: null, changes: null })),
  ].filter(row => !search.action || row.action === search.action).sort((a, b) => b.at.getTime() - a.at.getTime());

  return <div className="kassa">
    <header className="kassa-top"><div><p className="kassa-hi"><Link href="/admin/kassa"><ChevronLeft size={12}/> Kassa</Link></p><h1>Tarix</h1></div></header>
    <form className="admin-filters admin-audit-filters">
      <select name="action" defaultValue={search.action ?? ""} aria-label="Amal"><option value="">Barcha amallar</option>{Object.entries(LOG_ACTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <input type="date" name="from" defaultValue={search.from} aria-label="Dan"/>
      <input type="date" name="to" defaultValue={search.to} aria-label="Gacha"/>
      <input type="search" name="q" defaultValue={search.q} placeholder="Izoh bo‘yicha qidirish" aria-label="Qidirish"/>
      <button className="admin-primary-button">Filtrlash</button>
    </form>
    <section className="admin-panel admin-management-panel admin-audit-panel"><div className="admin-audit-list">
      {rows.length ? rows.map(row => <article key={row.id}>
        <time>{time.format(row.at)}</time>
        <div>
          <strong>{row.who} · {LOG_ACTIONS[row.action]}</strong>
          <span>{row.note} · {row.amount}</span>
          {row.reason && <small>Sabab: {row.reason}</small>}
          {row.changes && <details><summary>Oldin / keyin</summary><pre>{JSON.stringify(Object.fromEntries(Object.entries(row.changes).map(([field, [old, value]]) => [field, { old, new: value }])), null, 2)}</pre></details>}
        </div>
      </article>) : <p className="admin-empty">Tarix yozuvlari topilmadi.</p>}
    </div></section>
  </div>;
}
