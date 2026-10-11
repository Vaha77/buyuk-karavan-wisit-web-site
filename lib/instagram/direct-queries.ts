import "server-only";
import { getDb } from "@/lib/db";
import { formatMinute, type DirectStatus } from "./direct-rules";

export const DIRECT_FILTERS = ["UNREAD", "OPENED", "ANSWERED", "DISMISSED"] as const;

/** Instagram → "Direct" tab: conversations (by status), counts, settings and who receives the Telegram cards. */
export async function getDirectBoard(status: DirectStatus | null) {
  const db = getDb();
  const [rows, counts, account, people] = await Promise.all([
    db.instagramConversation.findMany({ where: status ? { status } : {}, orderBy: [{ lastIncomingAt: "desc" }], take: 200, include: { messages: { where: { direction: "IN" }, orderBy: { sentAt: "desc" }, take: 1, select: { text: true, kind: true, sentAt: true } } } }),
    db.instagramConversation.groupBy({ by: ["status"], _count: { _all: true } }),
    db.instagramAccount.findUnique({ where: { id: "global" }, select: { directWorkStart: true, directWorkEnd: true, directAutoAckEnabled: true, directAutoAckText: true } }),
    db.adminUser.findMany({ where: { receivesInstagramDirect: true, isActive: true, archivedAt: null }, select: { name: true, telegramChatId: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    now: Date.now(),
    connected: !!account,
    conversations: rows.map(row => ({
      id: row.id, username: row.username, name: row.name, status: row.status as DirectStatus,
      waitingSince: row.waitingSince?.toISOString() ?? null, lastIncomingAt: row.lastIncomingAt?.toISOString() ?? null,
      messageCount: row.messageCount, openedByName: row.openedByName, answeredAt: row.answeredAt?.toISOString() ?? null, lastResponseMs: row.lastResponseMs,
      dismissReason: row.dismissReason, dismissedBy: row.dismissedBy, leadId: row.leadId, deferred: row.deferred,
      last: row.messages[0] ? { text: row.messages[0].text, kind: row.messages[0].kind } : null,
    })),
    counts: Object.fromEntries(counts.map(row => [row.status, row._count._all])) as Partial<Record<DirectStatus, number>>,
    settings: account && { workStart: formatMinute(account.directWorkStart), workEnd: formatMinute(account.directWorkEnd), autoAckEnabled: account.directAutoAckEnabled, autoAckText: account.directAutoAckText },
    recipients: people.map(person => ({ name: person.name, linked: !!person.telegramChatId })),
  };
}
export type DirectBoard = Awaited<ReturnType<typeof getDirectBoard>>;
