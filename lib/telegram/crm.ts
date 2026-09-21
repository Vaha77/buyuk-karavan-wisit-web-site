import "server-only";

import { getDb } from "@/lib/db";
import type { LeadOutcome, SalesAgent } from "@/generated/prisma/client";
import { answerCallbackQuery, sendMessage } from "./client";
import type { InlineKeyboard, TelegramCallbackQuery, TelegramMessage } from "./types";

const TIME_ZONE = "Asia/Tashkent";
const COMMENT_LIMIT = 1000;

const outcomes: Record<string, { value: LeadOutcome; label: string; final: boolean; status: "IN_PROGRESS" | "WON" | "LOST" }> = {
  thinking: { value: "THINKING", label: "O‘ylab ko‘radi", final: false, status: "IN_PROGRESS" },
  later: { value: "LATER", label: "Keyinroq oladi", final: false, status: "IN_PROGRESS" },
  offer: { value: "OFFER_SENT", label: "Taklif / narx yuborildi", final: false, status: "IN_PROGRESS" },
  negotiating: { value: "NEGOTIATING", label: "Muzokara davom etmoqda", final: false, status: "IN_PROGRESS" },
  noanswer: { value: "NO_ANSWER", label: "Javob bermadi", final: false, status: "IN_PROGRESS" },
  sale: { value: "SALE", label: "Sotuv qilindi", final: true, status: "WON" },
  rejected: { value: "REJECTED", label: "Rad etdi", final: true, status: "LOST" },
  invalid: { value: "INVALID", label: "Noto‘g‘ri murojaat", final: true, status: "LOST" },
};

export const contactedKeyboard = (leadId: string): InlineKeyboard => ({
  inline_keyboard: [[{ text: "📞 Aloqaga chiqdim", callback_data: `contact:${leadId}` }]],
});

const outcomeKeyboard = (leadId: string): InlineKeyboard => ({
  inline_keyboard: [
    [{ text: "🟡 O‘ylab ko‘radi", callback_data: `outcome:${leadId}:thinking` }],
    [{ text: "📅 Keyinroq oladi", callback_data: `outcome:${leadId}:later` }],
    [{ text: "💰 Taklif / narx yuborildi", callback_data: `outcome:${leadId}:offer` }],
    [{ text: "🔵 Muzokara davom etmoqda", callback_data: `outcome:${leadId}:negotiating` }],
    [{ text: "📵 Javob bermadi", callback_data: `outcome:${leadId}:noanswer` }],
    [{ text: "🟢 Sotuv qilindi", callback_data: `outcome:${leadId}:sale` }],
    [{ text: "🔴 Rad etdi", callback_data: `outcome:${leadId}:rejected` }],
    [{ text: "⚫ Noto‘g‘ri murojaat", callback_data: `outcome:${leadId}:invalid` }],
  ],
});

const followUpKeyboard = (prefix: "follow" | "post"): InlineKeyboard => ({
  inline_keyboard: [
    [
      { text: "Ertaga", callback_data: `${prefix}:1` },
      { text: "3 kundan keyin", callback_data: `${prefix}:3` },
    ],
    [
      { text: "1 hafta", callback_data: `${prefix}:7` },
      { text: "Sana tanlash", callback_data: `${prefix}:date` },
    ],
  ],
});

function localDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function zonedDate(year: number, month: number, day: number, hour = 9) {
  let utc = Date.UTC(year, month - 1, day, hour);
  for (let index = 0; index < 2; index += 1) {
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(utc));
    const read = (type: Intl.DateTimeFormatPartTypes) => Number(formatted.find((part) => part.type === type)?.value);
    const represented = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
    utc += Date.UTC(year, month - 1, day, hour) - represented;
  }
  return new Date(utc);
}

function futureDate(days: number) {
  const local = localDateParts(new Date());
  const calendar = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return zonedDate(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate());
}

function parseLocalDate(value: string) {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) return null;
  const result = zonedDate(year, month, day);
  return result.getTime() > Date.now() ? result : null;
}

export function formatFollowUpDate(value: Date) {
  return new Intl.DateTimeFormat("uz-UZ", {
    timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short",
  }).format(value);
}

async function authorizedAgent(userId: number, leadId: string) {
  const agent = await getDb().salesAgent.findUnique({ where: { telegramUserId: BigInt(userId) } });
  if (!agent || !agent.isApproved || !agent.isActive) return null;
  const lead = await getDb().lead.findFirst({ where: { id: leadId, assignedAgentId: agent.id } });
  return lead ? { agent, lead } : null;
}

async function reject(callback: TelegramCallbackQuery, text = "Bu mijoz sizga biriktirilmagan.") {
  await answerCallbackQuery(callback.id, text, true);
}

