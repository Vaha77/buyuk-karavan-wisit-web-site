import "server-only";
import { getDb } from "@/lib/db";
import { answerCallbackQuery,editMessageText,sendMessage,telegramGroupChatId } from "./client";
import { agentName,claimedLeadGroupText,newLeadGroupText,privateLeadText,registrationText,welcomeText } from "./messages";
import { contactedKeyboard,handleCrmCallback,handleCrmText,mainMenu } from "./crm";
import type { TelegramCallbackQuery,TelegramMessage,TelegramUpdate } from "./types";

const claimKeyboard=(leadId:string)=>({inline_keyboard:[[{text:"🙋 Mijozni olish",callback_data:`claim:${leadId}`}]]});
function safeError(label:string,error:unknown){console.error(label,{type:error instanceof Error?error.name:"UnknownError"});}

export async function publishLeadToTelegram(leadId:string){
  const reserved=await getDb().lead.updateMany({where:{id:leadId,telegramNotificationStatus:"PENDING"},data:{telegramNotificationStatus:"PUBLISHING"}});
  if(reserved.count!==1)return false;
  try{
    const lead=await getDb().lead.findUnique({where:{id:leadId},select:{id:true,customerName:true,region:true,requestType:true,product:true,temperature:true}});
    if(!lead)throw new Error("Lead missing");
    const message=await sendMessage(telegramGroupChatId(),newLeadGroupText(lead),claimKeyboard(lead.id));
    await getDb().lead.update({where:{id:lead.id},data:{telegramNotificationStatus:"PUBLISHED",telegramChatId:String(message.chat.id),telegramMessageId:message.message_id,telegramPublishedAt:new Date(),telegramPublishFailedAt:null}});
    return true;
  }catch(error){await getDb().lead.updateMany({where:{id:leadId,telegramNotificationStatus:"PUBLISHING"},data:{telegramNotificationStatus:"FAILED",telegramPublishFailedAt:new Date()}}).catch(()=>undefined);safeError("Telegram lead publish failed",error);return false;}
}

async function registerAgent(message:TelegramMessage){
  if(message.chat.type!=="private"||!message.from||message.from.is_bot||!message.text?.trim().startsWith("/start"))return false;
  const user=message.from,agent=await getDb().salesAgent.upsert({where:{telegramUserId:BigInt(user.id)},create:{telegramUserId:BigInt(user.id),telegramUsername:user.username||null,firstName:user.first_name,lastName:user.last_name||null},update:{telegramUsername:user.username||null,firstName:user.first_name,lastName:user.last_name||null}});
  await sendMessage(String(user.id),registrationText(user.first_name,agent.isApproved&&agent.isActive),mainMenu);return true;
}
async function welcomeMembers(message:TelegramMessage){
  if(!message.new_chat_members?.length||String(message.chat.id)!==telegramGroupChatId())return false;
  for(const user of message.new_chat_members){if(!user.is_bot){await getDb().salesAgent.updateMany({where:{telegramUserId:BigInt(user.id)},data:{joinedAt:new Date()}});await sendMessage(String(message.chat.id),welcomeText(user.first_name));}}return true;
}
async function rejectClaim(callback:TelegramCallbackQuery,text:string){await answerCallbackQuery(callback.id,text,true);}
async function claimLead(callback:TelegramCallbackQuery){
  const match=callback.data?.match(/^claim:([a-z0-9]+)$/i);if(!match||!callback.message||String(callback.message.chat.id)!==telegramGroupChatId())return false;
  const agent=await getDb().salesAgent.findUnique({where:{telegramUserId:BigInt(callback.from.id)}});
  if(!agent){await rejectClaim(callback,"Avval botga kirib START tugmasini bosing.");return true;}
  if(!agent.isApproved){await rejectClaim(callback,"Administrator tasdig‘i kutilmoqda.");return true;}
  if(!agent.isActive){await rejectClaim(callback,"Hisobingiz faol emas.");return true;}
  const claimedAt=new Date(),result=await getDb().lead.updateMany({where:{id:match[1],assignedAgentId:null},data:{assignedAgentId:agent.id,claimedAt}});
  if(result.count!==1){await rejectClaim(callback,"Bu mijozni boshqa sotuvchi olib bo‘ldi.");return true;}
  await getDb().leadActivity.create({data:{leadId:match[1],agentId:agent.id,type:"CLAIMED"}});
  await answerCallbackQuery(callback.id,"Mijoz sizga biriktirildi.");
  const lead=await getDb().lead.findUnique({where:{id:match[1]}});if(!lead)return true;
  const seller=agentName(agent);
  if(lead.telegramChatId&&lead.telegramMessageId)await editMessageText(lead.telegramChatId,lead.telegramMessageId,claimedLeadGroupText(lead,seller)).catch(error=>safeError("Telegram group edit failed",error));
  try{await sendMessage(String(agent.telegramUserId),privateLeadText(lead),contactedKeyboard(lead.id));await getDb().lead.update({where:{id:lead.id},data:{telegramPrivateDeliveryFailedAt:null}});}catch(error){await getDb().lead.update({where:{id:lead.id},data:{telegramPrivateDeliveryFailedAt:new Date()}}).catch(()=>undefined);safeError("Telegram private delivery failed",error);}
  return true;
}
export async function handleTelegramUpdate(update:TelegramUpdate){if(update.message){if(await registerAgent(update.message))return;if(await welcomeMembers(update.message))return;if(await handleCrmText(update.message))return;}if(update.callback_query){if(await claimLead(update.callback_query))return;await handleCrmCallback(update.callback_query);}}
