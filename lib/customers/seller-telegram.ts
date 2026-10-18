import "server-only";

import { getDb } from "@/lib/db";
import { sendMessage, telegramErrorDetails } from "@/lib/telegram/client";

/** The seller's private chat: the bot-linked one (AdminUser) first, else the one an admin typed on the SalesPerson. */
export async function sellerChat(who: { userId?: string; salesPersonId?: string | null }) {
  const db = getDb();
  if (who.userId) {
    const user = await db.adminUser.findUnique({ where: { id: who.userId }, select: { telegramChatId: true, salesPerson: { select: { telegramChatId: true } } } });
    return user?.telegramChatId ?? user?.salesPerson?.telegramChatId ?? null;
  }
  if (!who.salesPersonId) return null;
  const person = await db.salesPerson.findUnique({ where: { id: who.salesPersonId }, select: { telegramChatId: true, user: { select: { telegramChatId: true } } } });
  return person?.user?.telegramChatId ?? person?.telegramChatId ?? null;
}

/** Best effort: the action is already saved; a seller without Telegram or a failed send only logs. */
export async function tellSeller(who: { userId?: string; salesPersonId?: string | null }, text: string) {
  try {
    const chat = await sellerChat(who);
    if (chat) await sendMessage(chat, text);
  } catch (error) { console.error("[SellerTelegram]", telegramErrorDetails(error)); }
}
