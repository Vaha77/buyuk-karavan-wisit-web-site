import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { refreshAllInsights } from "@/lib/instagram/insights";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel Cron (vercel.json, daily 01:00 UTC = 06:00 Tashkent): Instagram statistics of every connected account.
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(secret), received = Buffer.from(header.slice(7));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ ok: false }, { status: 401 });
  const results = await refreshAllInsights();
  return NextResponse.json({ ok: results.some(result => result.ok), accounts: results.map(result => ({ account: result.account, ok: result.ok, days: result.days, media: result.media, audience: result.audience, errors: result.errors.length })) });
}
