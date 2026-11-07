import "server-only";
// Teplonasos bot (only the "global" account): calculation from the table, the Direct chat of threads started on a
// teplonasos post, the lead and the Telegram notice when a phone is left. Every other Direct stays unanswered.
import { setTimeout as sleep } from "node:timers/promises";
import type { HeatPumpThread, InstagramAccount } from "@/generated/prisma/client";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { getDb } from "@/lib/db";
import { expireDashboard } from "@/lib/referrals/tracking";
import { classifyHeatPumpComment, heatPumpChat, type AiUsage } from "./ai";
import { notifyDirectRecipients } from "./direct";
import { extractPhone } from "./direct-rules";
import { sendDirectMessage } from "./graph";
import { HUMAN_MUTE_MS, calcMessage, directBotStep, extractM2, heatPumpByKeywords, heatPumpFromAi, isBotEcho, isHeatPumpAccount, langOf, stripMentions, texts, threadIgsid, type HeatPumpComment, type Lang } from "./heat-pump";
import { randomGapMs, type MessageEvent } from "./rules";

const safeType = (error: unknown) => error instanceof Error ? error.name : "UnknownError";

/** The HISOB XABARI with the current table, buffer tank price and CBU rate (`rate` when the caller already has it). */
export async function buildCalc(m2: number, rate?: string | null, lang: Lang = "uz") {
  const db = getDb();
  const [rows, settings, cbu] = await Promise.all([
    db.heatPumpModel.findMany({ where: { isActive: true } }),
    db.siteSettings.findUnique({ where: { id: "global" }, select: { heatPumpBufferUsd: true, heatPumpBufferLiters: true } }),
    rate === undefined ? getUsdUzsRate().then(value => value?.rate ?? null).catch(() => null) : rate,
  ]);
  const models = rows.map(row => ({ ...row, hp: Number(row.hp), nominalKw: Number(row.nominalKw), winterKw: Number(row.winterKw), priceUsd: Number(row.priceUsd) }));
  return calcMessage(m2, models, cbu, { usd: Number(settings?.heatPumpBufferUsd ?? 145), liters: settings?.heatPumpBufferLiters ?? 60 }, lang);
}

/** Keywords first, then the AI; without the AI an unclear comment stays UNKNOWN (no reply). */
export async function classifyHeatPump(text: string): Promise<{ result: HeatPumpComment | null; by: string; usage: AiUsage }> {
  const keywords = heatPumpByKeywords(text);
  if (keywords) return { result: keywords, by: "KEYWORD", usage: { tokens: 0, costUsd: 0 } };
  const ai = await classifyHeatPumpComment(stripMentions(text) || text);
  return ai ? { result: heatPumpFromAi(ai), by: "AI", usage: ai.usage } : { result: null, by: "KEYWORD_FALLBACK", usage: { tokens: 0, costUsd: 0 } };
}

/** Marks the person's thread as teplonasos (before the comment DM goes out, so its echo counts as the bot's). */
export async function openThread(input: { accountId: string; igsid: string; mediaId: string; username: string | null; dm: string; m2: number | null; summary: string | null }) {
  const data = { username: input.username, lastBotText: input.dm, lastBotAt: new Date(), ...(input.m2 ? { m2: input.m2, model: input.summary } : {}) };
  return getDb().heatPumpThread.upsert({ where: { accountId_igsid: { accountId: input.accountId, igsid: input.igsid } }, create: { accountId: input.accountId, igsid: input.igsid, mediaId: input.mediaId, ...data }, update: data });
}

/**
 * After the Private Reply: the thread moves to the recipient_id Meta returned (the id Direct webhooks use); the comment
 * author's id stays only when the answer has none. A thread already under that id gets this one's data.
 */
export async function bindThread(threadId: string, accountId: string, fromId: string, sent: { recipient_id?: string; message_id?: string }) {
  const db = getDb(), igsid = threadIgsid(fromId, sent);
  const mid = sent.message_id ? { lastBotMid: sent.message_id } : {};
  if (igsid === fromId) return db.heatPumpThread.update({ where: { id: threadId }, data: mid });
  const other = await db.heatPumpThread.findUnique({ where: { accountId_igsid: { accountId, igsid } } });
  if (!other) return db.heatPumpThread.update({ where: { id: threadId }, data: { igsid, ...mid } });
  const moved = await db.heatPumpThread.delete({ where: { id: threadId } });
  return db.heatPumpThread.update({ where: { id: other.id }, data: { username: moved.username, m2: moved.m2 ?? other.m2, model: moved.model ?? other.model, leadId: other.leadId ?? moved.leadId, lastBotText: moved.lastBotText, lastBotAt: moved.lastBotAt, ...mid } });
}

