// "BK Kassa" Telegram bot: message → KassaDraft → (Super Admin ✓) → KassaEntry. Telegram, OpenAI and the database come in
// as `deps`, so tests/kassa-bot.test.mjs runs it with mocks; lib/kassa/bot.ts wires the real ones.
import { timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { money, type Currency, type EntryInput, type EntryType } from "./rules";

export const FLAGS = { CURRENCY_UNCLEAR: "Valyuta aniq emas", AMOUNT_MISSING: "Summa yo‘q", CATEGORY_UNKNOWN: "Kategoriya topilmadi", TYPE_UNCLEAR: "Kirim yoki chiqim aniq emas" } as const;
export type Flag = keyof typeof FLAGS;
export type AiDraft = { type: EntryType | null; amount: number | null; currency: Currency | null; categoryName: string | null; note: string; flags: string[] };
type Category = { id: string; name: string; type: EntryType };
type Draft = { id: string; status: string; type: EntryType | null; amount: unknown; currency: Currency | null; categoryId: string | null; paymentType: EntryInput["paymentType"]; note: string; flags: string[]; occurredAt: Date; rawText: string; transcript: string | null; tgChatId: string; tgReplyMessageId: number | null };
type TgMessage = { message_id: number; date: number; chat: { id: number }; from?: { id: number }; text?: string; voice?: { file_id: string }; reply_to_message?: { message_id: number } };
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: { id: string; from: { id: number }; data?: string; message?: { message_id: number; chat: { id: number } } } };
export type BotDeps = {
  db: Pick<PrismaClient, "kassaDraft" | "kassaEntry" | "kassaCategory" | "kassaBotUpdate" | "$transaction">;
  tg: (method: string, payload: Record<string, unknown>) => Promise<{ message_id?: number } | unknown>;
  transcribe: (fileId: string) => Promise<string>;
  analyze: (text: string, categories: string[], today: string, previous?: AiDraft) => Promise<AiDraft>;
  owner: string | undefined;
  secret: string | undefined;
};

