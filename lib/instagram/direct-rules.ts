// Instagram Direct → Telegram: pure rules (no DB / network, safe in client components), covered by
// tests/instagram-direct.test.mjs.

export type DirectStatus = "UNREAD" | "OPENED" | "ANSWERED" | "DISMISSED";
export const STATUS_LABELS: Record<DirectStatus, string> = { UNREAD: "Qaralmagan", OPENED: "Ochildi", ANSWERED: "Javob berildi", DISMISSED: "Kerak emas" };
export const DISMISS_REASONS: Record<string, string> = { s: "Spam", a: "Reklama", n: "Kerak emas" };
export const REMIND_FIRST_MS = 30 * 60_000;
export const REMIND_SECOND_MS = 2 * 60 * 60_000;
export const DEFAULT_WORK_START = 9 * 60;
export const DEFAULT_WORK_END = 20 * 60;
const TZ_MS = 5 * 3_600_000; // Tashkent, UTC+5, no DST
const DAY_MS = 86_400_000;

// ---- Working hours (Tashkent) ----------------------------------------------------------------------------

/** "YYYY-MM-DD" of the Tashkent day. */
export const tashkentDate = (date: Date) => new Date(date.getTime() + TZ_MS).toISOString().slice(0, 10);
const dayStartUtc = (date: Date) => Math.floor((date.getTime() + TZ_MS) / DAY_MS) * DAY_MS - TZ_MS;
export const minutesOfDay = (date: Date) => Math.floor(((date.getTime() + TZ_MS) % DAY_MS) / 60_000);
export const isWorkTime = (date: Date, start: number, end: number) => { const minute = minutesOfDay(date); return minute >= start && minute < end; };
/** The UTC moment of hh:mm (minutes) on the Tashkent day of `date`. */
export const atMinute = (date: Date, minute: number) => new Date(dayStartUtc(date) + minute * 60_000);

/** How much of [from, to] falls inside working hours (only that time counts towards the 30 min / 2 h reminders). */
export function workingMs(from: Date, to: Date, start: number, end: number) {
  if (to <= from || end <= start) return 0;
  let total = 0;
  for (let day = dayStartUtc(from); day < to.getTime() && total < 30 * DAY_MS; day += DAY_MS) {
    const open = Math.max(day + start * 60_000, from.getTime()), close = Math.min(day + end * 60_000, to.getTime());
    if (close > open) total += close - open;
  }
  return total;
}

/** "HH:MM" ↔ minutes. */
export const formatMinute = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export function parseMinute(value: string) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// ---- Conversation state ----------------------------------------------------------------------------------

export type ConversationState = { status: DirectStatus; waitingSince: Date | null; cycleCount: number; messageCount: number };

/**
 * A customer message. Waiting conversations (Qaralmagan / Ochildi) keep their card (one card per cycle, edited in place);
 * after Javob berildi / Kerak emas — or for a new person — a new cycle starts: Qaralmagan again, a new card, reminders
 * from zero. Outside working hours a new cycle is deferred to the 09:00 digest.
 */
export function onIncoming(state: ConversationState | null, at: Date, workTime: boolean) {
  const newCycle = !state || state.status === "ANSWERED" || state.status === "DISMISSED";
  if (!newCycle) return { newCycle, data: { cycleCount: state.cycleCount + 1, messageCount: state.messageCount + 1, lastIncomingAt: at } };
  return {
    newCycle,
    data: {
      status: "UNREAD" as const, waitingSince: at, cycleCount: 1, messageCount: (state?.messageCount ?? 0) + 1, lastIncomingAt: at,
      openedAt: null, openedById: null, openedByName: null, answeredAt: null, answeredVia: null, dismissedAt: null, dismissReason: null, dismissedBy: null,
      reminded30At: null, reminded2hAt: null, telegramCards: [], deferred: !workTime,
    },
  };
}

/**
 * Our own message (echo). Only a non-automatic echo answers: the conversation becomes Javob berildi with the response
 * time. Automatic messages (comment Private Reply, auto message) never change the state.
 */
