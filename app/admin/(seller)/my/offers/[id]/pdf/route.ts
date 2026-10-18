import { requireSeller } from "@/lib/auth/require-admin";
import { offerPdf } from "@/lib/offers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "PDF yuklash": only the seller's own offer (another id → 404). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user } = await requireSeller();
  const file = await offerPdf(user, (await context.params).id);
  if (!file) return new Response("Taklif topilmadi.", { status: 404 });
  return new Response(new Uint8Array(file.buffer), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${file.filename}"`, "cache-control": "private, no-store" } });
}
