import "server-only";

import { getDb } from "@/lib/db";
import { sendMessage } from "./client";
import type { InlineKeyboard } from "./types";

const reminderKeyboard = (followUpId: string): InlineKeyboard => ({
  inline_keyboard: [
    [{ text: "📞 Qo‘ng‘iroq qildim", callback_data: `fucontact:${followUpId}` }],
    [{ text: "⏰ Keyinga surish", callback_data: `postpone:${followUpId}` }],
  ],
});

export async function processDueFollowUps(limit = 20) {
  const due = await getDb().leadFollowUp.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: "asc" }, take: limit,
    include: { lead: true, agent: true },
  });
  let sent = 0;
  for (const followUp of due) {
    const reserved = await getDb().leadFollowUp.updateMany({
      where: { id: followUp.id, status: "SCHEDULED" },
      data: { status: "REMINDER_RESERVED", reminderSentAt: new Date() },
    });
    if (reserved.count !== 1) continue;
    if (!followUp.agent.isApproved || !followUp.agent.isActive || followUp.lead.assignedAgentId !== followUp.agentId) {
      await getDb().leadFollowUp.update({ where: { id: followUp.id }, data: { status: "CANCELLED" } });
      continue;
    }
    const latestComment = await getDb().leadActivity.findFirst({
      where: { leadId: followUp.leadId, type: "COMMENT_ADDED" }, orderBy: { createdAt: "desc" }, select: { comment: true },
    });
    const text = [
      "⏰ MIJOZNI UNUTMANG", "",
      `👤 ${followUp.lead.customerName || "Ko‘rsatilmagan"}`,
      followUp.lead.phone && `☎️ ${followUp.lead.phone}`,
      followUp.lead.region && `📍 ${followUp.lead.region}`,
      `❄️ ${followUp.lead.requestType}`,
      latestComment?.comment && `📝 Oxirgi izoh:\n“${latestComment.comment}”`,
    ].filter(Boolean).join("\n");
    try {
      await sendMessage(String(followUp.agent.telegramUserId), text, reminderKeyboard(followUp.id));
      await getDb().leadFollowUp.update({ where: { id: followUp.id }, data: { status: "REMINDER_SENT" } });
      sent += 1;
    } catch (error) {
      console.error("Telegram follow-up reminder failed", { type: error instanceof Error ? error.name : "UnknownError" });
    }
  }
  return { checked: due.length, sent };
}
