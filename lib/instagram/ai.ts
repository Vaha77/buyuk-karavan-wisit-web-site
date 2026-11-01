import "server-only";
// Madina AI for Instagram comments: a small, cheap model with JSON (structured) output. Every call returns its token usage
// and cost; any failure returns null (the caller falls back to keywords / no reply).
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { CommentKind } from "./constants";
import { aiCostUsd, aiReplyProblem, firstGoodReply, isShortComment, tooSimilar, validPositiveReply } from "./rules";

const DEFAULT_MODEL = "gpt-4.1-mini";
export const instagramModel = () => process.env.OPENAI_INSTAGRAM_MODEL?.trim() || DEFAULT_MODEL;
export type AiUsage = { tokens: number; costUsd: number | null };
const ZERO: AiUsage = { tokens: 0, costUsd: 0 };
export const addUsage = (a: AiUsage, b: AiUsage): AiUsage => ({ tokens: a.tokens + b.tokens, costUsd: a.costUsd === null || b.costUsd === null ? null : Math.round((a.costUsd + b.costUsd) * 1e6) / 1e6 });

const client = () => process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15_000, maxRetries: 1 }) : null;
function usageOf(response: { usage?: { input_tokens?: number; output_tokens?: number } | null }): AiUsage {
  const input = response.usage?.input_tokens ?? 0, output = response.usage?.output_tokens ?? 0;
  return { tokens: input + output, costUsd: aiCostUsd(instagramModel(), input, output) };
}
const safe = (error: unknown) => ({ type: error instanceof Error ? error.name : "UnknownError", status: (error as { status?: number })?.status });

const classification = z.object({ kind: z.enum(["PRICE", "POSITIVE", "QUESTION", "NEGATIVE", "SPAM"]) });

/** The account's brand (InstagramAccount.brandName, else @username): the prompts speak for it and never mention another one. */
const classifyPrompt = (brand: string) => `Sen ${brand} Instagram sahifasidagi kommentlarni turlarga ajratasan.
Kommentlar o'zbek (lotin yoki kirill), rus yoki ingliz tilida, emoji bilan bo'lishi mumkin.
Turlar:
- PRICE: narx so'rash ("narxi?", "qancha", "nech pul", "цена", "+", "?").
- POSITIVE: maqtov, emoji, minnatdorchilik yoki neytral (do'stini belgilash ham).
- QUESTION: narxdan boshqa savol (manzil, yetkazib berish, kafolat, muddat, buyurtma, ish vaqti).
- NEGATIVE: salbiy fikr, shikoyat, haqorat, "qimmat", "aldov", raqobatchi reklamasi yoki tanqid.
- SPAM: reklama, havola, bot, kontentga aloqasiz takliflar.
Ham narx, ham boshqa savol bo'lsa — PRICE. Shubhada salbiyroq turni tanla (NEGATIVE > QUESTION > POSITIVE).
Faqat JSON qaytar.`;

/** AI comment kind, or null (no key / error / timeout). */
export async function classifyWithAi(comment: string, brand: string): Promise<{ kind: Exclude<CommentKind, "UNKNOWN" | "PHONE" | "ADDRESS" | "HOURS">; usage: AiUsage } | null> {
  const openai = client();
  if (!openai) return null;
  try {
    const response = await openai.responses.parse({ model: instagramModel(), store: false, max_output_tokens: 40, input: [{ role: "system", content: classifyPrompt(brand) }, { role: "user", content: `Komment: ${JSON.stringify(comment.slice(0, 600))}` }], text: { format: zodTextFormat(classification, "comment_kind") } });
    const kind = response.output_parsed?.kind;
    return kind ? { kind, usage: usageOf(response) } : null;
  } catch (error) {
    console.warn("Instagram AI classify failed", safe(error));
    return null;
  }
}

const positiveReply = z.object({ reply: z.string() });

const replyPrompt = (brand: string) => `Sen ${brand} Instagram sahifasi nomidan ijobiy kommentga qisqa, samimiy ochiq javob yozasan.
Faqat shu brend nomidan yoz, boshqa kompaniya yoki brend nomini tilga olma.
Qoidalar:
- Faqat 1 jumla, 3–12 so'z.
- Kommentning tilida va yozuvida yoz: o'zbek lotin → o'zbek lotin, o'zbek kirill → o'zbek kirill, rus → rus, ingliz → ingliz.
- Kommentda emoji bo'lsa — javobda aynan 1 ta emoji; bo'lmasa emoji ishlatma.
- Ma'no: rahmat, e'tibor uchun minnatdorchilik, savol bo'lsa yozing.
- Narx, raqam, va'da, chegirma, aksiya, kafolat, havola, @belgi YOZMA.
- Quyidagi oldingi javoblarni takrorlama, so'zlari ham boshqacha bo'lsin.
Faqat JSON qaytar: {"reply": "..."}`;

/**
 * A fresh public reply for a POSITIVE comment; rewritten when invalid or similar to one of the last 20 replies (3 tries;
 * `relaxed`, the aiReplyAll accounts: 2 tries, only aiReplyProblem's bans). null when the AI is unavailable; `reply: null`
 * with the `reason` when it never produced a usable reply — then no reply goes out.
 */
export async function writePositiveReply(comment: string, recent: string[], brand: string, options: { prompt?: string | null; relaxed?: boolean } = {}): Promise<{ reply: string | null; usage: AiUsage; reason: string } | null> {
  const openai = client();
  if (!openai) return null;
  let usage = ZERO;
  const avoid = [...recent];
  const relaxed = options.relaxed === true;
  // shortcut: the door-master context is hard-coded, as @eshikmaster is the only aiReplyAll account; move it to the account when another joins.
  const hint = relaxed && isShortComment(comment) ? `\nKomment faqat emoji yoki 1–2 so'zdan iborat: ${brand} (avto eshik regulirovkasi ustasi) nomidan o'zbek tilida qisqa, samimiy javob yoz.` : "";
  try {
    const result = await firstGoodReply(relaxed ? 2 : 3, async rejected => {
      const retry = relaxed && rejected ? `\nOldingi javobing rad etildi (${rejected}). Boshqacha javob yoz.` : "";
      const response = await openai.responses.parse({ model: instagramModel(), store: false, max_output_tokens: 120, temperature: 1, input: [{ role: "system", content: options.prompt?.trim() || replyPrompt(brand) }, { role: "user", content: `Oldingi javoblar: ${JSON.stringify(avoid.slice(-20))}\nKomment: ${JSON.stringify(comment.slice(0, 600))}${hint}${retry}` }], text: { format: zodTextFormat(positiveReply, "positive_reply") } });
      usage = addUsage(usage, usageOf(response));
      const reply = response.output_parsed?.reply?.trim() ?? "";
      if (reply) avoid.push(reply);
      return reply;
    }, reply => (relaxed ? aiReplyProblem(reply) : validPositiveReply(reply, comment) ? null : "qoidaga mos emas") ?? (tooSimilar(reply, recent) ? "oldingi javobga o‘xshash" : null));
    return { ...result, usage };
  } catch (error) {
    console.warn("Instagram AI reply failed", safe(error));
    return usage.tokens ? { reply: null, usage, reason: `AI xatosi (${safe(error).type})` } : null;
  }
}
