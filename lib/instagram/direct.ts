import "server-only";
// Instagram Direct → Telegram. Every customer message lands in a conversation; the admins who receive Instagram get one
// Telegram card per conversation cycle (edited in place), reminders at 30 min / 2 h of working time, a 09:00 digest of
// what came outside working hours and a 20:00 report. Madina never answers in Direct.
import type { InstagramAccount, InstagramConversation, Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { expireDashboard } from "@/lib/referrals/tracking";
import { SITE_URL } from "@/lib/site-url";
import { editMessageText, sendMessage } from "@/lib/telegram/client";
import type { InlineKeyboard } from "@/lib/telegram/types";
import { getUserProfile, sendDirectMessage } from "./graph";
import { DISMISS_REASONS, cardText, digestDue, digestText, directLink, dueReminder, extractPhone, isAutoEcho, isWorkTime, onEcho, onIncoming, personLabel, reminderText, reportDue, reportText, tashkentDate, workingMs, type DirectStatus } from "./direct-rules";
import { openSignature } from "./direct-sign";
import type { MessageEvent } from "./rules";

const ACCOUNT_ID = "global";
type Card = { chatId: string; messageId: number; adminId: string };
type Recipient = { id: string; name: string; chatId: string };
const safeType = (error: unknown) => error instanceof Error ? error.name : "UnknownError";
const cardsOf = (value: Prisma.JsonValue): Card[] => Array.isArray(value) ? value.filter((item): item is Card => !!item && typeof item === "object" && typeof (item as Card).chatId === "string" && typeof (item as Card).messageId === "number") : [];
export const openSecret = () => process.env.INSTAGRAM_APP_SECRET?.trim() || process.env.CRON_SECRET?.trim() || null;

/** Users with "Instagram so‘rovlarini oladi" and a linked Telegram; `withSuper` adds every Super Admin with Telegram. */
async function recipients(withSuper = false): Promise<Recipient[]> {
  const rows = await getDb().adminUser.findMany({ where: { isActive: true, archivedAt: null, telegramChatId: { not: null }, OR: [{ receivesInstagramDirect: true }, ...(withSuper ? [{ role: "SUPER_ADMIN" as const }] : [])] }, select: { id: true, name: true, telegramChatId: true } });
  return rows.map(row => ({ id: row.id, name: row.name, chatId: row.telegramChatId! }));
}

/** "Instagram’da ochish" for one admin: our signed redirect (records who opened), or the plain Instagram link. */
function openUrl(conversation: Pick<InstagramConversation, "id" | "username">, adminId: string) {
  const secret = openSecret();
  if (!secret) return directLink(conversation.username);
  return `${SITE_URL}/api/instagram/direct/open?${new URLSearchParams({ c: conversation.id, u: adminId, s: openSignature(secret, conversation.id, adminId) })}`;
}

function keyboard(conversation: InstagramConversation, adminId: string): InlineKeyboard {
  const open = { text: "Instagram’da ochish ↗", url: openUrl(conversation, adminId) };
  if (conversation.status === "DISMISSED") return { inline_keyboard: [] };
  if (conversation.status === "ANSWERED") return { inline_keyboard: [[open]] };
  return { inline_keyboard: [[open], [{ text: "🚫 Kerak emas", callback_data: `igdm:x:${conversation.id}` }]] };
}

async function renderCard(conversation: InstagramConversation) {
  const recent = await getDb().instagramMessage.findMany({ where: { conversationId: conversation.id, direction: "IN" }, orderBy: { sentAt: "desc" }, take: 3, select: { text: true, kind: true, sentAt: true } });
  return cardText({ ...conversation, status: conversation.status as DirectStatus, recent: recent.reverse() });
}

/**
 * Sends the card of the current cycle (once, to every recipient) or edits the existing ones. A deferred conversation
 * gets no card (it is in the 09:00 digest) unless it already has one.
 */
export async function syncCards(conversationId: string) {
  const db = getDb();
  let conversation = await db.instagramConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;
  const cards = cardsOf(conversation.telegramCards);
  if (cards.length) {
    const text = await renderCard(conversation);
    for (const card of cards) await editMessageText(card.chatId, card.messageId, text, keyboard(conversation, card.adminId)).catch(() => undefined);
    return;
  }
  if (conversation.deferred || (conversation.status !== "UNREAD" && conversation.status !== "OPENED")) return;
  // One sender per conversation: the first webhook that takes the lock sends, the others leave it.
  const now = new Date();
  const lock = await db.instagramConversation.updateMany({ where: { id: conversationId, OR: [{ cardLockUntil: null }, { cardLockUntil: { lt: now } }] }, data: { cardLockUntil: new Date(now.getTime() + 60_000) } });
  if (lock.count !== 1) return;
  try {
    const people = await recipients();
    const text = await renderCard(conversation);
    const sent: Card[] = [];
    for (const person of people) {
      try { const message = await sendMessage(person.chatId, text, keyboard(conversation, person.id)); sent.push({ chatId: person.chatId, messageId: message.message_id, adminId: person.id }); }
      catch (error) { console.error("Instagram Direct card failed", { type: safeType(error) }); }
    }
    conversation = await db.instagramConversation.update({ where: { id: conversationId }, data: { telegramCards: sent, cardLockUntil: null } });
    // Messages that arrived while sending: one edit brings the card up to date.
    const fresh = await renderCard(conversation);
    if (fresh !== text) for (const card of sent) await editMessageText(card.chatId, card.messageId, fresh, keyboard(conversation, card.adminId)).catch(() => undefined);
  } catch (error) {
    await db.instagramConversation.update({ where: { id: conversationId }, data: { cardLockUntil: null } }).catch(() => undefined);
    throw error;
  }
}

// ---- Webhook events --------------------------------------------------------------------------------------

/**
 * Synchronous part (DB only): customer messages and our echoes into conversations / messages. Returns what the
 * background part should do (cards, profiles, auto message, phone leads).
 */
export async function recordDirectEvents(events: MessageEvent[], account: InstagramAccount) {
  const db = getDb();
  const touched = new Set<string>(), created: string[] = [], phones: Array<{ conversationId: string; phone: string; text: string }> = [];
  if (!events.length) return { touched: [], created, phones };
  // Our automatic messages: comment Private Replies (id or text) and the Direct auto message.
  const since = new Date(Date.now() - 30 * 60_000);
  const autos = await db.instagramComment.findMany({ where: { dmSentAt: { gte: since } }, select: { dmMessageId: true, dmText: true, dmSentAt: true } });
  const marks = { mids: new Set(autos.map(row => row.dmMessageId).filter((mid): mid is string => !!mid)), texts: [...autos.filter(row => row.dmText).map(row => ({ text: row.dmText!, at: row.dmSentAt! })), ...(account.directAutoAckEnabled ? [{ text: account.directAutoAckText, at: new Date() }] : [])] };

  for (const event of events) {
    const echo = event.isEcho || event.fromId === account.igUserId;
    const customer = echo ? event.recipientId : event.fromId;
    if (!customer || customer === account.igUserId) continue;
    if (await db.instagramMessage.findUnique({ where: { mid: event.mid }, select: { mid: true } })) continue;
    const existing = await db.instagramConversation.findUnique({ where: { igsid: customer } });
    if (!echo) {
      const change = onIncoming(existing && { ...existing, status: existing.status as DirectStatus }, event.time, isWorkTime(event.time, account.directWorkStart, account.directWorkEnd));
      const conversation = existing
        ? await db.instagramConversation.update({ where: { id: existing.id }, data: change.data })
        : await db.instagramConversation.create({ data: { igsid: customer, firstMessageAt: event.time, ...change.data } });
      if (!existing) created.push(conversation.id);
      await db.instagramMessage.createMany({ data: [{ mid: event.mid, fromId: event.fromId, toId: event.recipientId, text: event.text, hasAttachments: event.hasAttachments, kind: event.kind, sentAt: event.time, direction: "IN", conversationId: conversation.id }], skipDuplicates: true });
      touched.add(conversation.id);
      const phone = extractPhone(event.text);
      if (phone && !conversation.leadId) phones.push({ conversationId: conversation.id, phone, text: event.text ?? "" });
      continue;
    }
    const auto = isAutoEcho({ mid: event.mid, text: event.text, time: event.time }, marks) || (!!existing?.autoAckAt && event.text?.trim() === account.directAutoAckText.trim() && Math.abs(existing.autoAckAt.getTime() - event.time.getTime()) < 15 * 60_000);
    const change = onEcho(existing && { ...existing, status: existing.status as DirectStatus }, event.time, auto);
    await db.instagramMessage.createMany({ data: [{ mid: event.mid, fromId: event.fromId, toId: customer, text: event.text, hasAttachments: event.hasAttachments, kind: event.kind, sentAt: event.time, direction: "OUT", isAuto: auto, conversationId: existing?.id ?? null, responseMs: change?.answered ? change.responseMs : null }], skipDuplicates: true });
    if (existing && change) {
      await db.instagramConversation.update({ where: { id: existing.id }, data: change.data });
      if (change.answered) touched.add(existing.id);
    }
  }
  return { touched: [...touched], created, phones };
}

/** Background part: names, cards, the optional auto message, phone leads, then a tick. Never throws. */
export async function afterDirectEvents(result: Awaited<ReturnType<typeof recordDirectEvents>>, account: InstagramAccount, token: string | null) {
  const db = getDb();
  for (const id of result.touched) {
    try {
      const conversation = await db.instagramConversation.findUnique({ where: { id }, select: { igsid: true, profileFetchedAt: true } });
      if (token && conversation && !conversation.profileFetchedAt) {
        const profile = await getUserProfile(token, conversation.igsid).catch(() => null);
        await db.instagramConversation.update({ where: { id }, data: { profileFetchedAt: new Date(), ...(profile ? { username: profile.username, name: profile.name } : {}) } });
      }
      await syncCards(id);
    } catch (error) { console.error("Instagram Direct sync failed", { type: safeType(error) }); }
  }
  if (account.directAutoAckEnabled && token) for (const id of result.created) {
    try {
      const claimed = await db.instagramConversation.updateMany({ where: { id, autoAckAt: null }, data: { autoAckAt: new Date() } });
      if (claimed.count !== 1) continue;
      const conversation = await db.instagramConversation.findUnique({ where: { id }, select: { igsid: true } });
      if (conversation) await sendDirectMessage(token, account.igUserId, conversation.igsid, account.directAutoAckText.slice(0, 1000));
    } catch (error) { console.error("Instagram Direct auto message failed", { type: safeType(error) }); }
  }
  for (const item of result.phones) await createDirectLead(item.conversationId, item.phone, item.text).catch(error => console.error("Instagram Direct lead failed", { type: safeType(error) }));
  await directTick().catch(error => console.error("Instagram Direct tick failed", { type: safeType(error) }));
}

/** BKLead lead from a phone number written in Direct; one per person (Lead.submissionKey "igdm:<igsid>"). */
async function createDirectLead(conversationId: string, phone: string, text: string) {
  const db = getDb();
  const conversation = await db.instagramConversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.leadId) return;
  const submissionKey = `igdm:${conversation.igsid}`.slice(0, 100);
  const existing = await db.lead.findUnique({ where: { submissionKey }, select: { id: true } });
  let leadId = existing?.id ?? null;
  if (!leadId) {
    const notes = [`Instagram Direct: «${text.slice(0, 500)}»`, conversation.username ? `Instagram: https://instagram.com/${conversation.username}` : `Instagram id: ${conversation.igsid}`].join("\n");
    const created = await db.lead.createManyAndReturn({ data: [{ submissionKey, customerName: personLabel(conversation), phone, requestType: "Instagram Direct", notes, source: "INSTAGRAM_DM" }], skipDuplicates: true, select: { id: true } });
    leadId = created[0]?.id ?? (await db.lead.findUnique({ where: { submissionKey }, select: { id: true } }))?.id ?? null;
    if (created[0]) {
      await db.leadActivity.create({ data: { leadId: created[0].id, type: "LEAD_CREATED" } });
      try { expireDashboard(); } catch { /* outside a request scope */ }
      // Imported lazily: lib/telegram/service imports the Telegram buttons of this module.
      const { publishLeadToTelegram } = await import("@/lib/telegram/service");
      await publishLeadToTelegram(created[0].id);
    }
  }
  if (leadId) await db.instagramConversation.update({ where: { id: conversationId }, data: { leadId } });
}

