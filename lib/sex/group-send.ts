// Sending to the Seh group with the two things that go wrong in practice: the group was upgraded to a supergroup
// (Telegram answers with migrate_to_chat_id) and the bot is not in the group. Pure: the sender and logger are passed in.

export type GroupSender = (chatId: string, text: string) => Promise<{ chat: { id: number }; message_id: number }>;
export type GroupSendResult = { ok: true; chatId: string; messageId: number; migratedTo?: string } | { ok: false; error: string };
type ErrorLike = { name?: string; message?: string; description?: string; migrateToChatId?: string };

/** Human-readable reason, shown on the settings page ("bot guruhda emas", "chat not found" …). */
export function describeTelegramError(error: unknown) {
  const item = (error ?? {}) as ErrorLike;
  const raw = (item.description || item.message || "").trim();
  if (item.name === "TelegramConfigError" || /not configured/i.test(raw)) return "Bot token yoki TELEGRAM_WORKSHOP_CHAT_ID sozlanmagan";
  if (/chat not found/i.test(raw)) return "chat not found — chat ID noto‘g‘ri yoki bot guruhga qo‘shilmagan";
  if (/not a member|bot was kicked|kicked from|have no rights|not enough rights|need administrator rights/i.test(raw)) return `bot guruhda emas yoki yozish huquqi yo‘q (${raw})`;
  if (/upgraded to a supergroup/i.test(raw)) return "guruh supergroup’ga aylangan — yangi chat ID kerak";
  return raw || "Telegram xatosi";
}

/** Sends to the group; on migrate_to_chat_id resends to the new id and logs that the env value must be updated. */
export async function sendToGroup(send: GroupSender, chatId: string, text: string, log: (message: string) => void = message => console.warn(message)): Promise<GroupSendResult> {
  try {
    const sent = await send(chatId, text);
    return { ok: true, chatId: String(sent.chat.id), messageId: sent.message_id };
  } catch (error) {
    const migrated = (error as ErrorLike | null)?.migrateToChatId;
    if (!migrated) return { ok: false, error: describeTelegramError(error) };
    log(`Guruh ID o‘zgardi: ${migrated} — Vercel'da yangilang (TELEGRAM_WORKSHOP_CHAT_ID)`);
    try {
      const sent = await send(migrated, text);
      return { ok: true, chatId: String(sent.chat.id), messageId: sent.message_id, migratedTo: migrated };
    } catch (retry) {
      return { ok: false, error: describeTelegramError(retry) };
    }
  }
}
