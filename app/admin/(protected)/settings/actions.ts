"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-admin";
import { writeAudit } from "@/lib/audit/service";
import { getDb } from "@/lib/db";
import { DEFAULT_WORKSHOP_DAILY_LIMIT } from "@/lib/sex/rules";
import { sendGroupTest } from "@/lib/sex/bot";

/** Seh daily start limit (a warning on the workshop panel, never a block). */
export async function saveWorkshopLimitAction(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { ok: false, error: "Limit 1 dan 100 gacha butun son bo‘lsin." };
  const previous = await getDb().siteSettings.findUnique({ where: { id: "global" }, select: { workshopDailyLimit: true } });
  await getDb().siteSettings.upsert({ where: { id: "global" }, create: { id: "global", workshopDailyLimit: limit }, update: { workshopDailyLimit: limit } });
  await writeAudit(actor, { action: "UPDATE", entityType: "SITE_SETTINGS", entityId: "global", entityName: "Seh kunlik limiti", summary: `Seh kunlik limitini ${previous?.workshopDailyLimit ?? DEFAULT_WORKSHOP_DAILY_LIMIT} → ${limit} qildi`, before: { workshopDailyLimit: previous?.workshopDailyLimit ?? DEFAULT_WORKSHOP_DAILY_LIMIT }, after: { workshopDailyLimit: limit } });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/seh");
  return { ok: true };
}

/** "Seh guruhiga test xabar". */
export async function sendSehGroupTestAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole("SUPER_ADMIN", "ADMIN");
  return sendGroupTest();
}
