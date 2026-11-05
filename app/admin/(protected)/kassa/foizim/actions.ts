"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { deleteCommission, deleteShortage, restoreAny, saveCommission, saveShortage } from "@/lib/foizim/rules";

const done = <T>(result: T) => { revalidatePath("/admin/kassa/foizim"); revalidatePath("/admin/sales-plan"); return result; };

export async function saveCommissionAction(form: FormData) {
  const user = await requireRole("SUPER_ADMIN");
  return done(await saveCommission(getDb(), user.id, Object.fromEntries(form)));
}

export async function deleteCommissionAction(id: string, reason: string) {
  const user = await requireRole("SUPER_ADMIN");
  return done(await deleteCommission(getDb(), user.id, id, reason));
}

export async function saveShortageAction(form: FormData) {
  const user = await requireRole("SUPER_ADMIN");
  return done(await saveShortage(getDb(), user.id, Object.fromEntries(form)));
}

export async function deleteShortageAction(id: string, reason: string) {
  const user = await requireRole("SUPER_ADMIN");
  return done(await deleteShortage(getDb(), user.id, id, reason));
}

/** The undo toast: a kirim/chiqim or a kamomat row. */
export async function restoreFoizimAction(id: string) {
  const user = await requireRole("SUPER_ADMIN");
  return done(await restoreAny(getDb(), user.id, id));
}