// ---- Admin actions (Telegram buttons, signed link, admin panel) -------------------------------------------

/** "Instagram’da ochish": the first admin to open becomes responsible (Qaralmagan → Ochildi). */
export async function markOpened(conversationId: string, adminId: string) {
  const admin = await getDb().adminUser.findUnique({ where: { id: adminId }, select: { name: true } });
  if (!admin) return null;
  const { count } = await getDb().instagramConversation.updateMany({ where: { id: conversationId, status: "UNREAD" }, data: { status: "OPENED", openedAt: new Date(), openedById: adminId, openedByName: admin.name } });
  return { changed: count === 1 };
}

/** "Kerak emas / spam" with a reason; edits the cards. */
export async function dismissConversation(conversationId: string, reason: string, by: string) {
  const { count } = await getDb().instagramConversation.updateMany({ where: { id: conversationId, status: { in: ["UNREAD", "OPENED"] } }, data: { status: "DISMISSED", dismissedAt: new Date(), dismissReason: reason.slice(0, 200), dismissedBy: by, waitingSince: null, deferred: false } });
  if (count) await syncCards(conversationId).catch(error => console.error("Instagram Direct sync failed", { type: safeType(error) }));
  return count === 1;
}
export const dismissReason = (code: string) => DISMISS_REASONS[code] ?? null;

