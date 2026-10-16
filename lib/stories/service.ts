import "server-only";
// Stories queue: API upload → Telegram / admin approval (Super Admin) → cron publishes at scheduledAt (Asia/Tashkent).
import type { Prisma, StoryQueueItem } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit/service";
import { getDb } from "@/lib/db";
import { editMessageCaption, editMessageText, sendMessage, sendVideo, telegramErrorDetails } from "@/lib/telegram/client";
import { accountTag } from "@/lib/instagram/direct";
import { FIRST_ACCOUNT_ID, accountToken, getInstagramAccount } from "@/lib/instagram/service";
import { StoryGraphError, containerStatus, createStoryContainer, publishContainer, type PublishTarget } from "./graph";
import { TELEGRAM_URL_VIDEO_LIMIT, approvalKeyboard, approvalText, containerStep, dayBounds, failedText, isDue, needsContainerCheck, nextStatus, publishedText, shouldExpire, type StoryAction, type StoryStatus, type VideoInfo } from "./rules";

type Actor = { id: string; name: string };
type TelegramRef = { chatId: string; messageId: number; kind: "video" | "text" };
const LOCK_MS = 2 * 60_000;
const safeType = (error: unknown) => error instanceof Error ? error.name : "UnknownError";

/** Super Admins with a linked Telegram (they get the approval messages; only their callbacks count). */
export async function superAdminChats() {
  const rows = await getDb().adminUser.findMany({ where: { role: "SUPER_ADMIN", isActive: true, telegramChatId: { not: null } }, select: { id: true, name: true, telegramChatId: true } });
  return rows.map(row => ({ id: row.id, name: row.name, chatId: row.telegramChatId! }));
}

/** Which account a story is for: its id or @username; empty = the first connected. null = unknown. */
export async function resolveStoryAccount(value: unknown) {
  const key = typeof value === "string" ? value.trim().replace(/^@/, "") : "";
  if (!key) return (await getInstagramAccount())?.id ?? FIRST_ACCOUNT_ID;
  const account = await getDb().instagramAccount.findFirst({ where: { OR: [{ id: key }, { username: { equals: key, mode: "insensitive" } }] }, select: { id: true } });
  return account?.id ?? null;
}

/** Env token for the first account, the account's own token for the others. */
async function targetFor(accountId: string): Promise<PublishTarget | null> {
  if (accountId === FIRST_ACCOUNT_ID) return null;
  const account = await getDb().instagramAccount.findUnique({ where: { id: accountId } });
  const token = account && accountToken(account);
  if (!account || !token) throw new StoryGraphError(0, undefined, "Instagram akkaunt ulanmagan yoki tokeni o‘qilmadi — Sozlamalarda qayta ulang");
  return { igUserId: account.igUserId, token };
}

const storyText = async (item: StoryQueueItem) => (await accountTag(item.accountId)) + approvalText(item);

async function broadcast(text: string) {
  for (const admin of await superAdminChats()) await sendMessage(admin.chatId, text).catch(error => console.error("Story notice failed", telegramErrorDetails(error)));
}

/** New item → each Super Admin gets the video (or a link when >20 MB) with time, note and the approval buttons. */
async function sendApproval(item: StoryQueueItem) {
  const refs: TelegramRef[] = [];
  const text = await storyText(item), keyboard = approvalKeyboard(item.id, item.scheduledAt, item.accountId);
  for (const admin of await superAdminChats()) {
    try {
      if ((item.sizeBytes ?? 0) <= TELEGRAM_URL_VIDEO_LIMIT) {
        const sent = await sendVideo(admin.chatId, item.videoUrl, text, keyboard);
        refs.push({ chatId: String(sent.chat.id), messageId: sent.message_id, kind: "video" });
        continue;
      }
    } catch (error) { console.error("Story video send failed, sending a link", telegramErrorDetails(error)); }
    try {
      const sent = await sendMessage(admin.chatId, `${text}\n\n🎬 ${item.videoUrl}`, keyboard);
      refs.push({ chatId: String(sent.chat.id), messageId: sent.message_id, kind: "text" });
    } catch (error) { console.error("Story approval send failed", telegramErrorDetails(error)); }
  }
  if (refs.length) await getDb().storyQueueItem.update({ where: { id: item.id }, data: { telegramMessages: refs as unknown as Prisma.InputJsonValue } });
}

/** After a decision: the approval messages show the status and lose their buttons. */
async function refreshApprovalMessages(item: StoryQueueItem) {
  const refs = Array.isArray(item.telegramMessages) ? item.telegramMessages as unknown as TelegramRef[] : [];
  const text = await storyText(item);
  const keyboard = item.status === "PENDING_APPROVAL" ? approvalKeyboard(item.id, item.scheduledAt, item.accountId) : { inline_keyboard: [] };
  for (const ref of refs) {
    const edit = ref.kind === "video" ? editMessageCaption(ref.chatId, ref.messageId, text, keyboard) : editMessageText(ref.chatId, ref.messageId, `${text}\n\n🎬 ${item.videoUrl}`, keyboard);
    await edit.catch(() => undefined);
  }
}

