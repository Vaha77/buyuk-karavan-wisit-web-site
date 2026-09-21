import "server-only";
import { getDb } from "@/lib/db";
import { sendMessage,telegramGroupChatId } from "@/lib/telegram/client";
import { agentName } from "@/lib/telegram/messages";
import { marjaBalance } from "./marja";
const contactedKeyboard=(leadId:string)=>({inline_keyboard:[[{text:"📞 Aloqaga chiqdim",callback_data:`contact:${leadId}`}]]});

export async function approveSale(saleId:string,adminId:string){
  const result=await getDb().$transaction(async tx=>{
    const sale=await tx.sale.findUnique({where:{id:saleId},include:{agent:true,lead:true}});if(!sale)return{error:"Sotuv topilmadi."};
    if(sale.status!=="PENDING")return{already:true,sale};
    const changed=await tx.sale.updateMany({where:{id:saleId,status:"PENDING"},data:{status:"APPROVED",approvedAt:new Date(),approvedByAdminId:adminId,rejectedAt:null,rejectionReason:null}});
    if(changed.count!==1)return{already:true,sale};
    await tx.lead.update({where:{id:sale.leadId},data:{status:"WON"}});
    await tx.leadFollowUp.updateMany({where:{leadId:sale.leadId,status:{in:["SCHEDULED","REMINDER_RESERVED","REMINDER_SENT"]}},data:{status:"CANCELLED"}});
    await tx.leadActivity.create({data:{leadId:sale.leadId,agentId:sale.agentId,type:"SALE_CONFIRMED",metadata:{saleId}}});
    await tx.marjaTransaction.create({data:{agentId:sale.agentId,saleId,type:"SALE_EARNED",amount:1,description:"Tasdiqlangan sotuv uchun +1 Marja"}});
    return{approved:true,sale};
  },{isolationLevel:"Serializable"});
  if("approved" in result){await sendSaleCelebration(saleId).catch(error=>console.error("Telegram sale celebration failed",{type:error instanceof Error?error.name:"UnknownError"}));}
  return result;
}

async function sendSaleCelebration(saleId:string){
  const reserved=await getDb().sale.updateMany({where:{id:saleId,status:"APPROVED",celebrationSentAt:null},data:{celebrationSentAt:new Date()}});if(reserved.count!==1)return false;
  const sale=await getDb().sale.findUnique({where:{id:saleId},include:{agent:true}});if(!sale)return false;
  const balance=await marjaBalance(sale.agentId),next=await getDb().reward.findFirst({where:{isActive:true,requiredMarja:{gt:balance}},orderBy:[{requiredMarja:"asc"},{order:"asc"}]});
  const text=["🎉 SAVDO YAKUNLANDI!","",`👏 ${agentName(sale.agent)} muvaffaqiyatli savdo qildi.`,`💎 +1 MARJA`,`🏆 Jami: ${balance} Marja`,next&&"",next&&"🎯 Keyingi mukofot:",next&&`${next.requiredMarja} Marja — ${next.name}`,next&&`Yana ${next.requiredMarja-balance} Marja qoldi.`,"","🔥 Zo‘r natija! Shu tempda davom eting!"].filter(Boolean).join("\n");
  await sendMessage(telegramGroupChatId(),text);return true;
}

export async function rejectSale(saleId:string,adminId:string,reason:string){const value=reason.trim();if(value.length<3||value.length>500)return{error:"Rad etish sababini kiriting."};const result=await getDb().$transaction(async tx=>{const sale=await tx.sale.findUnique({where:{id:saleId},include:{agent:true,lead:true}});if(!sale)return{error:"Sotuv topilmadi."};if(sale.status!=="PENDING")return{error:"Sotuv allaqachon ko‘rib chiqilgan."};await tx.sale.update({where:{id:saleId},data:{status:"REJECTED",rejectedAt:new Date(),rejectionReason:value,approvedAt:null,approvedByAdminId:adminId}});await tx.lead.update({where:{id:sale.leadId},data:{status:"IN_PROGRESS"}});await tx.leadActivity.create({data:{leadId:sale.leadId,agentId:sale.agentId,type:"SALE_REJECTED",comment:value,metadata:{saleId}}});return{sale};});if("sale" in result&&result.sale)await sendMessage(String(result.sale.agent.telegramUserId),`Savdo administrator tomonidan rad etildi.\nSabab: ${value}\n\nMijoz bilan ishlashni davom ettirishingiz mumkin.`,contactedKeyboard(result.sale.leadId)).catch(()=>undefined);return result;}

export async function reportPendingSale(leadId:string,agentId:string,details:string){const lead=await getDb().lead.findFirst({where:{id:leadId,assignedAgentId:agentId}});if(!lead)throw new Error("Lead not assigned");return getDb().$transaction(async tx=>{const existing=await tx.sale.findUnique({where:{leadId}});if(existing?.status==="APPROVED")throw new Error("Sale already approved");const sale=await tx.sale.upsert({where:{leadId},create:{leadId,agentId,customerName:lead.customerName,productDescription:details,comment:details},update:{agentId,status:"PENDING",customerName:lead.customerName,productDescription:details,comment:details,reportedAt:new Date(),approvedAt:null,approvedByAdminId:null,rejectedAt:null,rejectionReason:null,celebrationSentAt:null}});await tx.lead.update({where:{id:leadId},data:{status:"IN_PROGRESS"}});await tx.leadFollowUp.updateMany({where:{leadId,status:{in:["SCHEDULED","REMINDER_RESERVED","REMINDER_SENT"]}},data:{status:"CANCELLED"}});await tx.leadActivity.create({data:{leadId,agentId,type:"SALE_REPORTED",comment:details,metadata:{saleId:sale.id}}});return sale;});}
