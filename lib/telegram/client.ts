import "server-only";
import { createHash } from "node:crypto";
import type { InlineKeyboard } from "./types";

type TelegramResponse<T> = { ok: boolean; result?: T; error_code?: number };
type SentMessage = { message_id: number; chat: { id: number } };

export class TelegramConfigError extends Error {}
export class TelegramApiError extends Error { constructor(public method: string, public status: number) { super(`Telegram ${method} failed`); } }

function botToken() { const value=process.env.TELEGRAM_BOT_TOKEN; if(!value)throw new TelegramConfigError("Telegram bot is not configured"); return value; }
export function telegramGroupChatId() { const value=process.env.TELEGRAM_CHAT_ID; if(!value)throw new TelegramConfigError("Telegram group is not configured"); return value; }
export function telegramWebhookSecret() { return createHash("sha256").update(botToken()).digest("hex"); }

async function call<T>(method:string,payload:Record<string,unknown>):Promise<T>{
  const response=await fetch(`https://api.telegram.org/bot${botToken()}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),cache:"no-store",signal:AbortSignal.timeout(10_000)});
  const body=await response.json().catch(()=>null) as TelegramResponse<T>|null;
  if(!response.ok||!body?.ok||body.result===undefined)throw new TelegramApiError(method,body?.error_code||response.status);
  return body.result;
}
export function sendMessage(chatId:string,text:string,replyMarkup?:InlineKeyboard){return call<SentMessage>("sendMessage",{chat_id:chatId,text,...(replyMarkup?{reply_markup:replyMarkup}:{})});}
export function editMessageText(chatId:string,messageId:number,text:string){return call<SentMessage>("editMessageText",{chat_id:chatId,message_id:messageId,text,reply_markup:{inline_keyboard:[]}});}
export function answerCallbackQuery(id:string,text:string,showAlert=false){return call<boolean>("answerCallbackQuery",{callback_query_id:id,text,show_alert:showAlert});}
