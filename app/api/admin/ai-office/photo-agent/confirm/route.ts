import { z } from "zod";
import { getAdminSession } from "@/lib/auth/session";
import { auditPhotoConfirmed, claimPhotoPreviewItem, PhotoAgentUserError, verifyPhotoPreview } from "@/lib/ai-office/photo-agent";
import { saveApprovedPhotoStudioImageAction } from "@/app/admin/(protected)/photo-studio/actions";

export const runtime = "nodejs";
export const maxDuration = 60;

// One image per request keeps each body small; the client sends them in order after "Tasdiqlash".
const inputSchema = z.object({ previewToken: z.string().min(40).max(20_000), confirmationAction: z.literal("confirm-photo-preview"), index: z.number().int().min(0).max(5), image: z.string().min(100).max(30_000_000) });

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Avtorizatsiya talab qilinadi." }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tasdiqlash ma’lumoti noto‘g‘ri." }, { status: 400 });
  let payload;
  try { payload = verifyPhotoPreview(parsed.data.previewToken, session.user.id, session.id, session.tokenHash); }
  catch { return Response.json({ error: "Preview muddati tugagan yoki yaroqsiz. Rasmni qayta ishlang." }, { status: 403 }); }
  try {
    const image = Buffer.from(parsed.data.image, "base64");
    const claim = await claimPhotoPreviewItem(payload, parsed.data.index, image, session.user);
    const placement = payload.items[parsed.data.index].placement;
    // Same save path as Foto Studio: Neon upload, image-delivery rules, product update and verification.
    const result = await saveApprovedPhotoStudioImageAction({ productId: payload.product.id, placement, image: parsed.data.image, assetId: claim.assetId });
    if (result.error) return Response.json({ error: result.error }, { status: 500 });
    await auditPhotoConfirmed(payload, parsed.data.index, session.user, claim).catch(error => console.error("[PhotoAgentConfirm] audit", { name: error instanceof Error ? error.name : "UnknownError" }));
    const done = parsed.data.index === payload.items.length - 1;
    return Response.json({ success: true, done, placement, message: done ? "Rasm mahsulotga saqlandi." : `${parsed.data.index + 1}/${payload.items.length} saqlandi.` });
  } catch (error) {
    if (error instanceof PhotoAgentUserError) return Response.json({ error: error.message }, { status: 409 });
    console.error("[PhotoAgentConfirm]", { name: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Rasmni saqlab bo‘lmadi." }, { status: 500 });
  }
}
