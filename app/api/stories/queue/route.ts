import { NextResponse } from "next/server";
import { intakeBytes, intakeKey } from "@/lib/stories/intake";
import { bearerMatches } from "@/lib/stories/auth";
import { MAX_VIDEO_BYTES } from "@/lib/stories/rules";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Adds a story to the queue (PENDING_APPROVAL → Super Admin approves in Telegram). Authorization: Bearer STORY_QUEUE_TOKEN.
 *  • multipart/form-data: file (MP4), scheduledAt ("2026-10-12T11:00" Tashkent or ISO), izoh / caption
 *  • application/json: { videoKey, scheduledAt, caption } after uploading through POST /api/stories/upload-url — for
 *    files over the ~4.5 MB request body limit of Vercel functions (up to 100 MB)
 * Answers { id }.
 */
export async function POST(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.STORY_QUEUE_TOKEN)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") || 0) > MAX_VIDEO_BYTES + 1_000_000) return NextResponse.json({ error: "Video 100 MB dan katta." }, { status: 413 });
  try {
    const type = request.headers.get("content-type") ?? "";
    let result;
    if (type.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file") ?? form.get("video");
      if (!(file instanceof File)) return NextResponse.json({ error: "file (MP4) yuborilmadi." }, { status: 400 });
      if (file.size > MAX_VIDEO_BYTES) return NextResponse.json({ error: "Video 100 MB dan katta." }, { status: 413 });
      result = await intakeBytes(new Uint8Array(await file.arrayBuffer()), form.get("scheduledAt"), form.get("izoh") ?? form.get("caption"));
    } else if (type.includes("application/json")) {
      const body = await request.json().catch(() => null) as { videoKey?: unknown; scheduledAt?: unknown; caption?: unknown; izoh?: unknown } | null;
      if (!body) return NextResponse.json({ error: "JSON noto‘g‘ri." }, { status: 400 });
      result = await intakeKey(body.videoKey, body.scheduledAt, body.izoh ?? body.caption);
    } else return NextResponse.json({ error: "multipart/form-data yoki application/json yuboring." }, { status: 415 });
    return result.ok ? NextResponse.json({ id: result.id }, { status: 201 }) : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (error) {
    console.error("Story queue failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Saqlab bo‘lmadi." }, { status: 500 });
  }
}
