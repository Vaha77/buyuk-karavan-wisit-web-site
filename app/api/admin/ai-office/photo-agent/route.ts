import { getAdminSession } from "@/lib/auth/session";
import { buildPhotoPreview, findProducts, PhotoAgentUserError, prepareUpload, processPhotos, recommendCandidate, signPhotoPreview, validatePhotoAgentFiles } from "@/lib/ai-office/photo-agent";
import { isPhotoAgentOffDomain, narrowPhotoCandidates, orderChoices, PHOTO_AGENT_NEEDS_IMAGE, PHOTO_AGENT_NOT_FOUND, PHOTO_AGENT_REFUSAL, photoSearchText, wantsMainPlacement } from "@/lib/ai-office/photo-agent-rules";

export const runtime = "nodejs";
// 90 s image budget plus upload/HEIC/response overhead.
export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Avtorizatsiya talab qilinadi." }, { status: 401 });
  try {
    const form = await request.formData();
    const message = String(form.get("message") || "").trim().slice(0, 500);
    // Domain gate runs on the server before anything else.
    if (isPhotoAgentOffDomain(message)) return Response.json({ reply: PHOTO_AGENT_REFUSAL, status: "idle" });
    const files = form.getAll("images").filter((item): item is File => item instanceof File && item.size > 0);
    if (!files.length) return Response.json({ reply: PHOTO_AGENT_NEEDS_IMAGE, status: "idle" });
    validatePhotoAgentFiles(files);
    const search = photoSearchText(message);
    if (!search) return Response.json({ reply: "Qaysi mahsulot? Modelni yozing, masalan: BR +20PG vazdushniy agregat.", status: "idle" });

    const found = await findProducts(search);
    if (!found.length) return Response.json({ reply: PHOTO_AGENT_NOT_FOUND, status: "idle" });
    const selectedId = String(form.get("productId") || "");
    const narrowed = narrowPhotoCandidates(found, message);
    const uploads = await Promise.all(files.map(prepareUpload));
    const product = selectedId ? found.find(item => item.id === selectedId) : narrowed.length === 1 ? narrowed[0] : undefined;
    if (selectedId && !product) return Response.json({ error: "Tanlangan mahsulot topilmadi." }, { status: 400 });
    if (!product) {
      const recommendedId = await recommendCandidate(narrowed, uploads[0], message);
      const choices = orderChoices(narrowed, recommendedId).map(({ id, name, model, category, hasMainImage }) => ({ id, name, model, category, hasMainImage, recommended: id === recommendedId }));
      return Response.json({ reply: `“${search}” bo‘yicha ${choices.length} ta mahsulot bor. Qaysi biriga saqlaymiz?`, status: "idle", question: { choices } });
    }

    const processed = await processPhotos(uploads);
    const payload = buildPhotoPreview({ product, processed, wantsMain: wantsMainPlacement(message), adminId: session.user.id, sessionId: session.id });
    return Response.json({
      reply: `${processed.length} ta rasm tayyor. Tekshirib, “Tasdiqlash”ni bosing — shundan keyingina mahsulotga saqlanadi.`,
      status: "awaiting_confirmation",
      preview: { product: payload.product, previousMainImage: product.mainImage, items: payload.items.map((item, index) => ({ placement: item.placement, width: item.width, height: item.height, original: processed[index].original, image: processed[index].bytes.toString("base64") })) },
      previewToken: signPhotoPreview(payload, session.tokenHash),
    });
  } catch (error) {
    if (error instanceof PhotoAgentUserError) return Response.json({ error: error.message }, { status: 422 });
    console.error("[PhotoAgent]", { name: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Rasmni tayyorlab bo‘lmadi. Qayta urinib ko‘ring." }, { status: 500 });
  }
}
