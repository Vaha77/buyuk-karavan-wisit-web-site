import "server-only";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { TelegramApiError, editMessageText, getMe, sendMessage, telegramErrorDetails, telegramWorkshopChatId } from "@/lib/telegram/client";
import { LINK_PREFIX, LINK_TTL_MS, cancelledText, deliveryPlan, groupIssuedMessage, personalKeyboard, personalMessage, type BotOrder, type DeliveryStatus } from "./bot-text";
import { sendToGroup } from "./group-send";
import { queuePositions } from "./rules";

// Seh bot delivery: personal messages to linked WORKSHOP users (edited on every status change) and the group report on ISSUED.
// A Telegram failure never undoes a status change; it is logged and flagged on the order for "qayta yuborish".

const include = {
  seller: { select: { name: true } }, issuedBy: { select: { name: true } },
  items: { orderBy: { order: "asc" as const }, select: { title: true, qty: true, issuedQty: true, options: true } },
};

export async function loadBotOrder(id: string): Promise<BotOrder | null> {
  const order = await getDb().workshopOrder.findUnique({ where: { id }, include });
  if (!order) return null;
  const options = order.items[0]?.options as { changes?: unknown } | null;
  return {
    id: order.id, number: order.number, type: order.type, purpose: order.purpose, customerName: order.customerName, qty: order.qty, dueDate: order.dueDate, note: order.note,
    sellerName: order.seller.name, noRequest: order.noRequest, status: order.status, cancelReason: order.cancelReason, startedAt: order.startedAt, issuedAt: order.issuedAt, issuedByName: order.issuedBy?.name ?? null,
    details: Array.isArray(options?.changes) ? (options.changes as string[]) : [], items: order.items.map(item => ({ title: item.title, qty: item.qty, issuedQty: item.issuedQty })),
  };
}

/** WORKSHOP users who linked the bot (active, approved). */
export async function workshopRecipients() {
  return getDb().adminUser.findMany({ where: { role: "WORKSHOP", isActive: true, approvalStatus: "APPROVED", telegramChatId: { not: null } }, select: { id: true, name: true, telegramChatId: true } });
}
async function queueOf() {
  return queuePositions(await getDb().workshopOrder.findMany({ where: { status: "ACCEPTED" }, select: { id: true, status: true, acceptedAt: true } }));
}

const notModified = (error: unknown) => error instanceof TelegramApiError && /message is not modified/i.test(error.description ?? "");
async function flag(orderId: string, error: unknown | null) {
  if (error) console.error("Seh Telegram delivery failed", { orderId, ...telegramErrorDetails(error) });
  const text = error ? (telegramErrorDetails(error).description ?? telegramErrorDetails(error).message ?? "Telegram xatosi").slice(0, 200) : null;
  await getDb().workshopOrder.update({ where: { id: orderId }, data: error ? { telegramFailedAt: new Date(), telegramError: text } : { telegramFailedAt: null, telegramError: null } }).catch(() => undefined);
}

/** Group report "✅ Sehdan chiqdi" — only for ISSUED orders, only once. Throws on failure so the order is flagged. */
async function sendGroupReport(order: BotOrder) {
  const chatId = telegramWorkshopChatId();
  if (!chatId || order.status !== "ISSUED") return;
  const current = await getDb().workshopOrder.findUnique({ where: { id: order.id }, select: { telegramMessageId: true } });
  if (current?.telegramMessageId) return;
  const sent = await sendToGroup(sendMessage, chatId, groupIssuedMessage(order));
  if (!sent.ok) throw new Error(sent.error);
  await getDb().workshopOrder.update({ where: { id: order.id }, data: { telegramChatId: sent.chatId, telegramMessageId: sent.messageId } });
}

/** Sends the personal message to every linked WORKSHOP user that has none yet, and edits the existing ones. */
async function deliver(orderId: string, queue?: Map<string, number>, sendMissing = false): Promise<DeliveryStatus> {
  const order = await loadBotOrder(orderId);
  if (!order) return "failed";
  let failure: unknown = null;
  const positions = queue ?? await queueOf();
  const [recipients, messages] = order.noRequest ? [[], []] : await Promise.all([workshopRecipients(), getDb().workshopOrderMessage.findMany({ where: { orderId } })]);
  const plan = deliveryPlan(order, recipients.map(user => user.telegramChatId!), messages.map(message => message.chatId), sendMissing);
  if (!order.noRequest) {
    const text = personalMessage(order, positions.get(order.id) ?? null), keyboard = personalKeyboard(order.id, order.status);
    for (const message of messages) {
      try { await editMessageText(message.chatId, message.messageId, text, keyboard); } catch (error) { if (!notModified(error)) failure = error; }
    }
    for (const chatId of plan.personal) {
      try {
        const sent = await sendMessage(chatId, text, keyboard);
        await getDb().workshopOrderMessage.create({ data: { orderId, chatId, messageId: sent.message_id } });
      } catch (error) { failure = error; }
    }
  }
  if (plan.group) { try { await sendGroupReport(order); } catch (error) { failure = error; } }
  await flag(orderId, failure);
  return failure ? "failed" : !order.noRequest && !recipients.length ? "no-recipients" : "sent";
}

