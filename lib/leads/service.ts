import "server-only";
import { getDb } from "@/lib/db";
import { publishLeadToTelegram } from "@/lib/telegram/service";
import { normalizePhone,publicLeadSchema } from "./validation";
import { isRegionOf, matchRegionText, regionName } from "@/lib/dashboard/regions";
import { attributeLead, expireDashboard, type TrackingCookies } from "@/lib/referrals/tracking";

/** Country + region code from the form; older forms send only free text, which is matched best-effort. */
function leadLocation(value:{country?:string;regionCode?:string;region?:string}){
  if(value.country&&value.regionCode&&isRegionOf(value.regionCode,value.country))return{country:value.country,regionCode:value.regionCode,region:value.region||regionName(value.regionCode)};
  const matched=matchRegionText(value.region);
  return{country:value.country||(matched?"UZ":null),regionCode:matched&&(!value.country||value.country==="UZ")?matched:null,region:value.region||null};
}

export async function findLeadSubmission(idempotencyKey:string){if(!idempotencyKey)return null;return getDb().lead.findUnique({where:{submissionKey:idempotencyKey},select:{id:true}});}

export async function createLead(raw:unknown,tracking?:TrackingCookies){
  const parsed=publicLeadSchema.safeParse(raw);
  if(!parsed.success)return{ok:false as const,error:parsed.error.issues[0]?.message||"Ma’lumotlarni tekshiring."};
  const value=parsed.data;
  if(value.idempotencyKey){const existing=await findLeadSubmission(value.idempotencyKey);if(existing)return{ok:true as const,id:existing.id,duplicate:true as const};}
  let row;
  try{row=await getDb().lead.create({data:{submissionKey:value.idempotencyKey||null,customerName:value.customerName||null,phone:normalizePhone(value.phone)||null,telegram:value.telegram||null,requestType:value.requestType||"Boshqa so‘rov",product:value.product||null,productId:value.productId||null,productSlug:value.productSlug||null,dimensions:value.dimensions||null,capacity:value.capacity||null,temperature:value.temperature||null,...leadLocation(value),notes:value.notes||null,source:value.source,chatHistory:value.chatHistory,activities:{create:{type:"LEAD_CREATED"}}}});}
  catch(error){const safe=error as {name?:unknown;code?:unknown};console.error("Lead create failed",JSON.stringify({type:typeof safe?.name==="string"?safe.name:"UnknownError",code:typeof safe?.code==="string"?safe.code:undefined}));if(value.idempotencyKey){const existing=await findLeadSubmission(value.idempotencyKey).catch(()=>null);if(existing)return{ok:true as const,id:existing.id,duplicate:true as const};}return{ok:false as const,error:"So‘rovni saqlab bo‘lmadi. Iltimos, qayta urinib ko‘ring."};}
  if(tracking)await attributeLead(row.id,tracking).catch(error=>console.error("Lead attribution failed",{type:error instanceof Error?error.name:"UnknownError"}));
  expireDashboard();
  await publishLeadToTelegram(row.id);
  return{ok:true as const,id:row.id};
}