async function beginContact(callback: TelegramCallbackQuery, leadId: string, followUpId?: string) {
  const context = await authorizedAgent(callback.from.id, leadId);
  if (!context) { await reject(callback); return true; }
  const now = new Date();
  await getDb().$transaction(async (tx) => {
    if (followUpId) {
      const completed = await tx.leadFollowUp.updateMany({
        where: { id: followUpId, leadId, agentId: context.agent.id, status: { in: ["SCHEDULED", "REMINDER_RESERVED", "REMINDER_SENT"] } },
        data: { status: "COMPLETED", completedAt: now },
      });
      if (completed.count) await tx.leadActivity.create({ data: { leadId, agentId: context.agent.id, type: "FOLLOW_UP_COMPLETED", metadata: { followUpId } } });
    }
    await tx.lead.update({ where: { id: leadId }, data: { status: "CONTACTED" } });
    await tx.leadActivity.create({ data: { leadId, agentId: context.agent.id, type: "CONTACTED" } });
  });
  await answerCallbackQuery(callback.id, "Aloqa qayd etildi.");
  await sendMessage(String(context.agent.telegramUserId), "📋 Mijoz bilan suhbat natijasi qanday?", outcomeKeyboard(leadId));
  return true;
}

async function selectOutcome(callback: TelegramCallbackQuery, leadId: string, code: string) {
  const selected = outcomes[code];
  if (!selected) return false;
  const context = await authorizedAgent(callback.from.id, leadId);
  if (!context) { await reject(callback); return true; }
  await getDb().telegramConversationState.upsert({
    where: { agentId: context.agent.id },
    create: { agentId: context.agent.id, leadId, step: "AWAITING_COMMENT", outcome: selected.value },
    update: { leadId, step: "AWAITING_COMMENT", outcome: selected.value, followUpId: null },
  });
  await answerCallbackQuery(callback.id, selected.label);
  const customer = context.lead.customerName || "Ko‘rsatilmagan";
  await sendMessage(String(context.agent.telegramUserId), `Izoh yozing.\n\nMijoz: ${customer}\nNatija: ${selected.label}\n\nMasalan:\n100 tonnalik kamera kerak.\nBir haftadan keyin pul tushadi.\n28-sentyabrda qayta qo‘ng‘iroq qilish kerak.`);
  return true;
}

async function scheduleFollowUp(agent: SalesAgent, leadId: string, scheduledFor: Date, previousId?: string) {
  await getDb().$transaction(async (tx) => {
    await tx.leadFollowUp.updateMany({
      where: { leadId, status: { in: ["SCHEDULED", "REMINDER_RESERVED", "REMINDER_SENT"] } },
      data: { status: "CANCELLED" },
    });
    const followUp = await tx.leadFollowUp.create({ data: { leadId, agentId: agent.id, scheduledFor } });
    await tx.leadActivity.create({
      data: {
        leadId, agentId: agent.id,
        type: previousId ? "FOLLOW_UP_POSTPONED" : "FOLLOW_UP_SCHEDULED",
        metadata: { followUpId: followUp.id, scheduledFor: scheduledFor.toISOString(), previousFollowUpId: previousId || null },
      },
    });
    await tx.telegramConversationState.deleteMany({ where: { agentId: agent.id } });
  });
  await sendMessage(String(agent.telegramUserId), `⏰ Keyingi aloqa belgilandi: ${formatFollowUpDate(scheduledFor)}`);
}

async function chooseSchedule(callback: TelegramCallbackQuery, prefix: "follow" | "post", choice: string) {
  const agent = await getDb().salesAgent.findUnique({ where: { telegramUserId: BigInt(callback.from.id) }, include: { telegramConversation: true } });
  const state = agent?.telegramConversation;
  const requiredStep = prefix === "follow" ? "AWAITING_FOLLOW_UP" : "AWAITING_POSTPONE";
  if (!agent?.isApproved || !agent.isActive || !state || state.step !== requiredStep) { await reject(callback, "Faol jarayon topilmadi."); return true; }
  const context = await authorizedAgent(callback.from.id, state.leadId);
  if (!context) { await reject(callback); return true; }
  if (choice === "date") {
    await getDb().telegramConversationState.update({ where: { agentId: agent.id }, data: { step: prefix === "follow" ? "AWAITING_CUSTOM_DATE" : "AWAITING_POSTPONE_DATE" } });
    await answerCallbackQuery(callback.id, "Sanani yuboring.");
    await sendMessage(String(agent.telegramUserId), "Sanani KK.OO.YYYY formatida yuboring.\nMasalan: 28.09.2026");
    return true;
  }
  const days = Number(choice);
  if (![1, 3, 7].includes(days)) return false;
  await answerCallbackQuery(callback.id, "Sana saqlanmoqda.");
  await scheduleFollowUp(agent, state.leadId, futureDate(days), state.followUpId || undefined);
  return true;
}

