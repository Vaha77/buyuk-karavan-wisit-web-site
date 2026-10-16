import "server-only";
// Shared by POST /api/stories/queue (token) and the admin "Video yuklash" form (session): check the MP4, store it with a
// public URL, enqueue it as PENDING_APPROVAL (→ Telegram approval).
import { checkStoryVideo, parseScheduledAt, scheduleError } from "./rules";
import { enqueueStory } from "./service";
import { deleteStoryVideo, putStoryVideo, readStoryVideo } from "./storage";

export type IntakeResult = { ok: true; id: string } | { ok: false; status: number; error: string };
const cleanCaption = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 1000) : null;

function when(raw: unknown): { ok: true; at: Date } | { ok: false; status: number; error: string } {
  const at = parseScheduledAt(typeof raw === "string" ? raw : null);
  if (!at) return { ok: false, status: 400, error: "scheduledAt noto‘g‘ri: 2026-10-12T11:00 (Toshkent) yoki ISO vaqt." };
  const error = scheduleError(at);
  return error ? { ok: false, status: 400, error } : { ok: true, at };
}

/** The file came in the request body. */
export async function intakeBytes(bytes: Uint8Array, scheduledAt: unknown, caption: unknown, accountId: string): Promise<IntakeResult> {
  const time = when(scheduledAt);
  if (!time.ok) return time;
  const check = checkStoryVideo(bytes);
  if (!check.ok) return { ok: false, status: 400, error: check.error };
  const stored = await putStoryVideo(bytes);
  const item = await enqueueStory({ accountId, videoUrl: stored.url, videoKey: stored.key, scheduledAt: time.at, caption: cleanCaption(caption), sizeBytes: bytes.byteLength, info: check.info });
  return { ok: true, id: item.id };
}

/** The file was uploaded to a presigned URL first; a bad file is deleted from the storage. */
export async function intakeKey(key: unknown, scheduledAt: unknown, caption: unknown, accountId: string): Promise<IntakeResult> {
  const time = when(scheduledAt);
  if (!time.ok) return time;
  const object = typeof key === "string" ? await readStoryVideo(key) : null;
  if (!object) return { ok: false, status: 400, error: "Yuklangan video topilmadi (videoKey)." };
  const check = checkStoryVideo(object.bytes, object.size);
  if (!check.ok) { await deleteStoryVideo(key as string); return { ok: false, status: 400, error: check.error }; }
  const item = await enqueueStory({ accountId, videoUrl: object.url, videoKey: key as string, scheduledAt: time.at, caption: cleanCaption(caption), sizeBytes: object.size, info: check.info });
  return { ok: true, id: item.id };
}
