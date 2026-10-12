import { NextResponse } from "next/server";
import { runStoryCron } from "@/lib/stories/service";
import { bearerMatches } from "@/lib/stories/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Stories: expire unapproved ones after 18:00, publish approved ones that are due (container → FINISHED → media_publish).
 * Every 10 minutes from GitHub Actions (.github/workflows/instagram-stories-cron.yml) with "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runStoryCron()) }); }
  catch (error) {
    console.error("Story cron failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
