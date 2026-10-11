import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processQueue, refreshTokenIfDue } from "@/lib/instagram/service";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron (vercel.json, daily): refreshes the Instagram token before it expires and sends queued retries.
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
  const queue = await processQueue({ budgetMs: 45_000 });
  return NextResponse.json({ ok: true, token, queue });
}
