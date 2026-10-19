import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { closeMonths } from "@/lib/sex/month";

export const runtime = "nodejs";

// Vercel Cron: daily 19:01 UTC = 00:01 Tashkent. Backup of the lazy month close (lib/sex/month.ts); a no-op on other days.
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(secret), received = Buffer.from(header.slice(7));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, carried: await closeMonths() });
  } catch (error) {
    console.error("Seh month close failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
