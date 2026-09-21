"use server";
import { revalidatePath } from "next/cache";import { requireAdmin } from "@/lib/auth/require-admin";import { getDb } from "@/lib/db";
export async function approveSalesAgentAction(id:string){await requireAdmin();try{await getDb().salesAgent.update({where:{id},data:{isApproved:true,isActive:true}});revalidatePath("/admin/sales-agents");return{};}catch{return{error:"Sotuvchini tasdiqlab bo‘lmadi."};}}
export async function toggleSalesAgentAction(id:string){await requireAdmin();try{const row=await getDb().salesAgent.findUnique({where:{id}});if(!row)return{error:"Sotuvchi topilmadi."};await getDb().salesAgent.update({where:{id},data:{isActive:!row.isActive}});revalidatePath("/admin/sales-agents");return{};}catch{return{error:"Holatni yangilab bo‘lmadi."};}}
