import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { refreshInsights } from "@/lib/instagram/insights";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel Cron (vercel.json, daily 01:00 UTC = 06:00 Tashkent): Instagram statistics.
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(secret), received = Buffer.from(header.slice(7));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ ok: false }, { status: 401 });
  const result = await refreshInsights();
  return NextResponse.json({ ok: result.ok, days: result.days, media: result.media, audience: result.audience, errors: result.errors.length });
}
