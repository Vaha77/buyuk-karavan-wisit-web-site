import "server-only";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import type { LeadActivityType, SalesAgent } from "@/generated/prisma/client";
import type { ConversationMessage, Lead, LeadSource, LeadStatus, LeadTimelineItem } from "./types";

const statusMap = { NEW:"new", REVIEWING:"reviewing", CONTACTED:"contacted", COMPLETED:"completed", IN_PROGRESS:"in_progress", WON:"won", LOST:"lost" } as const;
const sourceMap = { CONTACT_FORM:"contact_form", MADINA:"madina", PRODUCT:"product", PROJECT:"project", HOME_CTA:"home_cta", OTHER:"other" } as const;
const activityLabels: Record<LeadActivityType, string> = {
  LEAD_CREATED:"Madina yangi murojaat yaratdi", CLAIMED:"Mijoz sotuvchiga biriktirildi",
  CONTACTED:"Sotuvchi mijoz bilan bog‘landi", COMMENT_ADDED:"Izoh qo‘shildi",
  FOLLOW_UP_SCHEDULED:"Keyingi aloqa belgilandi", FOLLOW_UP_COMPLETED:"Qayta aloqa bajarildi",
  FOLLOW_UP_POSTPONED:"Qayta aloqa keyinga surildi", STATUS_CHANGED:"Suhbat natijasi qayd etildi",
  SALE_REPORTED:"Sotuv qayd etildi", REJECTED:"Yakuniy rad javobi qayd etildi",
};

function conversation(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item,index) => item && typeof item === "object" && "role" in item && "text" in item && (item.role === "madina" || item.role === "customer") && typeof item.text === "string" ? [{ id:`message-${index}`, role:item.role, text:item.text }] : []);
}
function seller(agent: SalesAgent | null) { return agent ? [agent.firstName,agent.lastName].filter(Boolean).join(" ") : ""; }
function metadata(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {}; }
function timelineDetail(type: LeadActivityType, comment: string | null, value: unknown) {
  if (comment) return comment;
  const data = metadata(value);
  if (typeof data.label === "string") return `Natija: ${data.label}`;
  if (typeof data.scheduledFor === "string") return new Intl.DateTimeFormat("uz-UZ", { timeZone:"Asia/Tashkent", dateStyle:"medium", timeStyle:"short" }).format(new Date(data.scheduledFor));
  return type === "SALE_REPORTED" ? "Marja berilmadi — admin tasdig‘i keyingi bosqichda." : "";
}

export async function getAdminLeads() {
  await requireAdmin();
  const rows = await getDb().lead.findMany({
    orderBy:{createdAt:"desc"},
    include:{
      assignedAgent:true,
      activities:{ orderBy:{createdAt:"asc"}, include:{agent:true} },
      followUps:{ where:{status:{in:["SCHEDULED","REMINDER_RESERVED","REMINDER_SENT"]}}, orderBy:{scheduledFor:"asc"}, take:1 },
    },
  });
  return rows.map((row): Lead => {
    const now = new Date(), date = new Date(row.createdAt);
    const formatDay = (value:Date) => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tashkent"}).format(value);
    const today=formatDay(now), day=formatDay(date), yesterday=formatDay(new Date(now.getTime()-86400000));
    const contact = [...row.activities].reverse().find((item) => item.type === "CONTACTED");
    const next = row.followUps[0];
    const activities: LeadTimelineItem[] = row.activities.map((item) => ({
      id:item.id, type:item.type, title:activityLabels[item.type],
      detail:timelineDetail(item.type,item.comment,item.metadata), createdAt:item.createdAt.toISOString(), agentName:seller(item.agent),
    }));
    if (!activities.some((item) => item.type === "LEAD_CREATED")) activities.unshift({ id:`created-${row.id}`, type:"LEAD_CREATED", title:"Madina yangi murojaat yaratdi", detail:"", createdAt:row.createdAt.toISOString(), agentName:"" });
    return {
      id:row.id, customerName:row.customerName||"Noma’lum mijoz", phone:row.phone||"", telegram:row.telegram||"",
      requestType:row.requestType, product:row.product||"", dimensions:row.dimensions||"", capacity:row.capacity||"", temperature:row.temperature||"", region:row.region||"",
      dateLabel:new Intl.DateTimeFormat("uz-UZ",{timeZone:"Asia/Tashkent",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(date),
      dateGroup:day===today?"today":day===yesterday?"yesterday":"week", status:statusMap[row.status] as LeadStatus, source:sourceMap[row.source] as LeadSource,
      isUnread:row.status==="NEW", additional:row.notes||"", summary:row.aiSummary||"", conversation:conversation(row.chatHistory), managerNote:row.managerNote||"", createdAt:row.createdAt.toISOString(),
      assignedAgentName:seller(row.assignedAgent), claimedAt:row.claimedAt?row.claimedAt.toISOString():"", privateDeliveryFailed:Boolean(row.telegramPrivateDeliveryFailedAt),
      lastContact:contact?.createdAt.toISOString()||"", nextFollowUp:next?.scheduledFor.toISOString()||"", followUpOverdue:Boolean(next&&next.scheduledFor.getTime()<now.getTime()), timeline:activities,
    };
  });
}