// ---- Tick: reminders, digest, report ---------------------------------------------------------------------

async function broadcast(people: Recipient[], text: string, buttons?: (person: Recipient) => InlineKeyboard) {
  let sent = 0;
  for (const person of people) {
    try { await sendMessage(person.chatId, text, buttons?.(person)); sent++; }
    catch (error) { console.error("Instagram Direct notice failed", { type: safeType(error) }); }
  }
  return sent;
}
const uniq = (people: Recipient[]) => [...new Map(people.map(person => [person.chatId, person])).values()];

/**
 * Does whatever is due: reminders (30 min → recipients, 2 h → + Super Admins), the digest at the start of working hours,
 * the report at the end. Idempotent (each step is claimed in the DB) and throttled to once a minute unless forced — it is
 * called from both webhooks, the daily crons and /api/cron/instagram-direct.
 */
export async function directTick(options: { force?: boolean; now?: Date } = {}) {
  const db = getDb(), now = options.now ?? new Date();
  const result = { reminders: 0, digest: 0, report: false, skipped: false };
  if (!options.force) {
    const { count } = await db.instagramAccount.updateMany({ where: { id: ACCOUNT_ID, OR: [{ directTickAt: null }, { directTickAt: { lt: new Date(now.getTime() - 55_000) } }] }, data: { directTickAt: now } });
    if (count !== 1) { result.skipped = true; return result; }
  }
  const account = await db.instagramAccount.findUnique({ where: { id: ACCOUNT_ID } });
  if (!account) return result;
  const start = account.directWorkStart, end = account.directWorkEnd, today = tashkentDate(now);
  const lastOf = async (conversationId: string) => db.instagramMessage.findFirst({ where: { conversationId, direction: "IN" }, orderBy: { sentAt: "desc" }, select: { text: true, kind: true } });

  // 09:00 digest of conversations that came outside working hours.
  if (digestDue(now, start, end, account.directDigestDate)) {
    const claimed = await db.instagramAccount.updateMany({ where: { id: ACCOUNT_ID, OR: [{ directDigestDate: null }, { directDigestDate: { not: today } }] }, data: { directDigestDate: today } });
    if (claimed.count === 1) {
      const deferred = await db.instagramConversation.findMany({ where: { deferred: true, status: { in: ["UNREAD", "OPENED"] } }, orderBy: { waitingSince: "asc" } });
      if (deferred.length) {
        const rows = await Promise.all(deferred.map(async row => ({ username: row.username, name: row.name, last: await lastOf(row.id), since: row.waitingSince ?? row.lastIncomingAt ?? now })));
        result.digest = await broadcast(await recipients(), digestText(rows), person => ({ inline_keyboard: deferred.slice(0, 20).map(row => [{ text: `${personLabel(row).slice(0, 40)} ↗`, url: openUrl(row, person.id) }]) }));
        await db.instagramConversation.updateMany({ where: { id: { in: deferred.map(row => row.id) } }, data: { deferred: false } });
      }
    }
  }

  // Reminders.
  if (isWorkTime(now, start, end)) {
    const waiting = await db.instagramConversation.findMany({ where: { status: { in: ["UNREAD", "OPENED"] }, deferred: false, waitingSince: { not: null }, reminded2hAt: null }, take: 100 });
    for (const row of waiting) {
      const due = dueReminder({ ...row, status: row.status as DirectStatus }, now, start, end);
      if (!due) continue;
      const claimed = await db.instagramConversation.updateMany({ where: { id: row.id, ...(due === "first" ? { reminded30At: null } : { reminded2hAt: null }) }, data: due === "first" ? { reminded30At: now } : { reminded2hAt: now, reminded30At: row.reminded30At ?? now } });
      if (claimed.count !== 1) continue;
      const people = due === "first" ? await recipients() : uniq(await recipients(true));
      const text = reminderText(due, row, await lastOf(row.id), workingMs(row.waitingSince!, now, start, end));
      await broadcast(people, text, person => ({ inline_keyboard: [[{ text: "Instagram’da ochish ↗", url: openUrl(row, person.id) }]] }));
      result.reminders++;
    }
  }

  // 20:00 report.
  if (reportDue(now, end, account.directReportDate)) {
    const claimed = await db.instagramAccount.updateMany({ where: { id: ACCOUNT_ID, OR: [{ directReportDate: null }, { directReportDate: { not: today } }] }, data: { directReportDate: today } });
    if (claimed.count === 1) {
      const dayStart = new Date(new Date(`${today}T00:00:00Z`).getTime() - 5 * 3_600_000);
      const [incoming, answers, waiting] = await Promise.all([
        db.instagramMessage.findMany({ where: { direction: "IN", sentAt: { gte: dayStart }, conversationId: { not: null } }, select: { conversationId: true }, distinct: ["conversationId"] }),
        db.instagramMessage.findMany({ where: { direction: "OUT", isAuto: false, responseMs: { not: null }, sentAt: { gte: dayStart } }, select: { responseMs: true } }),
        db.instagramConversation.findMany({ where: { status: { in: ["UNREAD", "OPENED"] }, waitingSince: { not: null } }, select: { username: true, name: true, waitingSince: true } }),
      ]);
      await broadcast(uniq(await recipients(true)), reportText(today, { conversations: incoming.length, answered: answers.length, responseMs: answers.map(row => row.responseMs!), waiting: waiting.map(row => ({ username: row.username, name: row.name, waitingMs: now.getTime() - row.waitingSince!.getTime() })) }));
      result.report = true;
    }
  }
  return result;
}

