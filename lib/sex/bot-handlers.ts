import "server-only";
import { getDb } from "@/lib/db";
import { answerCallbackQuery, editMessageText, sendMessage, telegramErrorDetails } from "@/lib/telegram/client";
import type { TelegramCallbackQuery, TelegramMessage } from "@/lib/telegram/types";
import { consumeLinkCode } from "./bot";
import { isBotCommand, limitKeyboard, limitQuestion, orderRecipient, orderTitle, parseSehCallback, parseStartPayload, queueText, todayText } from "./bot-text";
import { workshopDay } from "./queries";
import { queuePositions, workingSince } from "./rules";
import { transitionOrder } from "./service";

// Seh bot input: buttons in the personal order messages and the /start seh_<code>, /navbat, /bugun commands.
// The webhook route does not pre-acknowledge "seh:" buttons, so every reply here is the button's own answer.

const DENIED = "Ruxsat yo‘q: bu tugma faqat botni ulagan seh mas’uli uchun.";
const log = (label: string) => (error: unknown) => console.error(label, telegramErrorDetails(error));

/** The WORKSHOP user bound to this Telegram account, or null (anyone else is refused). */
async function workshopUser(telegramUserId: number) {
  const user = await getDb().adminUser.findUnique({ where: { telegramChatId: String(telegramUserId) } });
  return user && user.role === "WORKSHOP" && user.isActive && user.approvalStatus === "APPROVED" ? user : null;
}

export async function handleSehCallback(callback: TelegramCallbackQuery) {
  const parsed = parseSehCallback(callback.data);
  if (!parsed) return false;
  const answer = (text: string, alert = false) => answerCallbackQuery(callback.id, text, alert).catch(log("Seh callback answer failed"));
  const user = await workshopUser(callback.from.id);
  if (!user) { await answer(DENIED, true); return true; }
  const { action, orderId } = parsed;
  if (action === "startno") {
    await answer("Bekor qilindi");
    if (callback.message) await editMessageText(String(callback.message.chat.id), callback.message.message_id, "Terish boshlanmadi.").catch(log("Seh limit message edit failed"));
    return true;
  }
  // Past the daily limit a start only asks first ("Baribir boshlaysizmi?"); it is never blocked.
  if (action === "start") {
    const day = await workshopDay();
    if (day.started >= day.limit) {
      await answer("Kunlik limit to‘lgan");
      await sendMessage(String(callback.from.id), limitQuestion(day.started), limitKeyboard(orderId)).catch(log("Seh limit question failed"));
      return true;
    }
  }
  const step = action === "startok" ? "start" : action;
  const result = await transitionOrder(user, orderId, step, undefined, "telegram");
  if (!result.ok) { await answer(result.error, true); return true; }
  await answer(step === "accept" ? "✅ Qabul qilindi" : step === "start" ? "🔧 Terish boshlandi" : "📦 Chiqib ketdi");
  if (action === "startok" && callback.message) await editMessageText(String(callback.message.chat.id), callback.message.message_id, "🔧 Terish boshlandi.").catch(log("Seh limit message edit failed"));
  return true;
}

export async function handleSehMessage(message: TelegramMessage) {
  if (message.chat.type !== "private" || !message.from || message.from.is_bot) return false;
  const reply = (text: string) => sendMessage(String(message.chat.id), text).catch(log("Seh bot reply failed"));
  const code = parseStartPayload(message.text);
  if (code) {
    const user = await consumeLinkCode(code, String(message.chat.id));
    await reply(user
      ? `✅ Ulandingiz, ${user.name}.${user.role === "WORKSHOP" ? " Yangi seh zakazlari shu yerga keladi: tugmalar bilan qabul qiling, terishni boshlang va “Chiqib ketdi” bosing.\n\n/navbat — navbatdagilar\n/bugun — bugungi hisob" : " Bu chatga test xabarlar keladi."}`
      : "Kod eskirgan yoki noto‘g‘ri. Saytda “Telegram ulash” ni qayta bosing (kod 15 daqiqa amal qiladi).");
    return true;
  }
  const navbat = isBotCommand(message.text, "navbat"), bugun = isBotCommand(message.text, "bugun");
  if (!navbat && !bugun) return false;
  const user = await workshopUser(message.from.id);
  if (!user) { await reply(DENIED.replace("bu tugma", "bu buyruq")); return true; }
  if (bugun) {
    const day = await workshopDay();
    await reply(todayText(day.started, day.limit, day.issuedToday.map(number => Number(number.replace(/\D+/g, "")))));
    return true;
  }
  const open = await getDb().workshopOrder.findMany({
    where: { status: { in: ["ACCEPTED", "STARTED"] } }, orderBy: { acceptedAt: "asc" },
    select: { id: true, number: true, type: true, qty: true, purpose: true, customerName: true, status: true, acceptedAt: true, startedAt: true, items: { orderBy: { order: "asc" }, select: { title: true, qty: true, issuedQty: true } } },
  });
  const positions = queuePositions(open), now = new Date();
  const queued = open.filter(order => order.status === "ACCEPTED").sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
  const started = open.filter(order => order.status === "STARTED");
  await reply(queueText(
    queued.map(order => ({ number: order.number, title: orderTitle(order), recipient: orderRecipient(order) })),
    started.map(order => ({ number: order.number, title: orderTitle(order), since: order.startedAt ? workingSince(order.startedAt, now) : "—" })),
  ));
  return true;
}
