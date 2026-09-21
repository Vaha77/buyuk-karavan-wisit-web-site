import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { telegramWebhookSecret } from "@/lib/telegram/client";
import { processTelegramUpdate } from "@/lib/telegram/service";
import { isTelegramUpdate } from "@/lib/telegram/types";
export const runtime="nodejs";
function validSecret(received:string|null){try{if(!received)return false;const expected=Buffer.from(telegramWebhookSecret()),actual=Buffer.from(received);return expected.length===actual.length&&timingSafeEqual(expected,actual);}catch{return false;}}
function uniqueError(error:unknown){return Boolean(error&&typeof error==="object"&&"code" in error&&error.code==="P2002");}
export async function POST(request:Request){if(!validSecret(request.headers.get("x-telegram-bot-api-secret-token")))return NextResponse.json({ok:false},{status:401});const length=Number(request.headers.get("content-length")||0);if(length>1_000_000)return NextResponse.json({ok:false},{status:413});const update:unknown=await request.json().catch(()=>null);if(!isTelegramUpdate(update))return NextResponse.json({ok:false},{status:400});try{await getDb().telegramUpdate.create({data:{updateId:BigInt(update.update_id)}});}catch(error){if(uniqueError(error))return NextResponse.json({ok:true});throw error;}try{await processTelegramUpdate(update);return NextResponse.json({ok:true});}catch(error){await getDb().telegramUpdate.delete({where:{updateId:BigInt(update.update_id)}}).catch(()=>undefined);console.error("Telegram update processing failed",{type:error instanceof Error?error.name:"UnknownError"});return NextResponse.json({ok:false},{status:500});}}
