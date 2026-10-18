import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendWeeklySummaries } from "@/lib/customers/reminders";

export const runtime = "nodejs";

// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET" (vercel.json: daily 03:00 UTC = 08:00 Tashkent — Hobby allows daily crons only; it sends on Mondays).
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(secret), received = Buffer.from(header.slice(7));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    // Monday in Tashkent (UTC+5): 03:00 UTC is still the same calendar day there.
    if (new Date(Date.now() + 5 * 3_600_000).getUTCDay() !== 1) return NextResponse.json({ ok: true, skipped: "not Monday" });
    return NextResponse.json({ ok: true, ...(await sendWeeklySummaries()) });
  } catch (error) {
    console.error("Seller weekly summary failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
