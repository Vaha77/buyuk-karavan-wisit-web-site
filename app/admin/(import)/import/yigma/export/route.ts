import { requireRole } from "@/lib/auth/require-admin";
import { buildImportWorkbook } from "@/lib/import/excel";
import { summarize } from "@/lib/import/rules";
import { ordersWithStatus } from "@/lib/import/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const seenAt = (at: string | null) => { const date = at ? new Date(Number(at)) : null; return date && !Number.isNaN(date.getTime()) ? date : undefined; };

/** Boss: APPROVED import orders by catalog, with prices (Super Admin only). */
export async function GET(request: Request) {
  await requireRole("SUPER_ADMIN");
  const day = new Date().toISOString().slice(0, 10);
  const workbook = buildImportWorkbook(summarize(await ordersWithStatus("APPROVED", seenAt(new URL(request.url).searchParams.get("at")))), `Import yig‘ma — ${day}`);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="import-yigma-${day}.xlsx"`, "cache-control": "private, no-store" } });
}
