import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendSellerReminders } from "@/lib/customers/reminders";
import { remindUnreceived } from "@/lib/sex/service";

export const runtime = "nodejs";

// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET" (schedule in vercel.json: 04:00 UTC = 09:00 Tashkent).
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(secret), received = Buffer.from(header.slice(7));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    // Also: Seh orders issued over 24 h ago and not yet taken into the store → Super Admin (once per order).
    const unreceived = await remindUnreceived().catch(error => { console.error("Store reminder failed", { type: error instanceof Error ? error.name : "UnknownError" }); return -1; });
    return NextResponse.json({ ok: true, ...(await sendSellerReminders()), unreceived });
  } catch (error) {
    console.error("Seller reminders failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
