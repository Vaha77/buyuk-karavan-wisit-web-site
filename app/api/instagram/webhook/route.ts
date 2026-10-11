import { after, NextResponse } from "next/server";
import { appConfig } from "@/lib/instagram/graph";
import { validSignature, verifyChallenge } from "@/lib/instagram/rules";
import { ingestNotification, processQueue } from "@/lib/instagram/service";

export const runtime = "nodejs";
// Private Replies are sent after the 200 (next/server `after`), within this route's duration.
export const maxDuration = 60;

/** Meta's subscription check: echo hub.challenge when hub.verify_token matches INSTAGRAM_WEBHOOK_VERIFY_TOKEN. */
export function GET(request: Request) {
  const challenge = verifyChallenge(new URL(request.url).searchParams, appConfig().verifyToken);
  if (challenge === null) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
}

/**
 * Comment / Direct notifications. X-Hub-Signature-256 (HMAC-SHA256 of the raw body with INSTAGRAM_APP_SECRET) must match,
 * else 401. Rows are written right away (comment id = unique, so a repeated delivery does nothing); sending is done in
 * the background so Meta gets a fast 200. A database error returns 500 so Meta retries the delivery.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 1_000_000) return NextResponse.json({ ok: false }, { status: 413 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), appConfig().appSecret)) return NextResponse.json({ ok: false }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  try {
    const result = await ingestNotification(payload);
    if (result && (result.queued.length || result.generalReplies.length)) after(() => processQueue({ limit: 10, generalReplies: result.generalReplies }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Instagram webhook failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