export async function enqueueStory(input: { accountId: string; videoUrl: string; videoKey: string; scheduledAt: Date; caption: string | null; sizeBytes: number; info: VideoInfo }) {
  const item = await getDb().storyQueueItem.create({ data: { accountId: input.accountId, videoUrl: input.videoUrl, videoKey: input.videoKey, scheduledAt: input.scheduledAt, caption: input.caption, sizeBytes: input.sizeBytes, durationMs: input.info.durationMs, width: input.info.width, height: input.info.height } });
  await sendApproval(item).catch(error => console.error("Story approval failed", { type: safeType(error) }));
  return item;
}

type ChangeResult = { ok: true; item: StoryQueueItem } | { ok: false; error: string };
/** One status change, guarded by the current status (two clicks at once: the second one finds it already changed). */
async function change(id: string, action: StoryAction, data: Prisma.StoryQueueItemUpdateInput, who: Actor | { name: string }): Promise<ChangeResult> {
  const db = getDb();
  const item = await db.storyQueueItem.findUnique({ where: { id } });
  if (!item) return { ok: false, error: "Storis topilmadi." };
  const to = nextStatus(item.status as StoryStatus, action, item.attempts);
  if (!to) return { ok: false, error: `Bu holatda mumkin emas (${item.status}).` };
  const moved = await db.storyQueueItem.updateMany({ where: { id, status: item.status }, data: { ...data, status: to } as Prisma.StoryQueueItemUpdateManyMutationInput });
  if (moved.count !== 1) return { ok: false, error: "Holat allaqachon o‘zgargan." };
  const updated = (await db.storyQueueItem.findUnique({ where: { id } }))!;
  if ("id" in who) await writeAudit(who, { action: action.toUpperCase(), entityType: "STORY_QUEUE", entityId: id, summary: `Storis (${updated.scheduledAt.toISOString()}): ${item.status} → ${to}`, before: { status: item.status }, after: { status: to } }).catch(() => undefined);
  await refreshApprovalMessages(updated);
  return { ok: true, item: updated };
}

export const approveStory = (id: string, who: Actor | { name: string }) => change(id, "approve", { approvedAt: new Date(), approvedBy: who.name.slice(0, 120) }, who);
export const rejectStory = (id: string, who: Actor | { name: string }) => change(id, "reject", {}, who);
export const rescheduleStory = (id: string, scheduledAt: Date, actor: Actor) => change(id, "reschedule", { scheduledAt, attempts: 0, error: null, igContainerId: null, lockedUntil: null }, actor);

/** "✅ Hammasini tasdiqlash": every story of that Tashkent day (of that account, if given) still waiting for approval. */
export async function approveDay(day: string, who: Actor | { name: string }, accountId?: string) {
  const { start, end } = dayBounds(day);
  const items = await getDb().storyQueueItem.findMany({ where: { ...(accountId ? { accountId } : {}), status: "PENDING_APPROVAL", scheduledAt: { gte: start, lt: end } }, select: { id: true } });
  let approved = 0;
  for (const item of items) if ((await approveStory(item.id, who)).ok) approved++;
  return approved;
}

// ---- Cron: expire, check containers, publish due items ---------------------------------------------------

async function claim(id: string, status: "APPROVED" | "PUBLISHING") {
  const now = new Date();
  const result = await getDb().storyQueueItem.updateMany({ where: { id, status, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] }, data: { status: "PUBLISHING", lockedUntil: new Date(now.getTime() + LOCK_MS) } });
  return result.count === 1;
}

/** A failed attempt: back to APPROVED for the next run, or FAILED after the 3rd (1 + 2 retries) with a bot message. */
async function fail(item: StoryQueueItem, error: unknown) {
  const message = error instanceof StoryGraphError ? error.message : error instanceof Error ? error.name : "Xato";
  const attempts = item.attempts + 1, to = nextStatus("PUBLISHING", "failed", attempts)!;
  await getDb().storyQueueItem.update({ where: { id: item.id }, data: { status: to, attempts, error: message.slice(0, 500), igContainerId: null, lockedUntil: null } });
  if (to === "FAILED") await broadcast((await accountTag(item.accountId)) + failedText(message));
  return to;
}

async function publish(item: StoryQueueItem, containerId: string, target: PublishTarget | null) {
  const mediaId = await publishContainer(containerId, target);
  const publishedAt = new Date();
  await getDb().storyQueueItem.update({ where: { id: item.id }, data: { status: "PUBLISHED", igMediaId: mediaId, publishedAt, lockedUntil: null, error: null } });
  await broadcast((await accountTag(item.accountId)) + publishedText(publishedAt));
}

/**
 * Waits for one container (polling) until it is FINISHED, fails, or the run's time is up (the next run checks it again;
 * a container never finished turns EXPIRED on Instagram's side and then counts as a failed attempt).
 */
