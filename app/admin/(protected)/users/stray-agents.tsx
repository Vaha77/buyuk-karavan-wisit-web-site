"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePendingAgentAction } from "./actions";

export type StrayAgent = { id: string; name: string; username: string | null; profileName: string; profileRole: string };

/** Waiting BKLead seller records whose Telegram belongs to an admin-panel / Seh profile (created by a plain /start). */
export function StrayAgents({ agents }: { agents: StrayAgent[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  if (!agents.length) return null;
  const remove = (id: string) => { setBusy(id); setError(""); startTransition(async () => { const result = await deletePendingAgentAction(id); if (!result.ok) setError(result.error); else router.refresh(); }); };
  return <section className="admin-panel admin-management-panel admin-audit-panel">
    <div className="admin-panel-heading"><h2>Keraksiz sotuvchi yozuvlari</h2><span>{agents.length}</span></div>
    <p style={{ margin: "0 0 10px", fontSize: 13, color: "#5B6B82" }}>Bu Telegram akkauntlar admin panel profiliga bog‘langan, lekin oddiy /start bosilganda BKLead’da “tasdiq kutilayotgan sotuvchi” yozuvi ham yaratilgan. Endi bunday yozuv yaratilmaydi; mavjudlarini xohlasangiz o‘chiring.</p>
    <div className="admin-user-list">{agents.map(agent => <div key={agent.id} className="admin-user-row" style={{ alignItems: "center" }}>
      <div><strong>{agent.name}</strong><small>{agent.username ? `@${agent.username}` : "username yo‘q"} · profil: {agent.profileName} ({agent.profileRole})</small></div>
      <button type="button" className="admin-user-button is-danger" disabled={pending} onClick={() => remove(agent.id)}>{pending && busy === agent.id ? "O‘chirilmoqda…" : "O‘chirish"}</button>
    </div>)}</div>
    {error && <p className="admin-user-feedback is-error" role="alert">{error}</p>}
  </section>;
}