/** One lead per person ("ighp:<igsid>"), kept up to date with m², model / price, phone. Returns its id. */
export async function upsertHeatPumpLead(thread: HeatPumpThread, account: InstagramAccount, comment?: string | null) {
  const db = getDb();
  const submissionKey = `ighp:${thread.igsid}`.slice(0, 100);
  const handle = thread.username ? `@${thread.username}` : `Instagram ${thread.igsid}`;
  const big = !!thread.model?.startsWith("Katta loyiha");
  const fields = { phone: thread.phone, dimensions: thread.m2 ? `${thread.m2} m²` : null, product: thread.model, notes: [`Instagram · teplonasos (@${account.username})`, comment ? `Komment: «${comment.slice(0, 500)}»` : "", `Instagram: ${thread.username ? `https://instagram.com/${thread.username}` : handle}`, thread.m2 ? `Maydon: ${thread.m2} m²` : "Maydon: so‘ralgan", thread.model ? `Hisob: ${thread.model}` : "", big ? "⚠️ Katta loyiha" : "", thread.phone ? `Telefon: ${thread.phone}` : ""].filter(Boolean).join("\n") };
  const existing = await db.lead.findUnique({ where: { submissionKey }, select: { id: true } });
  if (existing) {
    await db.lead.update({ where: { id: existing.id }, data: fields });
    return existing.id;
  }
  const created = await db.lead.createManyAndReturn({ data: [{ submissionKey, customerName: handle, requestType: "Instagram · teplonasos", source: "INSTAGRAM", instagramAccountId: account.id, ...fields }], skipDuplicates: true, select: { id: true } });
  const row = created[0];
  if (!row) return (await db.lead.findUnique({ where: { submissionKey }, select: { id: true } }))?.id ?? null;
  await db.leadActivity.create({ data: { leadId: row.id, type: "LEAD_CREATED" } });
  try { expireDashboard(); } catch { /* outside a request scope */ }
  const { publishLeadToTelegram } = await import("@/lib/telegram/service");
  await publishLeadToTelegram(row.id);
  return row.id;
}

async function saveLead(thread: HeatPumpThread, account: InstagramAccount) {
  if (!account.leadsEnabled) return;
  const leadId = await upsertHeatPumpLead(thread, account);
  if (leadId && leadId !== thread.leadId) await getDb().heatPumpThread.update({ where: { id: thread.id }, data: { leadId } });
}

/**
 * Direct events of the "global" account: a person's echo in a teplonasos thread mutes the bot there for 24 h; a
 * customer's text gets one bot answer (m² → HISOB XABARI, phone → lead + Telegram + thanks, else a short AI answer).
 * Threads not started on a teplonasos post, and every other account, are never answered. Never throws.
 */
export async function handleHeatPumpDirect(events: MessageEvent[], account: InstagramAccount, token: string | null) {
  if (!isHeatPumpAccount(account.id) || !token) return;
  const db = getDb();
  for (const event of events) {
    try {
      const echo = event.isEcho || event.fromId === account.igUserId;
      const igsid = echo ? event.recipientId : event.fromId;
      if (!igsid || igsid === account.igUserId) continue;
      const thread = await db.heatPumpThread.findUnique({ where: { accountId_igsid: { accountId: account.id, igsid } } });
      if (!thread) continue;
      if (echo) {
        if (!isBotEcho(event, thread)) await db.heatPumpThread.update({ where: { id: thread.id }, data: { mutedUntil: new Date(event.time.getTime() + HUMAN_MUTE_MS) } });
        continue;
      }
      if (event.text?.trim()) await answer(thread, event, account, token);
    } catch (error) { console.error("Instagram heat pump Direct failed", { type: safeType(error) }); }
  }
}

async function answer(thread: HeatPumpThread, event: MessageEvent, account: InstagramAccount, token: string) {
  const db = getDb(), text = event.text!.trim();
  // The customer's language; a message without letters ("150") keeps the language of our last message.
  const lang = langOf(text, thread.lastBotText), t = texts(lang);
  const phone = extractPhone(text);
  if (phone) {
    thread = await db.heatPumpThread.update({ where: { id: thread.id }, data: { phone } });
    await saveLead(thread, account);
    await notifyDirectRecipients(account, ["🔥 Teplonasos: telefon qoldirdi", thread.username ? `@${thread.username}` : `Instagram ${thread.igsid}`, `m²: ${thread.m2 ?? "—"}`, `Model: ${thread.model ?? "—"}`, `Telefon: ${phone}`].join("\n"));
  }
  const step = directBotStep(thread);
  if (step === "silent") return;
  // One answer per incoming message, also when Meta delivers the webhook twice.
  const claimed = await db.heatPumpThread.updateMany({ where: { id: thread.id, botReplies: thread.botReplies, OR: [{ lastInMid: null }, { lastInMid: { not: event.mid } }] }, data: { botReplies: { increment: 1 }, lastInMid: event.mid } });
  if (claimed.count !== 1) return;

  let reply: string | null = step === "limit" ? t.limit : phone ? t.thanks : null;
  if (!reply) {
    let m2 = extractM2(text);
    if (!m2) {
      const ai = await heatPumpChat(text, thread.lastBotText);
      m2 = ai?.m2 && ai.m2 >= 20 && ai.m2 <= 3000 ? Math.round(ai.m2) : null;
      reply = ai?.reply || null;
    }
    if (m2) {
      const calc = await buildCalc(m2, undefined, lang);
      reply = calc.text;
      thread = await db.heatPumpThread.update({ where: { id: thread.id }, data: { m2, model: calc.summary } });
      await saveLead(thread, account);
    }
  }
  if (!reply) return;
  await sleep(randomGapMs());
  // Saved before sending: the echo may arrive before the API call returns.
  await db.heatPumpThread.update({ where: { id: thread.id }, data: { lastBotText: reply.slice(0, 1000), lastBotAt: new Date() } });
  const sent = await sendDirectMessage(token, account.igUserId, thread.igsid, reply.slice(0, 1000));
  if (sent.message_id) await db.heatPumpThread.update({ where: { id: thread.id }, data: { lastBotMid: sent.message_id } });
}