async function postpone(callback: TelegramCallbackQuery, followUpId: string) {
  const followUp = await getDb().leadFollowUp.findUnique({ where: { id: followUpId } });
  if (!followUp) { await reject(callback, "Eslatma topilmadi."); return true; }
  const context = await authorizedAgent(callback.from.id, followUp.leadId);
  if (!context || followUp.agentId !== context.agent.id) { await reject(callback); return true; }
  await getDb().telegramConversationState.upsert({
    where: { agentId: context.agent.id },
    create: { agentId: context.agent.id, leadId: followUp.leadId, followUpId, step: "AWAITING_POSTPONE" },
    update: { leadId: followUp.leadId, followUpId, step: "AWAITING_POSTPONE", outcome: null },
  });
  await answerCallbackQuery(callback.id, "Yangi muddatni tanlang.");
  await sendMessage(String(context.agent.telegramUserId), "⏰ Qachon yana bog‘lanamiz?", followUpKeyboard("post"));
  return true;
}

export async function handleCrmCallback(callback: TelegramCallbackQuery) {
  const contact = callback.data?.match(/^contact:([a-z0-9]+)$/i);
  if (contact) return beginContact(callback, contact[1]);
  const reminderContact = callback.data?.match(/^fucontact:([a-z0-9]+)$/i);
  if (reminderContact) {
    const followUp = await getDb().leadFollowUp.findUnique({ where: { id: reminderContact[1] } });
    if (!followUp) { await reject(callback, "Eslatma topilmadi."); return true; }
    return beginContact(callback, followUp.leadId, followUp.id);
  }
  const outcome = callback.data?.match(/^outcome:([a-z0-9]+):([a-z]+)$/i);
  if (outcome) return selectOutcome(callback, outcome[1], outcome[2]);
  const schedule = callback.data?.match(/^(follow|post):(1|3|7|date)$/);
  if (schedule) return chooseSchedule(callback, schedule[1] as "follow" | "post", schedule[2]);
  const delayed = callback.data?.match(/^postpone:([a-z0-9]+)$/i);
  if (delayed) return postpone(callback, delayed[1]);
  return false;
}

export async function handleCrmText(message: TelegramMessage) {
  if (message.chat.type !== "private" || !message.from || message.from.is_bot || !message.text || message.text.startsWith("/")) return false;
  const agent = await getDb().salesAgent.findUnique({ where: { telegramUserId: BigInt(message.from.id) }, include: { telegramConversation: true } });
  const state = agent?.telegramConversation;
  if (!agent?.isApproved || !agent.isActive || !state) return false;
  const context = await authorizedAgent(message.from.id, state.leadId);
  if (!context) { await getDb().telegramConversationState.deleteMany({ where: { agentId: agent.id } }); return false; }

  if (state.step === "AWAITING_COMMENT") {
    const comment = message.text.trim();
    if (!comment || comment.length > COMMENT_LIMIT) {
      await sendMessage(String(agent.telegramUserId), `Izoh 1–${COMMENT_LIMIT} belgi bo‘lishi kerak.`);
      return true;
    }
    const selected = Object.values(outcomes).find((item) => item.value === state.outcome);
    if (!selected) return false;
    await getDb().$transaction(async (tx) => {
      await tx.leadActivity.create({
        data: {
          leadId: state.leadId, agentId: agent.id,
          type: selected.value === "SALE" ? "SALE_REPORTED" : selected.final ? "REJECTED" : "STATUS_CHANGED",
          metadata: { outcome: selected.value, label: selected.label },
        },
      });
      await tx.leadActivity.create({ data: { leadId: state.leadId, agentId: agent.id, type: "COMMENT_ADDED", comment } });
      await tx.lead.update({ where: { id: state.leadId }, data: { status: selected.status } });
      if (selected.final) {
        await tx.leadFollowUp.updateMany({ where: { leadId: state.leadId, status: { in: ["SCHEDULED", "REMINDER_RESERVED", "REMINDER_SENT"] } }, data: { status: "CANCELLED" } });
        await tx.telegramConversationState.delete({ where: { agentId: agent.id } });
      } else {
        await tx.telegramConversationState.update({ where: { agentId: agent.id }, data: { step: "AWAITING_FOLLOW_UP" } });
      }
    });
    if (selected.final) {
      await sendMessage(String(agent.telegramUserId), selected.value === "SALE" ? "🟢 Sotuv qayd etildi. Faol eslatmalar yopildi." : "🔴 Yakuniy natija qayd etildi. Faol eslatmalar yopildi.");
    } else {
      await sendMessage(String(agent.telegramUserId), "⏰ Qachon yana bog‘lanamiz?", followUpKeyboard("follow"));
    }
    return true;
  }

  if (state.step === "AWAITING_CUSTOM_DATE" || state.step === "AWAITING_POSTPONE_DATE") {
    const scheduledFor = parseLocalDate(message.text);
    if (!scheduledFor) {
      await sendMessage(String(agent.telegramUserId), "Sana noto‘g‘ri yoki o‘tib ketgan. KK.OO.YYYY formatida kelajak sanasini yuboring.");
      return true;
    }
    await scheduleFollowUp(agent, state.leadId, scheduledFor, state.step === "AWAITING_POSTPONE_DATE" ? state.followUpId || undefined : undefined);
    return true;
  }
  return false;
}
