import { z } from "zod";
import { getAdminSession } from "@/lib/auth/session";
import { buildPhotoPreview, deletePendingPhoto, findProducts, PhotoAgentUserError, prepareUpload, processPhoto, recommendCandidate, signPhotoPreview, validatePhotoAgentFile, verifyPhotoPreview } from "@/lib/ai-office/photo-agent";
import { isPhotoAgentOffDomain, narrowPhotoCandidates, orderChoices, PHOTO_AGENT_MAX_FILES, PHOTO_AGENT_NEEDS_IMAGE, PHOTO_AGENT_NOT_FOUND, PHOTO_AGENT_REFUSAL, photoSearchText, wantsMainPlacement } from "@/lib/ai-office/photo-agent-rules";

export const runtime = "nodejs";
// One image per request: ≤90 s image budget + upload/storage overhead. Fits Vercel Hobby and Pro with Fluid compute (max 300 s / 800 s).
export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Avtorizatsiya talab qilinadi." }, { status: 401 });
  try {
    const form = await request.formData();
    const message = String(form.get("message") || "").trim().slice(0, 500);
    // Domain gate runs on the server before anything else.
    if (isPhotoAgentOffDomain(message)) return Response.json({ reply: PHOTO_AGENT_REFUSAL, status: "idle" });
    const image = form.get("image");
    if (!(image instanceof File) || !image.size) return Response.json({ reply: PHOTO_AGENT_NEEDS_IMAGE, status: "idle" });
    validatePhotoAgentFile(image);
    const total = Math.min(PHOTO_AGENT_MAX_FILES, Math.max(1, Number(form.get("total")) || 1));
    const index = Math.min(total - 1, Math.max(0, Number(form.get("index")) || 0));
    const search = photoSearchText(message);
    if (!search) return Response.json({ reply: "Qaysi mahsulot? Modelni yozing, masalan: BR +20PG vazdushniy agregat.", status: "idle" });

    const found = await findProducts(search);
    if (!found.length) return Response.json({ reply: PHOTO_AGENT_NOT_FOUND, status: "idle" });
    const selectedId = String(form.get("productId") || "");
    const narrowed = narrowPhotoCandidates(found, message);
    const product = selectedId ? found.find(item => item.id === selectedId) : narrowed.length === 1 ? narrowed[0] : undefined;
    if (selectedId && !product) return Response.json({ error: "Tanlangan mahsulot topilmadi." }, { status: 400 });
    const upload = await prepareUpload(image);
    if (!product) {
      const recommendedId = await recommendCandidate(narrowed, upload, message);
      const choices = orderChoices(narrowed, recommendedId).map(({ id, name, model, category, hasMainImage }) => ({ id, name, model, category, hasMainImage, recommended: id === recommendedId }));
      return Response.json({ reply: `“${search}” bo‘yicha ${choices.length} ta mahsulot bor. Qaysi biriga saqlaymiz?`, status: "idle", question: { choices } });
    }

    const processed = await processPhoto(upload);
    const { payload, previewJpeg } = await buildPhotoPreview({ product, processed, index, total, wantsMain: wantsMainPlacement(message), adminId: session.user.id, sessionId: session.id });
    return Response.json({
      reply: `${index + 1}/${total} rasm tayyor.`, status: "awaiting_confirmation",
      product: payload.product, previousMainImage: product.mainImage,
      item: { index, placement: payload.placement, width: payload.width, height: payload.height, original: processed.original, preview: previewJpeg },
      previewToken: signPhotoPreview(payload, session.tokenHash),
    });
  } catch (error) {
    if (error instanceof PhotoAgentUserError) return Response.json({ error: error.message }, { status: 422 });
    console.error("[PhotoAgent]", { name: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Rasmni tayyorlab bo‘lmadi. Qayta urinib ko‘ring." }, { status: 500 });
  }
}

/** "Bekor qilish" / "Qayta ishlash": drops the temporary full-size results of unconfirmed previews. */
export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Avtorizatsiya talab qilinadi." }, { status: 401 });
  const parsed = z.object({ previewTokens: z.array(z.string().min(40).max(20_000)).max(PHOTO_AGENT_MAX_FILES) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "So‘rov noto‘g‘ri." }, { status: 400 });
  const keys = parsed.data.previewTokens.flatMap(token => { try { return [verifyPhotoPreview(token, session.user.id, session.id, session.tokenHash, { allowExpired: true }).key]; } catch { return []; } });
  await Promise.allSettled(keys.map(key => deletePendingPhoto(key)));
  return Response.json({ deleted: keys.length });
}
