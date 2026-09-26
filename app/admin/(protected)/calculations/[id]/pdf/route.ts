import { getCalculation } from "@/lib/calculations/queries";
import { renderProposalPdf } from "@/lib/calculations/proposal-pdf";
import { getUsdUzsRate } from "@/lib/currency/cbu";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function filename(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "tijorat-taklifi"
  );
}
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params,
    [draft, rate] = await Promise.all([getCalculation(id), getUsdUzsRate()]);
  if (!draft) return new Response("Taklif topilmadi.", { status: 404 });
  try {
    const stream = await renderProposalPdf(
        draft,
        rate ? Number(rate.rate) : null,
      ),
      chunks: Uint8Array[] = [];
    for await (const chunk of stream)
      chunks.push(
        typeof chunk === "string"
          ? new TextEncoder().encode(chunk)
          : new Uint8Array(chunk),
      );
    const body = Buffer.concat(chunks.map((x) => Buffer.from(x))),
      inline = new URL(request.url).searchParams.get("inline") === "1",
      name = filename(`${draft.proposalNumber}-${draft.customerName}`);
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}.pdf"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[CalculationPdf]", {
      calculationId: id,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return new Response("PDF yaratishda xatolik yuz berdi.", { status: 500 });
  }
}
