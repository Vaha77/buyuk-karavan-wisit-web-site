import { getPublicCatalogPage } from "@/lib/products/queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const result = await getPublicCatalogPage({ category: params.get("category") || "all", q: params.get("q") || "", cursor: params.get("cursor"), seed: params.get("seed") || undefined });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Public product catalog failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Mahsulotlarni yuklab bo'lmadi." }, { status: 500 });
  }
}
