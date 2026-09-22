import "server-only";
import { createHash } from "node:crypto";
import type { InlineKeyboard } from "./types";

type TelegramResponse<T> = { ok: boolean; result?: T; error_code?: number; description?: string };
type SentMessage = { message_id: number; chat: { id: number } };

type TelegramFailureStage="env_detection"|"request"|"response_parse"|"bot_api_response";
type SafeTelegramError={type:string;stage:TelegramFailureStage;method?:string;httpStatus?:number;errorCode?:number;description?:string;message?:string;cause?:{type?:string;code?:string;message?:string}};

export class TelegramConfigError extends Error { readonly stage="env_detection" as const; constructor(message:string){super(message);this.name="TelegramConfigError";} }
export class TelegramApiError extends Error {
  readonly stage="bot_api_response" as const;
  constructor(public method:string,public status:number,public errorCode?:number,public description?:string){super(`Telegram ${method} failed`);this.name="TelegramApiError";}
}
class TelegramRequestError extends Error {
  readonly stage="request" as const;
  constructor(public method:string,public safeCause?:SafeTelegramError["cause"]){super(`Telegram ${method} request failed`);this.name="TelegramRequestError";}
}
class TelegramResponseError extends Error {
  readonly stage="response_parse" as const;
  constructor(public method:string,public status:number){super(`Telegram ${method} response could not be parsed`);this.name="TelegramResponseError";}
}

function envValue(name:"TELEGRAM_BOT_TOKEN"|"TELEGRAM_CHAT_ID"){const value=process.env[name]?.trim();if(!value)throw new TelegramConfigError(`${name} is not configured`);return value;}
function botToken(){return envValue("TELEGRAM_BOT_TOKEN");}
export function telegramGroupChatId(){return envValue("TELEGRAM_CHAT_ID");}
export function telegramWebhookSecret() { return createHash("sha256").update(botToken()).digest("hex"); }

function redact(value:string){
  let safe=value.replace(/https:\/\/api\.telegram\.org\/bot[^/\s]+/gi,"https://api.telegram.org/bot[REDACTED]");
  for(const secret of [process.env.TELEGRAM_BOT_TOKEN,process.env.TELEGRAM_CHAT_ID])if(secret?.trim())safe=safe.replaceAll(secret.trim(),"[REDACTED]");
  return safe;
}
function safeCause(error:unknown):SafeTelegramError["cause"]{
  if(!(error instanceof Error))return{type:"UnknownError"};
  const cause=error.cause as {name?:unknown;code?:unknown;message?:unknown}|undefined;
  return{type:typeof cause?.name==="string"?cause.name:error.name,code:typeof cause?.code==="string"?cause.code:undefined,message:redact(typeof cause?.message==="string"?cause.message:error.message)};
}
export function telegramErrorDetails(error:unknown):SafeTelegramError{
  if(error instanceof TelegramApiError)return{type:error.name,stage:error.stage,method:error.method,httpStatus:error.status,errorCode:error.errorCode,description:error.description?redact(error.description):undefined};
  if(error instanceof TelegramRequestError)return{type:error.name,stage:error.stage,method:error.method,message:error.message,cause:error.safeCause};
  if(error instanceof TelegramResponseError)return{type:error.name,stage:error.stage,method:error.method,httpStatus:error.status,message:error.message};
  if(error instanceof TelegramConfigError)return{type:error.name,stage:error.stage,message:error.message};
  return{type:error instanceof Error?error.name:"UnknownError",stage:"request",message:error instanceof Error?redact(error.message):"Unknown Telegram failure"};
}

async function call<T>(method:string,payload:Record<string,unknown>):Promise<T>{
  const token=botToken();
  let response:Response;
  try{response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),cache:"no-store",signal:AbortSignal.timeout(10_000)});}
  catch(error){throw new TelegramRequestError(method,safeCause(error));}
  let body:TelegramResponse<T>|null=null;
  try{body=await response.json() as TelegramResponse<T>;}
  catch{throw new TelegramResponseError(method,response.status);}
  if(!response.ok||!body.ok||body.result===undefined)throw new TelegramApiError(method,response.status,body.error_code,body.description);
  return body.result;
}
export function sendMessage(chatId:string,text:string,replyMarkup?:InlineKeyboard){return call<SentMessage>("sendMessage",{chat_id:chatId,text,...(replyMarkup?{reply_markup:replyMarkup}:{})});}
export function editMessageText(chatId:string,messageId:number,text:string){return call<SentMessage>("editMessageText",{chat_id:chatId,message_id:messageId,text,reply_markup:{inline_keyboard:[]}});}
export function answerCallbackQuery(id:string,text:string,showAlert=false){return call<boolean>("answerCallbackQuery",{callback_query_id:id,text,show_alert:showAlert});}
