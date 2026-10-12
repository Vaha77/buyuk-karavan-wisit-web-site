"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveSalesAgentAction,
  adjustMarjaAction,
  toggleSalesAgentAction,
} from "@/app/admin/(protected)/sales-agents/actions";
import type { AdminSalesAgent } from "@/lib/sales-agents/queries";

export function AdminSalesAgents({ agents }: { agents: AdminSalesAgent[] }) {
  const [feedback, setFeedback] = useState("");
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(
    action: (id: string) => Promise<{ error?: string }>,
    id: string,
    message: string,
  ) {
    if (pendingAgentId) return;
    setPendingAgentId(id);
    setFeedback("");
    startTransition(async () => {
      try {
        const result = await action(id);
        setFeedback(result.error || message);
        if (!result.error) router.refresh();
      } finally {
        setPendingAgentId(null);
      }
    });
  }

  function toggleAgent(agent: AdminSalesAgent) {
    if (
      agent.isActive &&
      !window.confirm("Ushbu sotuvchini faolsizlantirmoqchimisiz?")
    ) {
      return;
    }
    run(
      toggleSalesAgentAction,
      agent.id,
      agent.isActive
        ? "Sotuvchi faolsizlantirildi."
        : "Sotuvchi faollashtirildi.",
    );
  }

  const marjaForm = (agent: AdminSalesAgent) => <form action={adjustMarjaAction} className="sales-agent-marja"><input type="hidden" name="agentId" value={agent.id}/><input name="amount" type="number" required placeholder="± Marja" aria-label={`${agent.name}: marja miqdori`}/><input name="reason" required minLength={3} placeholder="Sabab" aria-label={`${agent.name}: sabab`}/><button className="sales-agent-button is-primary">Kiritish</button></form>;
  const actions = (agent: AdminSalesAgent) => {
    const isCurrentPending = pendingAgentId === agent.id;
    return <div className="admin-row-tools sales-agent-actions">
      {!agent.isApproved && <button className="sales-agent-button is-primary" disabled={pendingAgentId !== null} onClick={() => run(approveSalesAgentAction, agent.id, "Sotuvchi tasdiqlandi.")}>{isCurrentPending ? "Kutilmoqda..." : "Tasdiqlash"}</button>}
      <button className={`sales-agent-button ${agent.isActive ? "is-danger" : "is-primary"}`} disabled={pendingAgentId !== null} onClick={() => toggleAgent(agent)}>{isCurrentPending ? "Kutilmoqda..." : agent.isActive ? "Faolsizlantirish" : "Faollashtirish"}</button>
    </div>;
  };
  const status = (agent: AdminSalesAgent) => <span className={`sales-agent-status ${agent.isActive ? "is-active" : "is-inactive"}`}>{agent.isActive ? "Faol" : "Faol emas"}</span>;

  return (
    <div className="admin-products-page" aria-busy={pending}>
      <div className="admin-page-heading">
        <div>
          <h1>Sotuvchilar</h1>
          <p>BKLead Telegram sotuvchilarini tasdiqlash va boshqarish</p>
        </div>
      </div>
      {feedback && (
        <p className="admin-form-feedback" role="status">
          {feedback}
        </p>
      )}
      <section className="admin-panel admin-management-panel">
        <div className="admin-panel-heading">
          <h2>Ro‘yxatdan o‘tgan sotuvchilar</h2>
          <span>{agents.length} ta</span>
        </div>
        {agents.length ? (<>
          <div className="admin-table-wrap">
            <table className="admin-products-table">
              <thead>
                <tr>
                  <th>Ism</th><th>Telegram</th><th>Ro‘yxatdan o‘tgan</th>
                  <th>Tasdiq</th><th>Faollik</th><th>CRM</th><th>Marja</th><th>Amal</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td><strong>{agent.name}</strong></td>
                    <td>{agent.username}</td>
                    <td>{agent.createdAt}</td>
                    <td>{agent.isApproved ? "Tasdiqlangan" : "Kutilmoqda"}</td>
                    <td>{status(agent)}</td>
                    <td>{agent.sales}/{agent.claimed} savdo · {agent.conversion}% · {agent.overdue} kechikkan</td>
                    <td><strong>{agent.marja}</strong> <small>({agent.earned} / -{agent.spent})</small>{marjaForm(agent)}</td>
                    <td>{actions(agent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: the table is hidden (≤650px), every seller is a card with the same data and actions. */}
          <ul className="admin-mobile-cards" aria-label="Sotuvchilar">
            {agents.map((agent) => (
              <li key={agent.id} className="admin-mobile-card">
                <div className="admin-mobile-card-head">
                  <div><strong>{agent.name}</strong><small>{agent.username || "—"}</small></div>
                  <span className={`admin-mobile-badge ${agent.isApproved ? "is-ok" : "is-wait"}`}>{agent.isApproved ? "Tasdiqlangan" : "Kutilmoqda"}</span>
                </div>
                <dl className="admin-mobile-facts">
                  <div><dt>Ro‘yxatdan o‘tgan</dt><dd>{agent.createdAt}</dd></div>
                  <div><dt>Faollik</dt><dd>{status(agent)}</dd></div>
                  <div><dt>Savdo</dt><dd>{agent.sales}/{agent.claimed} · {agent.conversion}%</dd></div>
                  <div><dt>Kechikkan</dt><dd>{agent.overdue}</dd></div>
                  <div><dt>Marja</dt><dd><strong>{agent.marja}</strong> <small>({agent.earned} / -{agent.spent})</small></dd></div>
                </dl>
                {marjaForm(agent)}
                {actions(agent)}
              </li>
            ))}
          </ul>
        </>        ) : (
          <p className="admin-empty">Hozircha sotuvchilar ro‘yxatdan o‘tmagan.</p>
        )}
      </section>
    </div>
  );
}
