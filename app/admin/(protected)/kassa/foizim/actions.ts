"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { deleteCommission, restoreCommission, saveCommission } from "@/lib/foizim/rules";

export async function saveCommissionAction(form: FormData) {
  const user = await requireRole("SUPER_ADMIN");
  const result = await saveCommission(getDb(), user.id, Object.fromEntries(form));
  revalidatePath("/admin/kassa/foizim");
  return result;
}

export async function deleteCommissionAction(id: string, reason: string) {
  const user = await requireRole("SUPER_ADMIN");
  const result = await deleteCommission(getDb(), user.id, id, reason);
  revalidatePath("/admin/kassa/foizim");
  return result;
}

export async function restoreCommissionAction(id: string) {
  const user = await requireRole("SUPER_ADMIN");
  const result = await restoreCommission(getDb(), user.id, id);
  revalidatePath("/admin/kassa/foizim");
  return result;
}
