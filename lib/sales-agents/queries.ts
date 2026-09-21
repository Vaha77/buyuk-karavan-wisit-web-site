import "server-only";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
export type AdminSalesAgent={id:string;name:string;username:string;isApproved:boolean;isActive:boolean;createdAt:string};
export async function getAdminSalesAgents():Promise<AdminSalesAgent[]>{await requireAdmin();const rows=await getDb().salesAgent.findMany({orderBy:{createdAt:"desc"}});return rows.map(row=>({id:row.id,name:[row.firstName,row.lastName].filter(Boolean).join(" "),username:row.telegramUsername?`@${row.telegramUsername}`:"—",isApproved:row.isApproved,isActive:row.isActive,createdAt:new Intl.DateTimeFormat("uz-UZ",{timeZone:"Asia/Tashkent",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(row.createdAt)}));}
