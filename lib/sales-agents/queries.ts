import "server-only";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";

export type AdminSalesAgent = { id: string; name: string; username: string; isApproved: boolean; isActive: boolean; createdAt: string; claimed: number; active: number; contacted: number; overdue: number; sales: number; lost: number; conversion: number; marja: number; earned: number; spent: number };

export async function getAdminSalesAgents(): Promise<AdminSalesAgent[]> {
  await requireAdmin();
  const db = getDb();
  const [agents, leadGroups, overdueGroups, saleGroups, marjaGroups] = await Promise.all([
    db.salesAgent.findMany({ select: { id: true, telegramUsername: true, firstName: true, lastName: true, isActive: true, isApproved: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    db.lead.groupBy({ by: ["assignedAgentId", "status"], where: { assignedAgentId: { not: null } }, _count: { _all: true } }),
    db.leadFollowUp.groupBy({ by: ["agentId"], where: { status: { in: ["SCHEDULED", "REMINDER_RESERVED", "REMINDER_SENT"] }, scheduledFor: { lt: new Date() } }, _count: { _all: true } }),
    db.sale.groupBy({ by: ["agentId"], where: { status: "APPROVED" }, _count: { _all: true } }),
    db.marjaTransaction.groupBy({ by: ["agentId", "type"], _sum: { amount: true } }),
  ]);
  const lead = new Map<string, { claimed: number; active: number; contacted: number; lost: number }>();
  for (const row of leadGroups) {
    if (!row.assignedAgentId) continue;
    const stats = lead.get(row.assignedAgentId) ?? { claimed: 0, active: 0, contacted: 0, lost: 0 };
    const count = row._count._all;
    stats.claimed += count;
    if (["NEW", "REVIEWING", "CONTACTED", "IN_PROGRESS"].includes(row.status)) stats.active += count;
    if (row.status === "CONTACTED") stats.contacted = count;
    if (row.status === "LOST") stats.lost = count;
    lead.set(row.assignedAgentId, stats);
  }
  const overdue = new Map(overdueGroups.map(row => [row.agentId, row._count._all]));
  const sales = new Map(saleGroups.map(row => [row.agentId, row._count._all]));
  const marja = new Map<string, { balance: number; earned: number; spent: number }>();
  for (const row of marjaGroups) {
    const stats = marja.get(row.agentId) ?? { balance: 0, earned: 0, spent: 0 };
    const amount = row._sum.amount ?? 0;
    stats.balance += amount;
    if (row.type === "SALE_EARNED") stats.earned = amount;
    if (row.type === "REWARD_SPENT") stats.spent = Math.abs(amount);
    marja.set(row.agentId, stats);
  }
  return agents.map(row => {
    const leads = lead.get(row.id) ?? { claimed: 0, active: 0, contacted: 0, lost: 0 };
    const saleCount = sales.get(row.id) ?? 0;
    const margin = marja.get(row.id) ?? { balance: 0, earned: 0, spent: 0 };
    return { id: row.id, name: [row.firstName, row.lastName].filter(Boolean).join(" "), username: row.telegramUsername ? `@${row.telegramUsername}` : "—", isApproved: row.isApproved, isActive: row.isActive, createdAt: new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(row.createdAt), ...leads, overdue: overdue.get(row.id) ?? 0, sales: saleCount, conversion: leads.claimed ? Math.round(saleCount / leads.claimed * 100) : 0, marja: margin.balance, earned: margin.earned, spent: margin.spent };
  });
}