async function settle(item: StoryQueueItem, containerId: string, deadline: number, target: PublishTarget | null) {
  for (;;) {
    const { statusCode, status } = await containerStatus(containerId, target);
    const step = containerStep(statusCode);
    if (step === "publish") { await publish(item, containerId, target); return "published"; }
    if (step === "fail") { await fail(item, new StoryGraphError(200, undefined, `Container: ${statusCode}${status ? ` (${status})` : ""}`)); return "failed"; }
    if (Date.now() + 8_000 > deadline) { await getDb().storyQueueItem.update({ where: { id: item.id }, data: { lockedUntil: null } }); return "waiting"; }
    await new Promise(resolve => setTimeout(resolve, 6_000));
  }
}

export type StoryCronResult = { expired: number; published: number; failed: number; waiting: number };
/** Every 10 minutes (GitHub Actions → /api/cron/instagram-stories). Never throws for one item; one run at a time per item. */
export async function runStoryCron(budgetMs = 50_000): Promise<StoryCronResult> {
  const db = getDb(), now = new Date(), deadline = Date.now() + budgetMs;
  const result: StoryCronResult = { expired: 0, published: 0, failed: 0, waiting: 0 };
  const open = await db.storyQueueItem.findMany({ where: { status: { in: ["PENDING_APPROVAL", "APPROVED", "PUBLISHING"] }, scheduledAt: { lte: new Date(now.getTime() + 60_000) } }, orderBy: { scheduledAt: "asc" }, take: 50 });
  for (const item of open.filter(row => shouldExpire({ ...row, status: row.status as StoryStatus }, now))) {
    const moved = await db.storyQueueItem.updateMany({ where: { id: item.id, status: "PENDING_APPROVAL" }, data: { status: "EXPIRED" } });
    if (moved.count) { result.expired++; await refreshApprovalMessages({ ...item, status: "EXPIRED" }); }
  }
  const work = open.filter(row => needsContainerCheck({ ...row, status: row.status as StoryStatus }, now) || isDue({ ...row, status: row.status as StoryStatus }, now));
  for (const item of work) {
    if (Date.now() + 15_000 > deadline) break;
    const outcome = await processItem(item, deadline);
    if (outcome === "published") result.published++; else if (outcome === "failed") result.failed++; else if (outcome === "waiting") result.waiting++;
  }
  return result;
}

/** One item: claim it (no other run touches it), create the container if needed, wait for it, publish. Never throws. */
async function processItem(item: StoryQueueItem, deadline: number): Promise<"published" | "failed" | "waiting" | "busy" | "retry"> {
  const db = getDb();
  if (!await claim(item.id, item.status as "APPROVED" | "PUBLISHING")) return "busy";
  let containerId = item.igContainerId;
  try {
    const target = await targetFor(item.accountId);
    if (!containerId) {
      containerId = await createStoryContainer(item.videoUrl, target);
      await db.storyQueueItem.update({ where: { id: item.id }, data: { igContainerId: containerId } });
    }
    const fresh = (await db.storyQueueItem.findUnique({ where: { id: item.id } }))!;
    return await settle(fresh, containerId, deadline, target);
  } catch (error) {
    console.error("Story publish failed", { type: safeType(error), code: error instanceof StoryGraphError ? error.code : undefined });
    const status = await fail(item, error).catch(() => "FAILED");
    return status === "FAILED" ? "failed" : "retry";
  }
}

const NOW_TEXT: Record<string, string> = { published: "Joylandi ✓", failed: "Xato — 3 urinishdan keyin to‘xtadi (botga yozildi)", waiting: "Video Instagram’da tayyorlanmoqda — keyingi cron (10 daqiqa) joylaydi", busy: "Boshqa jarayon joylayapti", retry: "Xato — keyingi cron qayta urinadi" };
/** "Hozir joylash" (sinov, Super Admin): an APPROVED story goes out now instead of at its time. */
export async function publishNow(id: string, actor: Actor) {
  const db = getDb();
  const item = await db.storyQueueItem.findUnique({ where: { id } });
  if (!item) return { ok: false as const, error: "Storis topilmadi." };
  if (item.status !== "APPROVED") return { ok: false as const, error: "Faqat tasdiqlangan storisni hozir joylash mumkin." };
  const moved = await db.storyQueueItem.updateMany({ where: { id, status: "APPROVED" }, data: { scheduledAt: new Date() } });
  if (!moved.count) return { ok: false as const, error: "Holat allaqachon o‘zgargan." };
  await writeAudit(actor, { action: "PUBLISH_NOW", entityType: "STORY_QUEUE", entityId: id, summary: "Storisni hozir joylash (sinov)", before: { scheduledAt: item.scheduledAt.toISOString() } }).catch(() => undefined);
  const outcome = await processItem({ ...item, scheduledAt: new Date() }, Date.now() + 50_000);
  return outcome === "published" || outcome === "waiting" ? { ok: true as const, message: NOW_TEXT[outcome] } : { ok: false as const, error: NOW_TEXT[outcome] };
}
