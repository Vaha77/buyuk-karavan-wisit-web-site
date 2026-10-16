import "server-only";
// NEGATIVE comments: no reply on Instagram; each Super Admin with a linked Telegram (and the account's negative-comments
// group, if set) gets a message from the bot naming the account, with [Instagram'da ochish] [Ko‘rib chiqildi].
import { getDb } from "@/lib/db";
import { answerCallbackQuery, editMessageText, sendMessage } from "@/lib/telegram/client";
import type { InlineKeyboard, TelegramCallbackQuery } from "@/lib/telegram/types";
import { dismissConversation, dismissReason, syncCards } from "./direct";
import { DISMISS_REASONS } from "./direct-rules";
import { accountName } from "./rules";

const PREFIX = "igrev:";
const time = (date: Date) => new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);

export function negativeText(input: { username: string | null; text: string; permalink: string | null; createdAt: Date; accountName?: string | null }) {
  return [`⚠️ Salbiy komment${input.accountName ? ` (${input.accountName})` : ""}: ${input.username ? `@${input.username}` : "Instagram foydalanuvchisi"} — “${input.text.slice(0, 700)}”`, input.permalink ?? "", time(input.createdAt)].filter(Boolean).join("\n");
}

function keyboard(commentId: string, link: string): InlineKeyboard {
  return { inline_keyboard: [[{ text: "Instagram’da ochish", url: link }, { text: "✅ Ko‘rib chiqildi", callback_data: `${PREFIX}${commentId}`.slice(0, 64) }]] };
}

/** Sends the notice to every active Super Admin with Telegram and the account's group; returns how many got it. Never throws. */
export async function notifyNegative(input: { commentId: string; username: string | null; text: string; permalink: string | null; createdAt: Date; accountUsername: string; accountName: string; groupChatId?: string | null }) {
  const admins = await getDb().adminUser.findMany({ where: { role: "SUPER_ADMIN", isActive: true, archivedAt: null, telegramChatId: { not: null } }, select: { telegramChatId: true } });
  const chats = [...new Set([...admins.map(admin => admin.telegramChatId!), ...(input.groupChatId?.trim() ? [input.groupChatId.trim()] : [])])];
  const link = input.permalink ?? `https://www.instagram.com/${input.accountUsername}/`;
  let sent = 0;
  for (const chatId of chats) {
    try { await sendMessage(chatId, negativeText(input), keyboard(input.commentId, link)); sent++; }
    catch (error) { console.error("Instagram negative notice failed", { type: error instanceof Error ? error.name : "UnknownError" }); }
  }
  return sent;
}

/** "✅ Ko‘rib chiqildi" in a Super Admin's private chat: marks the comment reviewed and updates the message. */
export async function handleInstagramCallback(callback: TelegramCallbackQuery) {
  if (callback.data?.startsWith(DIRECT_PREFIX)) return handleDirectCallback(callback);
  if (!callback.data?.startsWith(PREFIX)) return false;
  const answer = (text: string, alert = false) => answerCallbackQuery(callback.id, text, alert).catch(() => undefined);
  const admin = await getDb().adminUser.findFirst({ where: { telegramChatId: String(callback.from.id), role: "SUPER_ADMIN", isActive: true, archivedAt: null }, select: { name: true } });
  if (!admin) { await answer("Ruxsat yo‘q", true); return true; }
  const commentId = callback.data.slice(PREFIX.length);
  const comment = await getDb().instagramComment.findUnique({ where: { commentId }, select: { username: true, text: true, createdAt: true, mediaId: true, reviewedAt: true, reviewedBy: true, accountId: true } });
  if (!comment) { await answer("Komment topilmadi", true); return true; }
  if (!comment.reviewedAt) await getDb().instagramComment.update({ where: { commentId }, data: { reviewedAt: new Date(), reviewedBy: admin.name } });
  const [rule, account] = await Promise.all([getDb().instagramMediaRule.findUnique({ where: { mediaId: comment.mediaId }, select: { permalink: true } }), getDb().instagramAccount.findUnique({ where: { id: comment.accountId }, select: { label: true, username: true } })]);
  await answer("Ko‘rib chiqildi ✓");
  if (callback.message) {
    const text = `${negativeText({ ...comment, permalink: rule?.permalink ?? null, accountName: account && accountName(account) })}\n\n✅ Ko‘rib chiqildi — ${comment.reviewedBy ?? admin.name}`;
    await editMessageText(String(callback.message.chat.id), callback.message.message_id, text, { inline_keyboard: rule?.permalink ? [[{ text: "Instagram’da ochish", url: rule.permalink }]] : [] }).catch(() => undefined);
  }
  return true;
}

// ---- Direct cards: "🚫 Kerak emas" → reason → done ---------------------------------------------------------

const DIRECT_PREFIX = "igdm:";

/**
 * igdm:x:<id> shows the reasons on that card, igdm:r:<id>:<code> dismisses (every card is edited), igdm:b:<id> goes back.
 * Allowed for users who receive Instagram Direct, for Super Admins and for anyone in an account's Direct group.
 */
async function handleDirectCallback(callback: TelegramCallbackQuery) {
  const answer = (text: string, alert = false) => answerCallbackQuery(callback.id, text, alert).catch(() => undefined);
  const chatId = callback.message ? String(callback.message.chat.id) : null;
  const [user, group] = await Promise.all([
    getDb().adminUser.findFirst({ where: { telegramChatId: String(callback.from.id), isActive: true, archivedAt: null, OR: [{ receivesInstagramDirect: true }, { role: "SUPER_ADMIN" }] }, select: { name: true } }),
    chatId ? getDb().instagramAccount.findFirst({ where: { directChatId: chatId }, select: { id: true } }) : null,
  ]);
  const admin = user ?? (group ? { name: [callback.from.first_name, callback.from.last_name].filter(Boolean).join(" ") || "Telegram" } : null);
  if (!admin) { await answer("Ruxsat yo‘q", true); return true; }
  const [, action, id, code] = callback.data!.split(":");
  if (!id) { await answer("Noto‘g‘ri tugma", true); return true; }
  if (action === "x" && callback.message) {
    const reasons: InlineKeyboard = { inline_keyboard: [Object.entries(DISMISS_REASONS).map(([key, label]) => ({ text: label, callback_data: `${DIRECT_PREFIX}r:${id}:${key}` })), [{ text: "↩ Orqaga", callback_data: `${DIRECT_PREFIX}b:${id}` }]] };
    await answer("Sababini tanlang");
    await editMessageReplyMarkup(String(callback.message.chat.id), callback.message.message_id, callback.message.text ?? "", reasons);
    return true;
  }
  if (action === "b") { await answer("Bekor qilindi"); await syncCards(id).catch(() => undefined); return true; }
  if (action === "r") {
    const reason = dismissReason(code ?? "");
    if (!reason) { await answer("Noto‘g‘ri sabab", true); return true; }
    const done = await dismissConversation(id, reason, admin.name);
    await answer(done ? `Kerak emas: ${reason} ✓` : "Holat allaqachon o‘zgargan");
    if (!done) await syncCards(id).catch(() => undefined);
    return true;
  }
  await answer("Noma’lum tugma", true);
  return true;
}

/** Same text, new buttons (Telegram has no plain keyboard edit in our client; editing the text to itself does it). */
const editMessageReplyMarkup = (chatId: string, messageId: number, text: string, keyboard: InlineKeyboard) => editMessageText(chatId, messageId, text, keyboard).catch(() => undefined);
