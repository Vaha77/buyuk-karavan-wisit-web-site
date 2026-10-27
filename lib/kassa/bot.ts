import "server-only";
// Real Telegram + OpenAI for the "BK Kassa" bot (KASSA_BOT_* env; Madina's TELEGRAM_* is never touched).
import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { createKassaBot, type AiDraft } from "./bot-core";

const token = () => { const value = process.env.KASSA_BOT_TOKEN?.trim(); if (!value) throw new Error("KASSA_BOT_TOKEN is not configured"); return value; };

export async function kassaTg(method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token()}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => null) as { ok?: boolean; result?: unknown; description?: string } | null;
  // The description is Telegram's text (never the token).
  if (!body?.ok) throw new Error(`Kassa bot ${method} failed: ${body?.description ?? response.status}`);
  return body.result;
}

const openai = () => { if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured"); return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 }); };

/** Voice → text. The audio is only held in memory for this request; just the transcript is kept. */
async function transcribe(fileId: string) {
  const file = await kassaTg("getFile", { file_id: fileId }) as { file_path: string };
  const audio = await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`, { signal: AbortSignal.timeout(15_000) });
  if (!audio.ok) throw new Error(`Kassa bot voice download failed: ${audio.status}`);
  const result = await openai().audio.transcriptions.create({ file: await toFile(Buffer.from(await audio.arrayBuffer()), "voice.ogg"), model: "gpt-4o-mini-transcribe", prompt: "O‘zbekcha (ba’zan ruscha aralash) kassa yozuvi: kirim, chiqim, ming, million, mln, so‘m, dollar, qarz, benzin, oylik, ijara, tovar xaridi." });
  return result.text;
}

const schema = z.object({
  type: z.enum(["IN", "OUT"]).nullable(),
  amount: z.number().nullable(),
  currency: z.enum(["USD", "UZS"]).nullable(),
  categoryName: z.string().nullable(),
  note: z.string(),
  flags: z.array(z.enum(["CURRENCY_UNCLEAR", "AMOUNT_MISSING", "CATEGORY_UNKNOWN", "TYPE_UNCLEAR"])),
});
const PROMPT = `Sen kassa yordamchisisan: o‘zbekcha (lotin/kirill, ruscha aralash) xabardan bitta kirim yoki chiqim yozuvini ajratasan.
- type: pul kelgan bo‘lsa IN (oldim, tushdi, sotuv, qarzini berdi), ketgan bo‘lsa OUT (to‘ladim, berdim, oldim-xarid, -ga). Aniq bo‘lmasa null va TYPE_UNCLEAR.
- amount: son. "300 ming" = 300000, "1,5 mln" = 1500000, "besh yuz dollar" = 500, "80 ming so‘m" = 80000. Summa yo‘q bo‘lsa null va AMOUNT_MISSING.
- currency: "$", "dollar", "доллар" → USD; "ming", "so‘m", "сум", "mln", "million" → UZS. Valyuta aytilmagan bo‘lsa null va CURRENCY_UNCLEAR — hech qachon taxmin qilma.
- categoryName: faqat berilgan ro‘yxatdagi nomlardan biri, aynan shu yozuvda. Mos kelmasa null va CATEGORY_UNKNOWN.
- note: qisqa izoh (kim, nima uchun), summasiz, masalan "Atxam aka · qarzidan".
Oldingi qiymatlar berilsa, bu tuzatish: faqat tuzatishda aytilganini o‘zgartir, qolganini saqla.
Faqat JSON qaytar.`;

async function analyze(text: string, categories: string[], today: string, previous?: AiDraft): Promise<AiDraft> {
  const input = `Bugun: ${today}\nKategoriyalar: ${JSON.stringify(categories)}\n${previous ? `Oldingi qiymatlar: ${JSON.stringify(previous)}\nTuzatish: ` : "Xabar: "}${JSON.stringify(text.slice(0, 1000))}`;
  const response = await openai().responses.parse({ model: "gpt-4.1-mini", store: false, max_output_tokens: 300, input: [{ role: "system", content: PROMPT }, { role: "user", content: input }], text: { format: zodTextFormat(schema, "kassa_draft") } });
  if (!response.output_parsed) throw new Error("Kassa bot analysis returned nothing");
  return response.output_parsed;
}

export const kassaBot = () => createKassaBot({ db: getDb(), tg: kassaTg, transcribe, analyze, owner: process.env.KASSA_BOT_OWNER_TG_ID?.trim(), secret: process.env.KASSA_BOT_WEBHOOK_SECRET?.trim() });
