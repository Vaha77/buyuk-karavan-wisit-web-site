"use server";
import {revalidatePath} from "next/cache";import {requireAdmin} from "@/lib/auth/require-admin";import {approveSale,rejectSale} from "@/lib/crm/sales";
export async function approveSaleAction(formData:FormData){const admin=await requireAdmin();await approveSale(String(formData.get("id")||""),admin.id);revalidatePath("/admin/sales");revalidatePath("/admin/leads");}
export async function rejectSaleAction(formData:FormData){const admin=await requireAdmin();await rejectSale(String(formData.get("id")||""),admin.id,String(formData.get("reason")||""));revalidatePath("/admin/sales");revalidatePath("/admin/leads");}
