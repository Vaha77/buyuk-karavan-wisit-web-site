import { NextResponse } from "next/server";
import { handleQueueCron } from "@/lib/instagram/queue-cron";
import { processQueue } from "@/lib/instagram/service";

export const runtime = "nodejs";
// 50 s budget + the reply in flight when it ends (Graph calls time out at 15 s each).
export const maxDuration = 90;

/**
 * Instagram reply queue only (no token refresh, no catch-up): GitHub Actions calls it every 10 minutes
 * (.github/workflows/instagram-queue-cron.yml) with "Authorization: Bearer $CRON_SECRET". An empty queue answers at once.
 */
export async function GET(request: Request) {
  const result = await handleQueueCron(request.headers.get("authorization"), process.env.CRON_SECRET, () => processQueue({ budgetMs: 50_000 }));
  return NextResponse.json(result.body, { status: result.status });
}