export function onEcho(state: ConversationState | null, at: Date, isAuto: boolean) {
  if (!state || isAuto) return null;
  if (state.status !== "UNREAD" && state.status !== "OPENED") return { answered: false, responseMs: null, data: { lastOutgoingAt: at } };
  const responseMs = state.waitingSince ? Math.max(0, at.getTime() - state.waitingSince.getTime()) : null;
  return { answered: true, responseMs, data: { status: "ANSWERED" as const, answeredAt: at, answeredVia: "INSTAGRAM", lastResponseMs: responseMs, waitingSince: null, lastOutgoingAt: at, deferred: false } };
}

export type AutoMarks = { mids: ReadonlySet<string>; texts: ReadonlyArray<{ text: string; at: Date }> };
/** Is this echo one of our automatic messages? Same message id, or the same text sent by us within 15 minutes. */
export function isAutoEcho(echo: { mid: string; text: string | null; time: Date }, marks: AutoMarks) {
  if (marks.mids.has(echo.mid)) return true;
  const text = echo.text?.trim();
  return !!text && marks.texts.some(item => item.text.trim() === text && Math.abs(item.at.getTime() - echo.time.getTime()) < 15 * 60_000);
}

// ---- Reminders -------------------------------------------------------------------------------------------

export type ReminderState = { status: DirectStatus; waitingSince: Date | null; deferred: boolean; reminded30At: Date | null; reminded2hAt: Date | null };
/**
 * Which reminder is due: "first" (⏰ 30 min, the recipients) or "second" (2 h, recipients + Super Admins). Waiting time
 * counts only inside working hours, reminders go out only during them, and a deferred conversation waits for the digest.
 */
export function dueReminder(state: ReminderState, now: Date, start: number, end: number): "first" | "second" | null {
  if ((state.status !== "UNREAD" && state.status !== "OPENED") || !state.waitingSince || state.deferred || !isWorkTime(now, start, end)) return null;
  const waited = workingMs(state.waitingSince, now, start, end);
  if (!state.reminded2hAt && waited >= REMIND_SECOND_MS) return "second";
  if (!state.reminded30At && !state.reminded2hAt && waited >= REMIND_FIRST_MS) return "first";
  return null;
}

/** 09:00 digest due: working hours have started today and today's digest was not sent. 20:00 report: the same after the end. */
export const digestDue = (now: Date, start: number, end: number, lastDate: string | null) => minutesOfDay(now) >= start && minutesOfDay(now) < end && lastDate !== tashkentDate(now);
export const reportDue = (now: Date, end: number, lastDate: string | null) => minutesOfDay(now) >= end && lastDate !== tashkentDate(now);

// ---- Telegram texts --------------------------------------------------------------------------------------

const KIND_TEXT: Record<string, string> = { IMAGE: "🖼 Rasm", AUDIO: "🎤 Ovozli xabar", VIDEO: "🎬 Video", FILE: "📎 Fayl", SHARE: "🔁 Post / Reels ulashdi", STORY: "📣 Story’da belgiladi", STICKER: "🙂 Stiker", OTHER: "📎 Xabar" };
export const messagePreview = (message: { text: string | null; kind: string }) => message.text?.trim() ? `“${message.text.trim().slice(0, 300)}”` : KIND_TEXT[message.kind] ?? KIND_TEXT.OTHER;
export const hhmm = (date: Date) => { const minute = minutesOfDay(date); return formatMinute(minute); };
export function duration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} daq`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours < 24 ? `${hours} soat${rest ? ` ${rest} daq` : ""}` : `${Math.floor(hours / 24)} kun ${hours % 24} soat`;
}
export const personLabel = (person: { username: string | null; name: string | null; igsid?: string }) => person.username ? `@${person.username}${person.name ? ` (${person.name})` : ""}` : person.name ?? "Instagram foydalanuvchisi";
export const directLink = (username: string | null) => username ? `https://ig.me/m/${encodeURIComponent(username)}` : "https://www.instagram.com/direct/inbox/";

export type CardInput = {
  username: string | null; name: string | null; status: DirectStatus; cycleCount: number; waitingSince: Date | null;
  openedByName: string | null; openedAt: Date | null; answeredAt: Date | null; lastResponseMs: number | null; dismissReason: string | null; dismissedBy: string | null;
  /** Newest last. */
  recent: Array<{ text: string | null; kind: string; sentAt: Date }>;
};

