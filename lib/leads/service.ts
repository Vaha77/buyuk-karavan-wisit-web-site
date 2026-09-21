import "server-only";
import { getDb } from "@/lib/db";
import { publishLeadToTelegram } from "@/lib/telegram/service";
import { normalizePhone,publicLeadSchema } from "./validation";

export async function createLead(raw:unknown){
  const parsed=publicLeadSchema.safeParse(raw);
  if(!parsed.success)return{ok:false as const,error:parsed.error.issues[0]?.message||"Ma’lumotlarni tekshiring."};
  const value=parsed.data;
  let row;
  try{row=await getDb().lead.create({data:{customerName:value.customerName||null,phone:normalizePhone(value.phone)||null,telegram:value.telegram||null,requestType:value.requestType||"Boshqa so‘rov",product:value.product||null,dimensions:value.dimensions||null,capacity:value.capacity||null,temperature:value.temperature||null,region:value.region||null,notes:value.notes||null,source:value.source,chatHistory:value.chatHistory,activities:{create:{type:"LEAD_CREATED"}}}});}
  catch{return{ok:false as const,error:"So‘rovni saqlab bo‘lmadi. Iltimos, qayta urinib ko‘ring."};}
  await publishLeadToTelegram(row.id);
  return{ok:true as const,id:row.id};
}
