import "server-only";
// Xolodilnik bot: the Direct chat of threads started on a xolodilnik post comment, the lead (published to the BK bot's
// seller group) when a phone is left or the seller has to take over.
import { setTimeout as sleep } from "node:timers/promises";
import type { CoolerThread, InstagramAccount } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { expireDashboard } from "@/lib/referrals/tracking";
import { coolerTexts, coolerTurn, type CoolerKitRow } from "./cooler";
import { sendDirectMessage } from "./graph";
import { HUMAN_MUTE_MS, isBotEcho, threadIgsid } from "./heat-pump";
import { randomGapMs, type MessageEvent } from "./rules";

const safeType = (error: unknown) => error instanceof Error ? error.name : "UnknownError";

export const loadCoolerTexts = async () => coolerTexts((await getDb().siteSettings.findUnique({ where: { id: "global" }, select: { coolerTexts: true } }))?.coolerTexts);
export const loadCoolerKits = async (): Promise<CoolerKitRow[]> => (await getDb().coolerKit.findMany({ orderBy: { minTons: "asc" } })).map(kit => ({ ...kit, priceUsd: kit.priceUsd === null ? null : Number(kit.priceUsd) }));

/** The person's chat starts over for this comment (before the DM goes out, so its echo counts as the bot's). */
export function openCoolerThread(input: { accountId: string; igsid: string; commentId: string; mediaId: string; username: string | null; tons: number; dm: string }) {
  const data = { commentId: input.commentId, mediaId: input.mediaId, username: input.username, tons: input.tons, step: "chambers", chambers: null, kit: null, region: null, phone: null, misses: 0, leadId: null, lastBotText: input.dm, lastBotAt: new Date(), lastBotMid: null, lastInMid: null, mutedUntil: null };
  return getDb().coolerThread.upsert({ where: { accountId_igsid: { accountId: input.accountId, igsid: input.igsid } }, create: { accountId: input.accountId, igsid: input.igsid, ...data }, update: data });
}

/** After the Private Reply: the thread moves to the recipient_id Meta returned (an older thread under that id is replaced). */
export async function bindCoolerThread(thread: CoolerThread, sent: { recipient_id?: string; message_id?: string }) {
  const db = getDb(), igsid = threadIgsid(thread.igsid, sent);
  const mid = sent.message_id ? { lastBotMid: sent.message_id } : {};
  if (igsid !== thread.igsid) await db.coolerThread.deleteMany({ where: { accountId: thread.accountId, igsid } });
  return db.coolerThread.update({ where: { id: thread.id }, data: { igsid, ...mid } });
}

/** One lead per comment ("igcool:<commentId>"), source "Reels komment"; a new one goes to the seller group. */
async function upsertCoolerLead(thread: CoolerThread, account: InstagramAccount, handoff: boolean) {
  const db = getDb(), submissionKey = `igcool:${thread.commentId}`.slice(0, 100);
  const handle = thread.username ? `@${thread.username}` : `Instagram ${thread.igsid}`;
  const fields = { phone: thread.phone, region: thread.region, capacity: `${thread.tons} t`, dimensions: thread.chambers ? `${thread.chambers} ta kamera` : null, product: thread.kit, notes: [`Instagram · xolodilnik (@${account.username}) · Reels komment`, `Instagram: ${thread.username ? `https://instagram.com/${thread.username}` : handle}`, `Tonna: ${thread.tons}`, `Kamera: ${thread.chambers ?? "—"}`, thread.kit ? `Komplekt: ${thread.kit}` : "", `Viloyat: ${thread.region ?? "—"}`, thread.phone ? `Telefon: ${thread.phone}` : "", handoff ? "⚠️ Bot tushunmadi — sotuvchi Direct’da yozsin" : ""].filter(Boolean).join("\n") };
  const existing = await db.lead.findUnique({ where: { submissionKey }, select: { id: true } });
  if (existing) { await db.lead.update({ where: { id: existing.id }, data: fields }); return existing.id; }
  const created = await db.lead.createManyAndReturn({ data: [{ submissionKey, customerName: handle, requestType: "Reels komment", source: "INSTAGRAM", instagramAccountId: account.id, ...fields }], skipDuplicates: true, select: { id: true } });
  const row = created[0];
  if (!row) return (await db.lead.findUnique({ where: { submissionKey }, select: { id: true } }))?.id ?? null;
  await db.leadActivity.create({ data: { leadId: row.id, type: "LEAD_CREATED" } });
  try { expireDashboard(); } catch { /* outside a request scope */ }
  const { publishLeadToTelegram } = await import("@/lib/telegram/service");
  await publishLeadToTelegram(row.id);
  return row.id;
}

/** Direct events: a person's echo mutes the bot for 24 h; a customer's text in an open xolodilnik thread gets one turn. Never throws. */
export async function handleCoolerDirect(events: MessageEvent[], account: InstagramAccount, token: string | null) {
  if (!token) return;
  const db = getDb();
  for (const event of events) {
    try {
      const echo = event.isEcho || event.fromId === account.igUserId;
      const igsid = echo ? event.recipientId : event.fromId;
      if (!igsid || igsid === account.igUserId) continue;
      const thread = await db.coolerThread.findUnique({ where: { accountId_igsid: { accountId: account.id, igsid } } });
      if (!thread) continue;
      if (echo) {
        if (!isBotEcho(event, thread)) await db.coolerThread.update({ where: { id: thread.id }, data: { mutedUntil: new Date(event.time.getTime() + HUMAN_MUTE_MS) } });
        continue;
      }
      if (event.text?.trim() && (!thread.mutedUntil || thread.mutedUntil < new Date())) await answer(thread, event, account, token);
    } catch (error) { console.error("Instagram cooler Direct failed", { type: safeType(error) }); }
  }
}

async function answer(thread: CoolerThread, event: MessageEvent, account: InstagramAccount, token: string) {
  if (thread.step !== "chambers" && thread.step !== "contact") return;
  const db = getDb();
  // One turn per incoming message, also when Meta delivers the webhook twice.
  const claimed = await db.coolerThread.updateMany({ where: { id: thread.id, step: thread.step, misses: thread.misses, OR: [{ lastInMid: null }, { lastInMid: { not: event.mid } }] }, data: { lastInMid: event.mid } });
  if (claimed.count !== 1) return;
  const [kits, texts] = await Promise.all([loadCoolerKits(), loadCoolerTexts()]);
  const turn = coolerTurn(thread, event.text!.trim(), kits, texts);
  thread = await db.coolerThread.update({ where: { id: thread.id }, data: turn.data });
  if ((turn.lead || turn.handoff) && account.leadsEnabled) {
    const leadId = await upsertCoolerLead(thread, account, !!turn.handoff).catch(error => { console.error("Instagram cooler lead failed", { type: safeType(error) }); return null; });
    if (leadId) await db.coolerThread.update({ where: { id: thread.id }, data: { leadId } });
  }
  if (!turn.reply) return;
  await sleep(randomGapMs());
  const reply = turn.reply.slice(0, 1000);
  // Saved before sending: the echo may arrive before the API call returns.
  await db.coolerThread.update({ where: { id: thread.id }, data: { lastBotText: reply, lastBotAt: new Date() } });
  const sent = await sendDirectMessage(token, account.igUserId, thread.igsid, reply);
  if (sent.message_id) await db.coolerThread.update({ where: { id: thread.id }, data: { lastBotMid: sent.message_id } });
}
