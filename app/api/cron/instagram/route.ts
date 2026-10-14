import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processQueue, refreshTokenIfDue, syncMissedComments } from "@/lib/instagram/service";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron (vercel.json, hourly): refreshes the Instagram token before it expires, picks up comments the webhook missed
// (last 7 days of the latest 25 posts) and sends queued replies / retries.
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(secret), received = Buffer.from(header.slice(7));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ ok: false }, { status: 401 });
  const token = await refreshTokenIfDue().catch(error => {
    console.error("Instagram token refresh failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return { refreshed: false, reason: "error" };
  });
  const started = Date.now();
  const sync = await syncMissedComments({ days: 7, mediaLimit: 25 }).catch(error => {
    console.error("Instagram catch-up failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return { ok: false, reason: "error" } as const;
  });
  const queue = await processQueue({ budgetMs: Math.max(20_000, 45_000 - (Date.now() - started)) });
  return NextResponse.json({ ok: true, token, sync, queue });
}
