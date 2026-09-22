import "server-only";
import { getDb } from "@/lib/db";
import { publishLeadToTelegram } from "@/lib/telegram/service";
import { normalizePhone,publicLeadSchema } from "./validation";

export async function findLeadSubmission(idempotencyKey:string){if(!idempotencyKey)return null;return getDb().lead.findUnique({where:{submissionKey:idempotencyKey},select:{id:true}});}

export async function createLead(raw:unknown){
  const parsed=publicLeadSchema.safeParse(raw);
  if(!parsed.success)return{ok:false as const,error:parsed.error.issues[0]?.message||"Ma’lumotlarni tekshiring."};
  const value=parsed.data;
  if(value.idempotencyKey){const existing=await findLeadSubmission(value.idempotencyKey);if(existing)return{ok:true as const,id:existing.id,duplicate:true as const};}
  let row;
  try{row=await getDb().lead.create({data:{submissionKey:value.idempotencyKey||null,customerName:value.customerName||null,phone:normalizePhone(value.phone)||null,telegram:value.telegram||null,requestType:value.requestType||"Boshqa so‘rov",product:value.product||null,productId:value.productId||null,productSlug:value.productSlug||null,dimensions:value.dimensions||null,capacity:value.capacity||null,temperature:value.temperature||null,region:value.region||null,notes:value.notes||null,source:value.source,chatHistory:value.chatHistory,activities:{create:{type:"LEAD_CREATED"}}}});}
  catch(error){const safe=error as {name?:unknown;code?:unknown};console.error("Lead create failed",JSON.stringify({type:typeof safe?.name==="string"?safe.name:"UnknownError",code:typeof safe?.code==="string"?safe.code:undefined}));if(value.idempotencyKey){const existing=await findLeadSubmission(value.idempotencyKey).catch(()=>null);if(existing)return{ok:true as const,id:existing.id,duplicate:true as const};}return{ok:false as const,error:"So‘rovni saqlab bo‘lmadi. Iltimos, qayta urinib ko‘ring."};}
  await publishLeadToTelegram(row.id);
  return{ok:true as const,id:row.id};
}
