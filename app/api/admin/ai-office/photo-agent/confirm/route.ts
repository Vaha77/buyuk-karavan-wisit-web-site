import { z } from "zod";
import { getStaffSession } from "@/lib/auth/session";
import { auditPhotoConfirmed, claimPhotoPreview, deletePendingPhoto, isPhotoPreviewConfirmed, PhotoAgentUserError, verifyPhotoPreview } from "@/lib/ai-office/photo-agent";
import { saveApprovedPhotoStudioImageAction } from "@/app/admin/(protected)/photo-studio/actions";

export const runtime = "nodejs";
// Storage read + Neon upload + product update for a single image.
export const maxDuration = 60;

// One token = one image; the token carries only the temporary storage key and hash, never image bytes.
const inputSchema = z.object({ previewToken: z.string().min(40).max(20_000), confirmationAction: z.literal("confirm-photo-preview") });

export async function POST(request: Request) {
  const session = await getStaffSession();
  if (!session) return Response.json({ error: "Avtorizatsiya talab qilinadi." }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tasdiqlash ma’lumoti noto‘g‘ri." }, { status: 400 });
  let payload;
  try { payload = verifyPhotoPreview(parsed.data.previewToken, session.user.id, session.id, session.tokenHash); }
  catch { return Response.json({ error: "Preview muddati tugagan yoki yaroqsiz. Rasmni qayta ishlang." }, { status: 403 }); }
  // A repeated confirm (retry after a network error, double tap) is a no-op, not an error.
  if (await isPhotoPreviewConfirmed(payload)) return Response.json({ success: true, skipped: true, placement: payload.placement });
  try {
    const claim = await claimPhotoPreview(payload, session.user);
    // Same save path as Foto Studio: Neon upload, image-delivery rules, product update and public verification.
    const result = await saveApprovedPhotoStudioImageAction({ productId: payload.product.id, placement: payload.placement, image: claim.image.toString("base64"), assetId: claim.assetId });
    if (result.error) return Response.json({ error: result.error }, { status: 500 });
    await auditPhotoConfirmed(payload, session.user, claim).catch(error => console.error("[PhotoAgentConfirm] audit", { name: error instanceof Error ? error.name : "UnknownError" }));
    await deletePendingPhoto(payload.key).catch(() => undefined);
    return Response.json({ success: true, skipped: false, placement: payload.placement });
  } catch (error) {
    if (error instanceof PhotoAgentUserError) return Response.json({ error: error.message }, { status: 409 });
    console.error("[PhotoAgentConfirm]", { name: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Rasmni saqlab bo‘lmadi." }, { status: 500 });
  }
}