/** New order → personal messages to linked WORKSHOP users (never the group). Tells the form how it went. */
export async function notifyCreated(orderId: string): Promise<DeliveryStatus> {
  return deliver(orderId).catch(async error => { await flag(orderId, error); return "failed" as const; });
}
/** After a status change; `requeue` also refreshes every "Navbatda" message (queue numbers moved). */
export async function notifyChanged(orderId: string, requeue: boolean) {
  const queue = await queueOf().catch(() => new Map<string, number>());
  await deliver(orderId, queue).catch(error => flag(orderId, error));
  if (!requeue) return;
  for (const [id] of [...queue].slice(0, 40)) if (id !== orderId) await deliver(id, queue).catch(error => flag(id, error));
}
/** Cancelled: every personal message becomes "❌ #… bekor qilindi" without buttons, plus a short new DM so it is noticed. */
export async function notifyCancelled(orderId: string) {
  await notifyChanged(orderId, true);
  const order = await loadBotOrder(orderId);
  if (!order) return;
  const messages = await getDb().workshopOrderMessage.findMany({ where: { orderId }, select: { chatId: true, messageId: true } });
  let failure: unknown = null;
  for (const message of messages) {
    try { await sendMessage(message.chatId, cancelledText(order)); } catch (error) { failure = error; }
  }
  if (failure) await flag(orderId, failure);
}

/** "Telegramga yuborilmadi · qayta yuborish" on the site. */
export async function resendOrder(orderId: string) {
  return (await deliver(orderId, undefined, true)) === "sent";
}

// ---- Linking a Telegram account ("Telegram ulash") -------------------------------------------------
let botUsername: string | null = null;
async function username() {
  if (!botUsername) botUsername = (await getMe()).username ?? null;
  return botUsername;
}
/** One-time code (15 min) and the t.me deep link that sends "/start seh_<code>". */
export async function createLinkCode(userId: string) {
  const code = randomBytes(12).toString("hex"), expiresAt = new Date(Date.now() + LINK_TTL_MS);
  await getDb().adminUser.update({ where: { id: userId }, data: { telegramLinkCode: code, telegramLinkExpiresAt: expiresAt } });
  const name = await username().catch(() => null);
  return { code: `${LINK_PREFIX}${code}`, url: name ? `https://t.me/${name}?start=${LINK_PREFIX}${code}` : null, expiresAt: expiresAt.toISOString() };
}
/** "/start seh_<code>" in a private chat: binds that chat to the user. One chat = one profile: whoever had it is unbound. */
export async function consumeLinkCode(code: string, chatId: string) {
  const db = getDb();
  const user = await db.adminUser.findUnique({ where: { telegramLinkCode: code }, select: { id: true, name: true, role: true, telegramLinkExpiresAt: true, isActive: true } });
  if (!user || !user.isActive || !user.telegramLinkExpiresAt || user.telegramLinkExpiresAt < new Date()) return null;
  const previous = await db.adminUser.findFirst({ where: { telegramChatId: chatId, NOT: { id: user.id } }, select: { id: true, name: true } });
  await db.$transaction([
    db.adminUser.updateMany({ where: { telegramChatId: chatId, NOT: { id: user.id } }, data: { telegramChatId: null } }),
    db.adminUser.update({ where: { id: user.id }, data: { telegramChatId: chatId, telegramLinkCode: null, telegramLinkExpiresAt: null } }),
  ]);
  return { ...user, previousName: previous?.name ?? null };
}

/** Sozlamalar → "Seh guruhiga test xabar": the result (or the reason it failed) is shown on the page. */
export async function sendGroupTest() {
  const chatId = telegramWorkshopChatId();
  if (!chatId) return { ok: false as const, error: "TELEGRAM_WORKSHOP_CHAT_ID sozlanmagan (Vercel → Environment Variables)." };
  const sent = await sendToGroup(sendMessage, chatId, "🔧 Test: seh guruhi ulandi");
  if (!sent.ok) { console.error("Seh group test failed", { error: sent.error }); return { ok: false as const, error: sent.error }; }
  return { ok: true as const, migratedTo: sent.migratedTo ?? null };
}
export async function sendPersonalTest(chatId: string | null) {
  if (!chatId) return { ok: false as const, error: "Telegram ulanmagan — avval “Telegram ulash” ni bosing." };
  try { await sendMessage(chatId, "🧪 Test: shaxsiy xabar keldi. Seh zakazlari shu yerga keladi."); return { ok: true as const }; }
  catch (error) { console.error("Seh personal test failed", telegramErrorDetails(error)); return { ok: false as const, error: "Yuborilmadi — botga /start bosilganmi, tekshiring." }; }
}
