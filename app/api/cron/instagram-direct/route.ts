import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { directTick } from "@/lib/instagram/direct";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Instagram Direct tick: 30 min / 2 h reminders, the 09:00 digest and the 20:00 report — whatever is due (idempotent).
 * Vercel Cron calls it at 09:00 and 20:00 Tashkent (Hobby: daily only, ±59 min). For on-time reminders call it every
 * 5 minutes from an external scheduler with "Authorization: Bearer $CRON_SECRET": GitHub Actions does it
 * (.github/workflows/instagram-direct-cron.yml, secret CRON_SECRET). Wrong / missing secret → 401, error → 500.
 */
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(secret), received = Buffer.from(header.slice(7));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await directTick({ force: true })) });
  } catch (error) {
    console.error("Instagram Direct cron failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
