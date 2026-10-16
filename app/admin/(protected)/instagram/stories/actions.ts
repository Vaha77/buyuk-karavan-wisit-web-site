"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-admin";
import { intakeKey } from "@/lib/stories/intake";
import { MAX_VIDEO_BYTES, parseScheduledAt, scheduleError } from "@/lib/stories/rules";
import { approveStory, publishNow, rejectStory, rescheduleStory, resolveStoryAccount } from "@/lib/stories/service";
import { createStoryUpload } from "@/lib/stories/storage";

export type StoryActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const refresh = () => revalidatePath("/admin/instagram/stories");
const actor = async () => { const user = await requireRole("SUPER_ADMIN"); return { id: user.id, name: user.name }; };
const result = (value: { ok: true } | { ok: false; error: string }, message: string): StoryActionResult => { refresh(); return value.ok ? { ok: true, message } : value; };

/** "Video yuklash", step 1: a 10-minute presigned PUT (the browser uploads straight to the storage, any size up to 100 MB). */
export async function createStoryUploadAction(size: number) {
  await actor();
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_VIDEO_BYTES) return { ok: false as const, error: "Video 100 MB gacha bo‘lsin." };
  try { return { ok: true as const, ...(await createStoryUpload(size)) }; }
  catch { return { ok: false as const, error: "Storage sozlanmagan." }; }
}

/** Step 2: check the uploaded MP4 and queue it as PENDING_APPROVAL (it goes to the BK bot for approval). */
export async function registerStoryAction(input: { key: string; scheduledAt: string; caption: string; accountId: string }): Promise<StoryActionResult> {
  await actor();
  const accountId = await resolveStoryAccount(input.accountId);
  if (!accountId) return { ok: false, error: "Akkaunt topilmadi." };
  const added = await intakeKey(input.key, input.scheduledAt, input.caption, accountId).catch(() => ({ ok: false as const, status: 500, error: "Saqlab bo‘lmadi." }));
  refresh();
  return added.ok ? { ok: true, id: added.id, message: "Navbatga qo‘shildi · botga tasdiqlashga ketdi" } : { ok: false, error: added.error };
}

export async function approveStoryAction(id: string) { return result(await approveStory(id, await actor()), "Tasdiqlandi ✓"); }
export async function rejectStoryAction(id: string) { return result(await rejectStory(id, await actor()), "Rad etildi"); }
export async function rescheduleStoryAction(id: string, scheduledAt: string): Promise<StoryActionResult> {
  const who = await actor();
  const at = parseScheduledAt(scheduledAt);
  if (!at) return { ok: false, error: "Vaqtni tanlang." };
  const error = scheduleError(at);
  if (error) return { ok: false, error };
  return result(await rescheduleStory(id, at, who), "Vaqt o‘zgartirildi ✓");
}
/** "Hozir joylash" (sinov): an APPROVED story is published now. */
export async function publishNowAction(id: string): Promise<StoryActionResult> {
  const outcome = await publishNow(id, await actor());
  refresh();
  return outcome;
}