/** One Telegram card per conversation cycle: the last 3 messages + the total, then the state line. */
export function cardText(card: CardInput, now = new Date()) {
  const last = card.recent.slice(-3);
  const lines = [`📩 Instagram: ${personLabel(card)}`];
  if (last.length === 1 && card.cycleCount <= 1) lines[0] += ` — ${messagePreview(last[0])} — ${hhmm(last[0].sentAt)}`;
  else {
    for (const message of last) lines.push(`• ${messagePreview(message)} — ${hhmm(message.sentAt)}`);
    if (card.cycleCount > last.length) lines.push(`Jami: ${card.cycleCount} ta xabar`);
  }
  lines.push("");
  if (card.status === "ANSWERED") lines.push(`✅ Javob berildi · ${card.answeredAt ? hhmm(card.answeredAt) : ""}${card.lastResponseMs !== null ? ` (${duration(card.lastResponseMs)})` : ""}`);
  else if (card.status === "DISMISSED") lines.push(`🚫 Kerak emas${card.dismissReason ? `: ${card.dismissReason}` : ""}${card.dismissedBy ? ` — ${card.dismissedBy}` : ""}`);
  else if (card.status === "OPENED") lines.push(`👀 Ochildi: ${card.openedByName ?? "admin"}${card.openedAt ? ` · ${hhmm(card.openedAt)}` : ""} · javob kutilmoqda`);
  else lines.push(`⏳ Qaralmagan${card.waitingSince ? ` · ${duration(now.getTime() - card.waitingSince.getTime())}` : ""}`);
  return lines.join("\n").slice(0, 4000);
}

export function reminderText(kind: "first" | "second", person: { username: string | null; name: string | null }, last: { text: string | null; kind: string } | null, waitedMs: number) {
  return `${kind === "first" ? "⏰ Kutyapti" : "⏰⏰ Javobsiz"} ${duration(waitedMs)}: ${personLabel(person)}${last ? ` — ${messagePreview(last)}` : ""}`;
}

export function digestText(rows: Array<{ username: string | null; name: string | null; last: { text: string | null; kind: string } | null; since: Date }>) {
  return [`🌅 Ish vaqtidan tashqari kelgan yozishmalar: ${rows.length} ta`, ...rows.slice(0, 30).map((row, index) => `${index + 1}. ${personLabel(row)} — ${row.last ? messagePreview(row.last) : ""} (${hhmm(row.since)})`), rows.length > 30 ? `… va yana ${rows.length - 30} ta` : ""].filter(Boolean).join("\n").slice(0, 4000);
}

export type ReportInput = { conversations: number; answered: number; responseMs: number[]; waiting: Array<{ username: string | null; name: string | null; waitingMs: number }> };
/** Daily report: incoming, answered, still waiting (list), average and longest wait. */
export function reportText(date: string, input: ReportInput) {
  const average = input.responseMs.length ? input.responseMs.reduce((sum, value) => sum + value, 0) / input.responseMs.length : null;
  const longest = Math.max(0, ...input.responseMs, ...input.waiting.map(row => row.waitingMs));
  const waiting = [...input.waiting].sort((a, b) => b.waitingMs - a.waitingMs);
  return [
    `📊 Instagram Direct · ${date}`,
    `Kelgan yozishmalar: ${input.conversations}`,
    `Javob berilgan: ${input.answered}`,
    `Qaralmagan / javobsiz: ${waiting.length}`,
    `O‘rtacha javob vaqti: ${average === null ? "—" : duration(average)}`,
    `Eng uzoq kutgan: ${longest ? duration(longest) : "—"}`,
    ...(waiting.length ? ["", ...waiting.slice(0, 25).map((row, index) => `${index + 1}. ${personLabel(row)} — ${duration(row.waitingMs)}`)] : []),
  ].join("\n").slice(0, 4000);
}

// ---- Phone → lead ----------------------------------------------------------------------

/** The first phone number in a message, as "+998XXXXXXXXX" (Uzbek 9-digit numbers get +998), or null. */
export function extractPhone(text: string | null | undefined) {
  if (!text) return null;
  for (const match of text.matchAll(/(?:\+|\b)[\d][\d\s\-().]{7,18}\d/g)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
    if (digits.length === 9 && /^(?:9\d|8[78]|7\d|5[05]|33|20)/.test(digits)) return `+998${digits}`;
    if (match[0].trim().startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  }
  return null;
}
