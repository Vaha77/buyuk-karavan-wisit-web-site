import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { telegramWebhookSecret } from "@/lib/telegram/client";
import { processDueFollowUps } from "@/lib/telegram/reminders";

export const runtime = "nodejs";

function validSecret(received: string | null) {
  try {
    if (!received) return false;
    const expected = Buffer.from(telegramWebhookSecret());
    const actual = Buffer.from(received);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!validSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await processDueFollowUps();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Follow-up worker failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
