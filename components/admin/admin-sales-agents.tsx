"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveSalesAgentAction,
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
        {agents.length ? (
          <div className="admin-table-wrap">
            <table className="admin-products-table">
              <thead>
                <tr>
                  <th>Ism</th><th>Telegram</th><th>Ro‘yxatdan o‘tgan</th>
                  <th>Tasdiq</th><th>Faollik</th><th>Amal</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const isCurrentPending = pendingAgentId === agent.id;
                  return (
                    <tr key={agent.id}>
                      <td><strong>{agent.name}</strong></td>
                      <td>{agent.username}</td>
                      <td>{agent.createdAt}</td>
                      <td>{agent.isApproved ? "Tasdiqlangan" : "Kutilmoqda"}</td>
                      <td>
                        <span className={`sales-agent-status ${agent.isActive ? "is-active" : "is-inactive"}`}>
                          {agent.isActive ? "Faol" : "Faol emas"}
                        </span>
                      </td>
                      <td>
                        <div className="admin-row-tools sales-agent-actions">
                          {!agent.isApproved && (
                            <button
                              className="sales-agent-button is-primary"
                              disabled={pendingAgentId !== null}
                              onClick={() => run(approveSalesAgentAction, agent.id, "Sotuvchi tasdiqlandi.")}
                            >
                              {isCurrentPending ? "Kutilmoqda..." : "Tasdiqlash"}
                            </button>
                          )}
                          <button
                            className={`sales-agent-button ${agent.isActive ? "is-danger" : "is-primary"}`}
                            disabled={pendingAgentId !== null}
                            onClick={() => toggleAgent(agent)}
                          >
                            {isCurrentPending ? "Kutilmoqda..." : agent.isActive ? "Faolsizlantirish" : "Faollashtirish"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-empty">Hozircha sotuvchilar ro‘yxatdan o‘tmagan.</p>
        )}
      </section>
    </div>
  );
}
