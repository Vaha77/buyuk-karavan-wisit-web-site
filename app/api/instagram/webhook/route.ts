import { after, NextResponse } from "next/server";
import { appConfig } from "@/lib/instagram/graph";
import { verifyChallenge } from "@/lib/instagram/rules";
import { handleWebhookPost } from "@/lib/instagram/webhook-handler";
import { afterNotification, ingestNotification } from "@/lib/instagram/service";

export const runtime = "nodejs";
// Replies are sent after the 200 (next/server `after`), 8–25 s apart, within this route's duration.
export const maxDuration = 300;

/** Meta's subscription check: echo hub.challenge when hub.verify_token matches INSTAGRAM_WEBHOOK_VERIFY_TOKEN. */
export function GET(request: Request) {
  const challenge = verifyChallenge(new URL(request.url).searchParams, appConfig().verifyToken);
  if (challenge === null) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
}

/**
 * Comment / Direct notifications. X-Hub-Signature-256 (HMAC-SHA256 of the raw body with INSTAGRAM_APP_SECRET) must match,
 * else 401. Only the rows are written before answering (comment id = unique, so a repeated delivery does nothing); all
 * other work runs after the response (lib/instagram/webhook-handler.ts), so Meta gets its 200 at once. A database error
 * returns 500 so Meta retries the delivery.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 1_000_000) return NextResponse.json({ ok: false }, { status: 413 });
  const raw = Buffer.from(await request.arrayBuffer());
  const response = await handleWebhookPost(raw, request.headers.get("x-hub-signature-256"), { appSecret: appConfig().appSecret, ingest: ingestNotification, background: afterNotification, schedule: after, log: console.error });
  return NextResponse.json(response.body, { status: response.status });
}
