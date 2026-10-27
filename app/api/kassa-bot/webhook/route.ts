import { after, NextResponse } from "next/server";
import { kassaBot } from "@/lib/kassa/bot";
import type { TgUpdate } from "@/lib/kassa/bot-core";

export const runtime = "nodejs";
// Voice download + transcription + analysis run in after(), past the immediate 200.
export const maxDuration = 60;

export async function POST(request: Request) {
  const update = await request.json().catch(() => null) as TgUpdate | null;
  const { status, run } = await kassaBot().receive(request.headers.get("x-telegram-bot-api-secret-token"), update);
  if (run) after(() => run().catch(error => console.error("Kassa bot update failed", { type: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : undefined })));
  return NextResponse.json({ ok: status === 200 }, { status });
}
