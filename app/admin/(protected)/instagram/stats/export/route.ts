import { requireRole } from "@/lib/auth/require-admin";
import { PERIODS, type Period } from "@/lib/instagram/insights-rules";
import { buildStatsWorkbook } from "@/lib/instagram/stats-excel";
import { getStatsBoard } from "@/lib/instagram/stats-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Excel yuklab olish" on the Statistika tab, for the selected period. */
export async function GET(request: Request) {
  await requireRole("SUPER_ADMIN", "ADMIN");
  const raw = new URL(request.url).searchParams.get("period") ?? "30";
  const period: Period = raw in PERIODS ? raw as Period : "30";
  const board = await getStatsBoard(period);
  const buffer = await buildStatsWorkbook(board).xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="instagram-statistika-${board.range.from}_${board.range.to}.xlsx"`, "cache-control": "private, no-store" } });
}
