import "server-only";
// Teplonasos bot (only the "global" account): calculation from the table, the Direct chat of threads started on a
// teplonasos post, the lead and the Telegram notice when a phone is left. Every other Direct stays unanswered.
import { setTimeout as sleep } from "node:timers/promises";
import type { HeatPumpThread, InstagramAccount } from "@/generated/prisma/client";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { getDb } from "@/lib/db";
import { expireDashboard } from "@/lib/referrals/tracking";
import { classifyHeatPumpComment, heatPumpChat, understandHeatPumpComment, type AiUsage, type ChatTurn } from "./ai";
import { sendMessage } from "@/lib/telegram/client";
import type { InlineKeyboard, TelegramMessage } from "@/lib/telegram/types";
import { directLink, extractPhone } from "./direct-rules";
import { sendDirectMessage, sendSenderAction } from "./graph";
import { HUMAN_MUTE_MS, backlogText, calcKwMessage, calcMessage, directValues, powerText, heatPumpFromAiReply, hpPriceLine, inventedMoney, specialistNotice, specialistReply, deliverPrivate, isHeatPumpContact, m2List, directBotStep, heatPumpByKeywords, heatPumpFromAi, isBotEcho, isHeatPumpAccount, langOf, stripMentions, texts, threadIgsid, type CalcStyle, type HeatPumpComment, type Lang } from "./heat-pump";
import type { MessageEvent } from "./rules";
import { coolerTexts, coolerTurn, kitPrice, type CoolerKitRow } from "./cooler";
import { DEFAULT_MARKUP, clampMarkup } from "@/lib/prays/rules";

const safeType = (error: unknown) => error instanceof Error ? error.name : "UnknownError";

/** The private chat of +998 91 637 77 77: env HEATPUMP_TELEGRAM_CHAT_ID, else the one bound in the bot; null = none. */
export async function heatPumpChatId() {
  const env = process.env.HEATPUMP_TELEGRAM_CHAT_ID?.trim();
  if (env) return env;
  const row = await getDb().telegramChatBinding.findUnique({ where: { key: "heatpump" }, select: { chatId: true } }).catch(error => { console.error("Teplonasos chat_id o‘qilmadi", { type: safeType(error) }); return null; });
  return row?.chatId ?? null;
}
/** Every teplonasos Telegram message (lead, phone, Direct card, reminder, negative comment) goes through here. */
export const sendHeatPumpTelegram = async (text: string, keyboard?: InlineKeyboard) => deliverPrivate(await heatPumpChatId(), chatId => sendMessage(chatId, text, keyboard));

