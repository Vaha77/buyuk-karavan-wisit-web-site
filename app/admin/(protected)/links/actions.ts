"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireAdmin, requireRole } from "@/lib/auth/require-admin";
import { createReferralLink, deleteReferralLink, isSlugAvailable, ReferralLinkError, setReferralLinkStatus, updateReferralLink, type LinkInput } from "@/lib/referrals/mutations";

export type LinkActionResult = { ok: true; id: string } | { ok: false; error: string };
function failure(error: unknown): LinkActionResult {
  if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message || "Ma’lumotlarni tekshiring." };
  if (error instanceof ReferralLinkError) return { ok: false, error: error.message };
  console.error("[ReferralLinkAction]", { name: error instanceof Error ? error.name : "UnknownError" });
  return { ok: false, error: "Saqlab bo‘lmadi. Qayta urinib ko‘ring." };
}
function refresh(id?: string) { revalidatePath("/admin/links"); revalidatePath("/admin"); if (id) revalidatePath(`/admin/links/${id}`); }

export async function checkSlugAction(slug: string, excludeId?: string) { await requireAdmin(); return isSlugAvailable(slug.trim().toLowerCase(), excludeId); }

export async function createLinkAction(input: LinkInput): Promise<LinkActionResult> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  try { const link = await createReferralLink(input, actor); refresh(link.id); return { ok: true, id: link.id }; } catch (error) { return failure(error); }
}
export async function updateLinkAction(id: string, input: LinkInput): Promise<LinkActionResult> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  try { await updateReferralLink(id, input, actor); refresh(id); return { ok: true, id }; } catch (error) { return failure(error); }
}
export async function setLinkStatusAction(id: string, status: "ACTIVE" | "PAUSED"): Promise<LinkActionResult> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  try { await setReferralLinkStatus(id, status, actor); refresh(id); return { ok: true, id }; } catch (error) { return failure(error); }
}
export async function deleteLinkAction(id: string): Promise<LinkActionResult> {
  const actor = await requireRole("SUPER_ADMIN", "ADMIN");
  try { await deleteReferralLink(id, actor); refresh(); return { ok: true, id }; } catch (error) { return failure(error); }
}
