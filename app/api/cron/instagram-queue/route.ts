import { NextResponse } from "next/server";
import { handleQueueCron } from "@/lib/instagram/queue-cron";
import { processQueue, syncAllMissedComments } from "@/lib/instagram/service";

export const runtime = "nodejs";
// 50 s budget + the reply in flight when it ends (Graph calls time out at 15 s each).
export const maxDuration = 90;

/**
 * Every 10 minutes (Vercel Cron and .github/workflows/instagram-queue-cron.yml, "Authorization: Bearer $CRON_SECRET"):
 * comments of the latest 5 posts the webhook missed (a known comment id does nothing, our own are ignored), then the
 * reply queue. No token refresh.
 */
export async function GET(request: Request) {
  const result = await handleQueueCron(request.headers.get("authorization"), process.env.CRON_SECRET, async () => ({ catchUp: await syncAllMissedComments({ mediaLimit: 5 }), ...await processQueue({ budgetMs: 50_000 }) }));
  return NextResponse.json(result.body, { status: result.status });
}
