import "server-only";
// NEGATIVE comments: no reply on Instagram; each Super Admin with a linked Telegram gets a private message from the bot
// with [Instagram'da ochish] [Ko‘rib chiqildi].
import { getDb } from "@/lib/db";
import { answerCallbackQuery, editMessageText, sendMessage } from "@/lib/telegram/client";
import type { InlineKeyboard, TelegramCallbackQuery } from "@/lib/telegram/types";

const PREFIX = "igrev:";
const time = (date: Date) => new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);

export function negativeText(input: { username: string | null; text: string; permalink: string | null; createdAt: Date }) {
  return [`⚠️ Salbiy komment: ${input.username ? `@${input.username}` : "Instagram foydalanuvchisi"} — “${input.text.slice(0, 700)}”`, input.permalink ?? "", time(input.createdAt)].filter(Boolean).join("\n");
}

function keyboard(commentId: string, link: string): InlineKeyboard {
  return { inline_keyboard: [[{ text: "Instagram’da ochish", url: link }, { text: "✅ Ko‘rib chiqildi", callback_data: `${PREFIX}${commentId}`.slice(0, 64) }]] };
}

/** Sends the notice to every active Super Admin with Telegram; returns how many got it. Never throws. */
export async function notifyNegative(input: { commentId: string; username: string | null; text: string; permalink: string | null; createdAt: Date; accountUsername: string }) {
  const admins = await getDb().adminUser.findMany({ where: { role: "SUPER_ADMIN", isActive: true, archivedAt: null, telegramChatId: { not: null } }, select: { telegramChatId: true } });
  const link = input.permalink ?? `https://www.instagram.com/${input.accountUsername}/`;
  let sent = 0;
  for (const admin of admins) {
    try { await sendMessage(admin.telegramChatId!, negativeText(input), keyboard(input.commentId, link)); sent++; }
    catch (error) { console.error("Instagram negative notice failed", { type: error instanceof Error ? error.name : "UnknownError" }); }
  }
  return sent;
}

/** "✅ Ko‘rib chiqildi" in a Super Admin's private chat: marks the comment reviewed and updates the message. */
export async function handleInstagramCallback(callback: TelegramCallbackQuery) {
  if (!callback.data?.startsWith(PREFIX)) return false;
  const answer = (text: string, alert = false) => answerCallbackQuery(callback.id, text, alert).catch(() => undefined);
  const admin = await getDb().adminUser.findFirst({ where: { telegramChatId: String(callback.from.id), role: "SUPER_ADMIN", isActive: true, archivedAt: null }, select: { name: true } });
  if (!admin) { await answer("Ruxsat yo‘q", true); return true; }
  const commentId = callback.data.slice(PREFIX.length);
  const comment = await getDb().instagramComment.findUnique({ where: { commentId }, select: { username: true, text: true, createdAt: true, mediaId: true, reviewedAt: true, reviewedBy: true } });
  if (!comment) { await answer("Komment topilmadi", true); return true; }
  if (!comment.reviewedAt) await getDb().instagramComment.update({ where: { commentId }, data: { reviewedAt: new Date(), reviewedBy: admin.name } });
  const rule = await getDb().instagramMediaRule.findUnique({ where: { mediaId: comment.mediaId }, select: { permalink: true } });
  await answer("Ko‘rib chiqildi ✓");
  if (callback.message) {
    const text = `${negativeText({ ...comment, permalink: rule?.permalink ?? null })}\n\n✅ Ko‘rib chiqildi — ${comment.reviewedBy ?? admin.name}`;
    await editMessageText(String(callback.message.chat.id), callback.message.message_id, text, { inline_keyboard: rule?.permalink ? [[{ text: "Instagram’da ochish", url: rule.permalink }]] : [] }).catch(() => undefined);
  }
  return true;
}