// Words that name a currency: without one the amount's currency is never guessed.
const CURRENCY_WORD = /\$|dollar|доллар|\busd\b|ming|минг|тыс|so['‘’`ʻ]?m\b|сум|сўм|mln|million|млн|миллион/i;
const key = (name: string) => name.toLocaleLowerCase().replace(/[‘’`ʻ]/g, "'").trim();
const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Server check of the AI answer: valid enums, amount > 0, an existing category; flags say what is missing. */
export function normalizeDraft(ai: AiDraft, categories: Category[], text: string) {
  const type = ai.type === "IN" || ai.type === "OUT" ? ai.type : null;
  const amount = typeof ai.amount === "number" && Number.isFinite(ai.amount) && ai.amount > 0 && ai.amount < 1e15 ? Math.round(ai.amount * 100) / 100 : null;
  const currency = (ai.currency === "USD" || ai.currency === "UZS") && CURRENCY_WORD.test(text) && !ai.flags.includes("CURRENCY_UNCLEAR") ? ai.currency : null;
  const category = ai.categoryName ? categories.find(item => key(item.name) === key(ai.categoryName!) && (!type || item.type === type)) : undefined;
  const flags: Flag[] = [];
  if (!type) flags.push("TYPE_UNCLEAR");
  if (amount === null) flags.push("AMOUNT_MISSING");
  if (!currency) flags.push("CURRENCY_UNCLEAR");
  if (!category) flags.push("CATEGORY_UNKNOWN");
  return { type, amount, currency, categoryId: category?.id ?? null, note: (ai.note.trim() || text.trim()).slice(0, 300), flags };
}

/** Entry data of a draft with nothing missing, else null ("✓" stays off). */
export function entryFromDraft(draft: Pick<Draft, "type" | "amount" | "currency" | "categoryId" | "paymentType" | "note" | "flags" | "occurredAt">): EntryInput | null {
  if (draft.flags.length || !draft.type || draft.amount == null || !draft.currency || !draft.categoryId) return null;
  return { type: draft.type, amount: Number(draft.amount), currency: draft.currency, categoryId: draft.categoryId, paymentType: draft.paymentType, note: draft.note, occurredAt: draft.occurredAt };
}

export function amountText(draft: Pick<Draft, "type" | "amount" | "currency">) {
  if (draft.amount == null) return "—";
  const value = draft.type === "OUT" ? -Number(draft.amount) : Number(draft.amount);
  return draft.currency ? money(value, draft.currency, true) : `${money(value, "USD", true).replace("$ ", "")} ?`;
}

const ENDINGS: Record<string, string> = { PENDING: "Saytga «tasdiqlash kutmoqda» bo‘lib tushdi ⏳", CONFIRMED: "✅ Kassaga o‘tdi", CANCELLED: "❌ Bekor qilindi" };
/** The bot's card (HTML): transcript in italics for a voice message, then Turi / Summa / Kategoriya / Izoh. */
export function draftCard(draft: Draft, categoryName: string | null) {
  return [
    draft.transcript ? `<i>«${esc(draft.transcript)}»</i>\n` : "",
    `Turi: ${draft.type === "IN" ? "↓ Kirim" : draft.type === "OUT" ? "↑ Chiqim" : "—"}`,
    `Summa: ${amountText(draft)}`,
    `Kategoriya: ${esc(categoryName ?? "—")}`,
    `Izoh: ${esc(draft.note)}`,
    draft.flags.length ? `⚠ ${draft.flags.map(flag => FLAGS[flag as Flag] ?? flag).join(", ")}` : "",
    `\n${ENDINGS[draft.status]}`,
  ].filter(Boolean).join("\n");
}
const keyboard = (draft: Pick<Draft, "id" | "status">) => ({ inline_keyboard: draft.status === "PENDING" ? [[{ text: "✏️ Tuzatish", callback_data: `kb:edit:${draft.id}` }, { text: "🗑 Bekor", callback_data: `kb:cancel:${draft.id}` }]] : [] });

const HELP = "Salom! Kirim yoki chiqimni yozing yoki ovozli xabar yuboring — saytda tasdiqlaysiz.\n\nMisollar:\n• benzinga 300 ming\n• Atxam akadan 500 dollar oldim qarzidan\n• ovqatga 80 ming so‘m\n• 1,5 mln reklama\n\nTuzatish: kartaga reply qiling yoki ✏️ ni bosib yozing («yo‘q, 350 ming edi»).\n/kutmoqda — tasdiqlanmaganlar.";

export function createKassaBot(deps: BotDeps) {
  const { db } = deps;
  const categories = () => db.kassaCategory.findMany({ where: { archived: false }, select: { id: true, name: true, type: true } }) as Promise<Category[]>;
  const nameOf = async (id: string | null) => id ? (await db.kassaCategory.findUnique({ where: { id }, select: { name: true } }))?.name ?? null : null;
  /** Rewrites the bot's card to the draft's current state (buttons go once it is confirmed / cancelled). */
  async function refreshCard(draft: Draft) {
    if (!draft.tgReplyMessageId) return;
    await deps.tg("editMessageText", { chat_id: draft.tgChatId, message_id: draft.tgReplyMessageId, text: draftCard(draft, await nameOf(draft.categoryId)), parse_mode: "HTML", reply_markup: keyboard(draft) }).catch(() => undefined);
  }
  const previous = async (draft: Draft): Promise<AiDraft> => ({ type: draft.type, amount: draft.amount == null ? null : Number(draft.amount), currency: draft.currency, categoryName: await nameOf(draft.categoryId), note: draft.note, flags: draft.flags });

  async function onMessage(message: TgMessage) {
    const chat = String(message.chat.id), send = (text: string, extra: Record<string, unknown> = {}) => deps.tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", ...extra });
    if (message.text?.startsWith("/start")) return send(HELP);
    if (message.text?.startsWith("/kutmoqda")) {
      const pending = await db.kassaDraft.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 30 }) as Draft[];
      return send(pending.length ? `⏳ ${pending.length} ta kutmoqda:\n${pending.map(draft => `• ${amountText(draft)} — ${esc(draft.note)}`).join("\n")}` : "Tasdiqlash kutayotgan yozuv yo‘q.");
    }
    const voice = Boolean(message.voice);
    const text = voice ? (await deps.transcribe(message.voice!.file_id)).trim() : message.text?.trim() ?? "";
    if (!text) return send("Xabar tushunilmadi. Matn yoki ovozli xabar yuboring.");
    // A correction: a reply to a card, or the next message after "✏️ Tuzatish" (15 minutes).
    const target = (message.reply_to_message && await db.kassaDraft.findFirst({ where: { tgChatId: chat, tgReplyMessageId: message.reply_to_message.message_id } }))
      || await db.kassaDraft.findFirst({ where: { tgChatId: chat, editRequestedAt: { gte: new Date(Date.now() - 15 * 60_000) } }, orderBy: { editRequestedAt: "desc" } });
    const list = await categories(), today = new Date(message.date * 1000).toISOString().slice(0, 10);
    if (target) {
      const draft = target as Draft;
      if (draft.status !== "PENDING") return send("Bu yozuv allaqachon ko‘rib chiqilgan — tuzatib bo‘lmaydi.");
      const combined = `${draft.rawText}\n${text}`;
      const fields = normalizeDraft(await deps.analyze(text, list.map(item => item.name), today, await previous(draft)), list, combined);
      const updated = await db.kassaDraft.update({ where: { id: draft.id }, data: { ...fields, rawText: combined, editRequestedAt: null } }) as Draft;
      await refreshCard(updated);
      return send(`✅ Tuzatildi: ${esc(await nameOf(updated.categoryId) ?? "—")} — ${amountText(updated)}`);
    }
    const fields = normalizeDraft(await deps.analyze(text, list.map(item => item.name), today), list, text);
    const draft = await db.kassaDraft.create({ data: { ...fields, source: voice ? "VOICE" : "TEXT", rawText: text, transcript: voice ? text : null, occurredAt: new Date(message.date * 1000), tgChatId: chat } }) as Draft;
    const sent = await deps.tg("sendMessage", { chat_id: chat, text: draftCard(draft, await nameOf(draft.categoryId)), parse_mode: "HTML", reply_markup: keyboard(draft), reply_parameters: { message_id: message.message_id } }) as { message_id?: number };
    if (sent?.message_id) await db.kassaDraft.update({ where: { id: draft.id }, data: { tgReplyMessageId: sent.message_id } });
  }

  async function onCallback(query: NonNullable<TgUpdate["callback_query"]>) {
    const [, action, id] = (query.data ?? "").split(":");
    const answer = (text: string) => deps.tg("answerCallbackQuery", { callback_query_id: query.id, text }).catch(() => undefined);
    if (action === "cancel") return answer((await cancelDraft(id)) ? "Bekor qilindi" : "Allaqachon ko‘rib chiqilgan");
    if (action !== "edit") return answer("");
    const { count } = await db.kassaDraft.updateMany({ where: { id, status: "PENDING" }, data: { editRequestedAt: new Date() } });
    await answer(count ? "Tuzatishni yozing" : "Allaqachon ko‘rib chiqilgan");
    if (count && query.message) await deps.tg("sendMessage", { chat_id: query.message.chat.id, text: "Tuzatishni yozing, masalan: «yo‘q, 350 ming edi»" });
  }

  /** ✓ on the site (or "Saqlash" in its sheet with `values`): one entry, once — a second press finds the draft no longer PENDING. */
  async function confirmDraft(id: string, userId: string, values?: EntryInput & { receiptUrl?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
    let draft: Draft;
    try {
      draft = await db.$transaction(async tx => {
        const found = await tx.kassaDraft.findFirst({ where: { id, status: "PENDING" } }) as Draft | null;
        if (!found) throw new Error("handled");
        const data = values ?? entryFromDraft(found);
        if (!data) throw new Error("flags");
        const entry = await tx.kassaEntry.create({ data: { ...data, createdById: userId } });
        const { count } = await tx.kassaDraft.updateMany({ where: { id, status: "PENDING" }, data: { status: "CONFIRMED", entryId: entry.id, editRequestedAt: null } });
        if (count !== 1) throw new Error("handled"); // a parallel press won: roll this entry back
        return { ...found, ...data, status: "CONFIRMED", flags: [] };
      });
    } catch (error) {
      return { ok: false, error: error instanceof Error && error.message === "flags" ? "Avval ✏️ bilan tuzating." : "Bu yozuv allaqachon ko‘rib chiqilgan." };
    }
    await refreshCard(draft);
    return { ok: true };
  }

  async function cancelDraft(id: string) {
    const { count } = await db.kassaDraft.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED", editRequestedAt: null } });
    const draft = await db.kassaDraft.findUnique({ where: { id } }) as Draft | null;
    if (count && draft) await refreshCard(draft);
    return count === 1;
  }

  /** Webhook: wrong secret → 401; not the owner → silent 200; a redelivered update_id → 200 without work. `run` goes to after(). */
  async function receive(secretHeader: string | null, update: TgUpdate | null): Promise<{ status: number; run?: () => Promise<unknown> }> {
    const expected = Buffer.from(deps.secret ?? ""), actual = Buffer.from(secretHeader ?? "");
    if (!expected.length || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { status: 401 };
    const from = update?.message?.from?.id ?? update?.callback_query?.from.id;
    if (!update || typeof update.update_id !== "number" || !deps.owner || String(from) !== deps.owner) return { status: 200 };
    try { await db.kassaBotUpdate.create({ data: { updateId: BigInt(update.update_id) } }); }
    catch (error) { if ((error as { code?: string })?.code === "P2002") return { status: 200 }; throw error; }
    return { status: 200, run: () => update.callback_query ? onCallback(update.callback_query) : update.message ? onMessage(update.message) : Promise.resolve() };
  }

  return { receive, confirmDraft, cancelDraft };
}
