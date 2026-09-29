import { getAdminSession } from "@/lib/auth/session";
import { PRODUCT_AGENT_MAX_TOTAL_BYTES, PRODUCT_AGENT_REFUSAL, ProductAgentProviderError, ProductAgentUploadError, isProductAgentOffDomain, productAgentRequestSchema, validateProductAgentUploads } from "@/lib/ai-office/product-agent";
import { runProductAgentLoop } from "@/lib/ai-office/product-agent-loop";
import { buildProductPreview, signPreview } from "@/lib/ai-office/product-agent-preview";
import { getActivePriceList, saveActivePriceList } from "@/lib/ai-office/price-list-parser";

export const runtime = "nodejs";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Avtorizatsiya talab qilinadi." }, { status: 401 });
  const active = await getActivePriceList();
  return Response.json({ activePriceList: active ? `${active.filename} (${active.sheetName}, ${active.blockLabel})` : null });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Avtorizatsiya talab qilinadi." }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > PRODUCT_AGENT_MAX_TOTAL_BYTES + 512_000) return Response.json({ error: "So'rov hajmi 20 MB limitdan oshdi." }, { status: 413 });
  try {
    const form = await request.formData();
    const rawHistory = form.get("history");
    let history: unknown = [];
    if (typeof rawHistory === "string") {
      try { history = JSON.parse(rawHistory); }
      catch { return Response.json({ error: "Chat tarixi noto'g'ri." }, { status: 400 }); }
    }
    const parsed = productAgentRequestSchema.safeParse({ message: form.get("message"), history });
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "Xabarni tekshiring." }, { status: 400 });
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    const uploads = await validateProductAgentUploads(files);
    if (isProductAgentOffDomain(parsed.data.message)) return Response.json({ reply: PRODUCT_AGENT_REFUSAL, status: "idle" });

    const xlsx = uploads.find(file => file.mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (xlsx) await saveActivePriceList(xlsx.name, xlsx.bytes, session.user.id);
    const active = await getActivePriceList();
    const otherUploads = uploads.filter(file => file !== xlsx);
    if (otherUploads.length) {
      if (!process.env.OPENAI_API_KEY) return Response.json({ error: "OpenAI API sozlanmagan." }, { status: 503 });
      const { payload, note } = await buildProductPreview({ message: parsed.data.message, attachments: otherUploads, adminId: session.user.id, sessionId: session.id });
      return Response.json({ reply: note || `${payload.rows.length} ta qator preview uchun tayyorlandi.`, status: "awaiting_confirmation", preview: payload, previewToken: signPreview(payload, session.tokenHash), activePriceList: active ? `${active.filename} (${active.sheetName}, ${active.blockLabel})` : null });
    }

    const response = await runProductAgentLoop({ ...parsed.data, adminId: session.user.id, sessionId: session.id, actor: session.user });
    return Response.json({ ...response, preview: response.payload, payload: undefined, previewToken: response.payload ? signPreview(response.payload, session.tokenHash) : undefined, activePriceList: active ? `${active.filename} (${active.sheetName}, ${active.blockLabel})` : null });
  } catch (error) {
    if (error instanceof ProductAgentUploadError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof ProductAgentProviderError && error.message === "OPENAI_NOT_CONFIGURED") return Response.json({ error: "OpenAI API sozlanmagan." }, { status: 503 });
    console.error("Product Agent request failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Mahsulot agenti vaqtincha javob bera olmadi." }, { status: 500 });
  }
}
