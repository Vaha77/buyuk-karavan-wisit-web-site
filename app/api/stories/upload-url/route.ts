import { NextResponse } from "next/server";
import { createStoryUpload } from "@/lib/stories/storage";
import { bearerMatches } from "@/lib/stories/auth";
import { MAX_VIDEO_BYTES } from "@/lib/stories/rules";

export const runtime = "nodejs";

/**
 * Step 1 for big files (Bearer STORY_QUEUE_TOKEN): { size } → { key, uploadUrl, headers }. PUT the MP4 there within
 * 10 minutes with those headers, then POST /api/stories/queue { videoKey: key, scheduledAt, caption }.
 */
export async function POST(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.STORY_QUEUE_TOKEN)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { size?: unknown } | null;
  const size = Number(body?.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_VIDEO_BYTES) return NextResponse.json({ error: "size: 1 … 100 MB" }, { status: 400 });
  try { return NextResponse.json(await createStoryUpload(size)); }
  catch (error) {
    console.error("Story upload URL failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Storage sozlanmagan." }, { status: 500 });
  }
}