/** "/start teplonasos" → the contact button; only the own contact of +998 91 637 77 77 binds this chat. */
export async function handleHeatPumpBinding(message: TelegramMessage) {
  if (message.chat.type !== "private" || !message.from) return false;
  const chatId = String(message.chat.id);
  if (/^\/start\s+(?:teplonasos|heatpump)\b/i.test(message.text?.trim() ?? "")) {
    await sendMessage(chatId, "Teplonasos lidlarini shu chatga olish uchun raqamingizni ulashing 👇", { keyboard: [[{ text: "📱 Raqamni ulashish", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true });
    return true;
  }
  if (!message.contact) return false;
  if (!isHeatPumpContact(message.contact, message.from.id)) {
    console.warn("Teplonasos Telegram: boshqa raqam rad etildi", { chatId });
    await sendMessage(chatId, "Bu raqam teplonasos lidlari uchun qabul qilinmaydi.", { remove_keyboard: true });
    return true;
  }
  await getDb().telegramChatBinding.upsert({ where: { key: "heatpump" }, create: { key: "heatpump", chatId, phone: message.contact.phone_number }, update: { chatId, phone: message.contact.phone_number } });
  await sendMessage(chatId, "✅ Teplonasos lidlari endi shu chatga keladi.", { remove_keyboard: true });
  await flushHeatPumpBacklog().catch(error => console.error("Teplonasos backlog failed", { type: safeType(error) }));
  return true;
}

/** Right after linking: every teplonasos lead that was not sent (no chat / errors) goes in one message. */
export async function flushHeatPumpBacklog() {
  const db = getDb();
  const leads = await db.lead.findMany({ where: { submissionKey: { startsWith: "ighp:" }, telegramNotificationStatus: "FAILED" }, orderBy: { createdAt: "asc" }, take: 200, select: { id: true, customerName: true, dimensions: true, product: true, phone: true } });
  if (!leads.length) return 0;
  const message = await sendHeatPumpTelegram(backlogText(leads));
  if (message) await db.lead.updateMany({ where: { id: { in: leads.map(lead => lead.id) } }, data: { telegramNotificationStatus: "PUBLISHED", telegramChatId: String(message.chat.id), telegramMessageId: message.message_id, telegramPublishedAt: new Date(), telegramPublishFailedAt: null } });
  return message ? leads.length : 0;
}

/** The HISOB XABARI with the current table, buffer tank price and CBU rate (`rate` when the caller already has it). */
const loadModels = async () => (await getDb().heatPumpModel.findMany({ where: { isActive: true } })).map(row => ({ ...row, hp: Number(row.hp), nominalKw: Number(row.nominalKw), winterKw: Number(row.winterKw), priceUsd: Number(row.priceUsd) }));

/** The last ~10 messages of the person's Direct chat (without the one being answered), oldest first. */
async function chatHistory(accountId: string, igsid: string, mid: string): Promise<ChatTurn[]> {
  const rows = await getDb().instagramMessage.findMany({ where: { accountId, mid: { not: mid }, text: { not: null }, OR: [{ fromId: igsid }, { toId: igsid }] }, orderBy: { sentAt: "desc" }, take: 10, select: { fromId: true, text: true } });
  return rows.reverse().map(row => ({ role: row.fromId === igsid ? "user" : "assistant", text: row.text! }));
}

/** The AI's Direct text names a $ / so'm / mln sum that is not one of the table / buffer tank sums (CBU rate). */
async function priceInvented(text: string) {
  if (!/\$|so'?m|сум|сўм|mln|млн|usd|dollar|доллар/iu.test(text)) return false;
  const [models, settings, rate] = await Promise.all([loadModels(), getDb().siteSettings.findUnique({ where: { id: "global" }, select: { heatPumpBufferUsd: true } }), getUsdUzsRate().then(value => value?.rate ?? null).catch(() => null)]);
  return inventedMoney(text, [...models.map(model => model.priceUsd), Number(settings?.heatPumpBufferUsd ?? 145)], rate);
}

/** Telegram "Mutaxassis javobi kerak" (teplonasos private chat) and the mark on the lead. */
async function needSpecialist(thread: HeatPumpThread, account: InstagramAccount, question: string) {
  await sendHeatPumpTelegram(specialistNotice({ username: thread.username, igsid: thread.igsid, question, calc: thread.model ?? (thread.m2 ? `${thread.m2} m²` : null), link: directLink(thread.username) }));
  await saveLead(thread, account).catch(error => console.error("Instagram heat pump lead failed", { type: safeType(error) }));
  const leadId = (await getDb().heatPumpThread.findUnique({ where: { id: thread.id }, select: { leadId: true } }))?.leadId;
  if (leadId) await getDb().lead.update({ where: { id: leadId }, data: { managerNote: `⚠️ Mutaxassis javobi kerak: «${question.slice(0, 300)}»` } });
}

export async function buildCalc(m2: number, rate?: string | null, lang: Lang = "uz", kw?: number | null, style: CalcStyle = {}) {
  const db = getDb();
  const [models, settings, cbu] = await Promise.all([
    loadModels(),
    db.siteSettings.findUnique({ where: { id: "global" }, select: { heatPumpBufferUsd: true, heatPumpBufferLiters: true } }),
    rate === undefined ? getUsdUzsRate().then(value => value?.rate ?? null).catch(() => null) : rate,
  ]);
  const buffer = { usd: Number(settings?.heatPumpBufferUsd ?? 145), liters: settings?.heatPumpBufferLiters ?? 60 };
  return kw ? calcKwMessage(kw, models, cbu, buffer, lang, style) : calcMessage(m2, models, cbu, buffer, lang, style);
}

/** Admin switch "AI javob" (SiteSettings.heatPumpAi, on by default). */
export const heatPumpAiEnabled = async () => (await getDb().siteSettings.findUnique({ where: { id: "global" }, select: { heatPumpAi: true } }).catch(() => null))?.heatPumpAi ?? true;

type Classified = { result: HeatPumpComment | null; by: string; usage: AiUsage; reply?: string; extra?: string; lang?: Lang; specialist?: boolean };

/**
 * AI on: the AI understands first (with the person's earlier comments on the post); when it fails the keyword parser
 * decides, so nothing stays unanswered. AI off: keywords first, then the old AI classifier.
 */
export async function classifyHeatPump(text: string, history: readonly string[] = [], aiFirst = false): Promise<Classified> {
  if (aiFirst) {
    const understood = await understandHeatPumpComment(stripMentions(text) || text, history);
    if (understood) {
      const mapped = heatPumpFromAiReply(understood.ai, text);
      return { result: mapped.result, by: mapped.tag, usage: understood.usage, reply: mapped.reply, extra: mapped.extra, lang: mapped.lang, specialist: mapped.specialist };
    }
    return { result: heatPumpByKeywords(text), by: "KEYWORD_FALLBACK", usage: { tokens: 0, costUsd: 0 } };
  }
  const keywords = heatPumpByKeywords(text);
  if (keywords) return { result: keywords, by: "KEYWORD", usage: { tokens: 0, costUsd: 0 } };
  const ai = await classifyHeatPumpComment(stripMentions(text) || text);
  return ai ? { result: heatPumpFromAi(ai), by: "AI", usage: ai.usage } : { result: null, by: "KEYWORD_FALLBACK", usage: { tokens: 0, costUsd: 0 } };
}

/**
 * Marks the person's thread as teplonasos, or (with `tons`) starts the xolodilnik chat over, before the comment DM goes
 * out, so its echo counts as the bot's.
 */
export async function openThread(input: { accountId: string; igsid: string; mediaId: string; username: string | null; dm: string; m2: number | null; summary: string | null; tons?: number }) {
  const flow = input.tons ? { flow: "cooler", tons: input.tons, step: "chambers", chambers: null, region: null, misses: 0, botReplies: 0, model: null, m2: null } : { flow: "heat" };
  const data = { username: input.username, lastBotText: input.dm, lastBotAt: new Date(), mediaId: input.mediaId, ...flow, ...(input.m2 ? { m2: input.m2 } : {}), ...(input.summary ? { model: input.summary } : {}) };
  return getDb().heatPumpThread.upsert({ where: { accountId_igsid: { accountId: input.accountId, igsid: input.igsid } }, create: { accountId: input.accountId, igsid: input.igsid, ...data }, update: data });
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
  return db.heatPumpThread.update({ where: { id: other.id }, data: { username: moved.username, flow: moved.flow, tons: moved.tons, step: moved.step, chambers: moved.chambers, region: moved.region, misses: moved.misses, botReplies: moved.flow === "cooler" ? moved.botReplies : other.botReplies, m2: moved.m2 ?? other.m2, model: moved.model ?? other.model, leadId: other.leadId ?? moved.leadId, lastBotText: moved.lastBotText, lastBotAt: moved.lastBotAt, ...mid } });
}

/** One lead per person ("ighp:<igsid>"), kept up to date with every m² ("450, 200 m²"), the last model / price, phone. Returns its id. */
export async function upsertHeatPumpLead(thread: HeatPumpThread, account: InstagramAccount, comment?: string | null) {
  const db = getDb();
  const submissionKey = `ighp:${thread.igsid}`.slice(0, 100);
  const handle = thread.username ? `@${thread.username}` : `Instagram ${thread.igsid}`;
  const big = !!thread.model?.startsWith("Katta loyiha");
  const existing = await db.lead.findUnique({ where: { submissionKey }, select: { id: true, dimensions: true } });
  const dimensions = m2List(existing?.dimensions, thread.m2);
  const fields = { phone: thread.phone, dimensions, product: thread.model, notes: [`Instagram · teplonasos (@${account.username})`, comment ? `Komment: «${comment.slice(0, 500)}»` : "", `Instagram: ${thread.username ? `https://instagram.com/${thread.username}` : handle}`, dimensions ? `Maydon: ${dimensions}` : "Maydon: so‘ralgan", thread.model ? `Hisob: ${thread.model}` : "", big ? "⚠️ Katta loyiha" : "", thread.phone ? `Telefon: ${thread.phone}` : ""].filter(Boolean).join("\n") };
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
  const db = getDb(), text = event.text!.trim(), cooler = thread.flow === "cooler";
  // The customer's language; a message without letters ("150") keeps the language of our last message.
  const lang = langOf(text, thread.lastBotText), t = texts(lang);
  // Xolodilnik: the phone is handled by its own turn (lead → the Instagram admins).
  const phone = cooler ? null : extractPhone(text);
  if (phone) {
    thread = await db.heatPumpThread.update({ where: { id: thread.id }, data: { phone } });
    await saveLead(thread, account);
    await sendHeatPumpTelegram(["🔥 Teplonasos: telefon qoldirdi", thread.username ? `@${thread.username}` : `Instagram ${thread.igsid}`, `m²: ${thread.m2 ?? "—"}`, `Model: ${thread.model ?? "—"}`, `Telefon: ${phone}`].join("\n"));
  }
  const step = directBotStep(thread);
  if (step === "silent") return;
  // One answer per incoming message, also when Meta delivers the webhook twice.
  const claimed = await db.heatPumpThread.updateMany({ where: { id: thread.id, botReplies: thread.botReplies, OR: [{ lastInMid: null }, { lastInMid: { not: event.mid } }] }, data: { botReplies: { increment: 1 }, lastInMid: event.mid } });
  if (claimed.count !== 1) return;
  // Real time: the customer sees "seen" and "typing…" at once; the answer goes 2–4 s after the message at the earliest.
  const started = Date.now();
  for (const action of ["mark_seen", "typing_on"] as const) await sendSenderAction(token, account.igUserId, thread.igsid, action).catch(() => undefined);

  let reply: string | null = cooler ? await coolerReply(thread, text, step, lang, account) : step === "limit" ? t.limit : phone ? t.thanks : null;
  if (!reply && !cooler) {
    // AI on: the AI reads the message (with the last ~10 messages) first, the parser fills in what it missed; off: the parser first.
    const aiOn = await heatPumpAiEnabled();
    const quick = aiOn ? null : directValues(text, null), hit = !!quick && Object.values(quick).some(Boolean);
    const ai = hit ? null : await heatPumpChat(text, aiOn ? await chatHistory(account.id, thread.igsid, event.mid) : thread.lastBotText);
    const values = hit ? quick! : directValues(text, ai), { m2, kw } = values;
    // Only the chat's first message greets.
    reply = (thread.lastBotText ? ai?.reply.replace(/^\s*(?:assalomu alaykum|ассалому алайкум|здравствуйте)[\s!,.]*/iu, "") : ai?.reply) || null;
    console.info("Instagram heat pump Direct", { m2, kw, hp: ai?.hp ?? null, specialist: !!ai?.specialist, by: ai ? "AI" : "PARSER" });
    if (values.absurd) reply = t.joke;
    else if (values.clarify) reply = t.clarify(values.clarify);
    else if (values.power) reply = powerText(values.power, lang);
    else if (m2 || kw) {
      // The AI note, phones and "leave your phone" go only with the first calculation.
      const calc = await buildCalc(m2 ?? 0, undefined, lang, kw, { hello: !thread.lastBotText, footer: !thread.model });
      reply = calc.text;
      thread = await db.heatPumpThread.update({ where: { id: thread.id }, data: { ...(m2 ? { m2 } : {}), model: calc.summary } });
      await saveLead(thread, account);
    } else if (ai?.specialist || (ai?.reply && await priceInvented(ai.reply))) {
      // Not in the knowledge base (fan-coil / montaj price, another brand…): nothing invented, the specialist is told.
      reply = specialistReply(ai.reply, lang);
      await needSpecialist(thread, account, text);
    } else if (ai?.hp) {
      const [models, rate] = await Promise.all([loadModels(), getUsdUzsRate().then(value => value?.rate ?? null).catch(() => null)]);
      const line = hpPriceLine(ai.hp, models, rate, lang);
      reply = line ? [reply, line].filter(Boolean).join("\n") : specialistReply(null, lang);
      if (!line) await needSpecialist(thread, account, text);
    }
  }
  if (!reply) return;
  await sleep(Math.max(0, 2_000 + Math.random() * 2_000 - (Date.now() - started)));
  // Saved before sending: the echo may arrive before the API call returns.
  await db.heatPumpThread.update({ where: { id: thread.id }, data: { lastBotText: reply.slice(0, 1000), lastBotAt: new Date() } });
  const sent = await sendDirectMessage(token, account.igUserId, thread.igsid, reply.slice(0, 1000));
  if (sent.message_id) await db.heatPumpThread.update({ where: { id: thread.id }, data: { lastBotMid: sent.message_id } });
}

// ---- Xolodilnik (same thread, claim, limit and mute as teplonasos) ----------------------------------------

async function loadCooler(lang: Lang) {
  const db = getDb();
  const num = (value: { toString(): string } | null) => value === null ? null : Number(value.toString());
  const [kits, settings] = await Promise.all([db.coolerKit.findMany({ include: { product: { select: { basePriceUsd: true, priceUsd: true, archivedAt: true } } } }), db.siteSettings.findUnique({ where: { id: "global" }, select: { coolerTexts: true, priceMarkupPercent: true } })]);
  const markup = clampMarkup(settings?.priceMarkupPercent ?? DEFAULT_MARKUP) ?? DEFAULT_MARKUP;
  const rows: CoolerKitRow[] = kits.map(kit => ({ ...kit, priceUsd: kitPrice({ priceUsd: num(kit.priceUsd) }, kit.product && { basePriceUsd: num(kit.product.basePriceUsd), priceUsd: num(kit.product.priceUsd), archivedAt: kit.product.archivedAt }, markup) }));
  return { kits: rows, texts: coolerTexts(settings?.coolerTexts)[lang] };
}
/** The comment's public reply and first DM texts (admin-edited), in the comment's language. */
export const coolerCommentTexts = async (lang: Lang) => (await loadCooler(lang)).texts;

/** One turn of the xolodilnik chat; the 6th bot message is the handoff, then silence. Saves the state and the lead. */
async function coolerReply(thread: HeatPumpThread, text: string, step: "reply" | "limit", lang: Lang, account: InstagramAccount) {
  if (thread.step !== "chambers" && thread.step !== "contact") return null;
  const [{ kits, texts: t }, rate] = await Promise.all([loadCooler(lang), getUsdUzsRate().then(value => value?.rate ?? null).catch(() => null)]);
  const turn = step === "limit" ? { reply: t.handoff, data: { step: "handoff" }, lead: true, handoff: true } : coolerTurn(thread, text, kits, t, rate, lang);
  thread = await getDb().heatPumpThread.update({ where: { id: thread.id }, data: turn.data });
  if (turn.lead && account.leadsEnabled) await saveCoolerLead(thread, account, !!turn.handoff).catch(error => console.error("Instagram cooler lead failed", { type: safeType(error) }));
  return turn.reply;
}

/** One lead per person ("igcool:<igsid>"), source "Reels komment"; new → Telegram (publishLeadToTelegram), later phone → a notice. */
async function saveCoolerLead(thread: HeatPumpThread, account: InstagramAccount, handoff: boolean) {
  const db = getDb(), submissionKey = `igcool:${thread.igsid}`.slice(0, 100);
  const handle = thread.username ? `@${thread.username}` : `Instagram ${thread.igsid}`;
  const fields = { phone: thread.phone, region: thread.region, capacity: thread.tons ? `${thread.tons} t` : null, dimensions: thread.chambers ? `${thread.chambers} ta kamera` : null, product: thread.model, notes: [`Instagram · xolodilnik (@${account.username}) · Reels komment`, `Instagram: ${thread.username ? `https://instagram.com/${thread.username}` : handle}`, `Tonna: ${thread.tons ?? "—"}`, `Kamera: ${thread.chambers ?? "—"}`, thread.model ? `Komplekt: ${thread.model}` : "", `Viloyat: ${thread.region ?? "—"}`, thread.phone ? `Telefon: ${thread.phone}` : "", handoff ? "⚠️ Bot tushunmadi — sotuvchi Direct’da yozsin" : ""].filter(Boolean).join("\n") };
  const existing = await db.lead.findUnique({ where: { submissionKey }, select: { id: true } });
  let leadId = existing?.id ?? null;
  if (existing) {
    await db.lead.update({ where: { id: existing.id }, data: fields });
    const { notifyInstagramAdmins } = await import("./direct");
    await notifyInstagramAdmins(account, [handoff ? "❄️ Xolodilnik: sotuvchi yozsin" : "❄️ Xolodilnik: telefon qoldirdi", handle, `Tonna: ${thread.tons ?? "—"} · Kamera: ${thread.chambers ?? "—"}`, `Komplekt: ${thread.model ?? "—"}`, `Viloyat: ${thread.region ?? "—"}`, `Telefon: ${thread.phone ?? "—"}`].join("\n"));
  } else {
    const created = await db.lead.createManyAndReturn({ data: [{ submissionKey, customerName: handle, requestType: "Reels komment", source: "INSTAGRAM", instagramAccountId: account.id, ...fields }], skipDuplicates: true, select: { id: true } });
    leadId = created[0]?.id ?? null;
    if (leadId) {
      await db.leadActivity.create({ data: { leadId, type: "LEAD_CREATED" } });
      try { expireDashboard(); } catch { /* outside a request scope */ }
      const { publishLeadToTelegram } = await import("@/lib/telegram/service");
      await publishLeadToTelegram(leadId);
    }
  }
  if (leadId && leadId !== thread.leadId) await db.heatPumpThread.update({ where: { id: thread.id }, data: { leadId } });
}
