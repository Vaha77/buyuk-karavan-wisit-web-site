"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { attachGeneratedProductImage, ProductNotFoundError } from "@/lib/products/mutations";
import { ImageValidationError } from "@/lib/products/storage";
import { editProductImage, OpenAINotConfiguredError, PhotoStudioAIError, PhotoStudioCompositionError, PhotoStudioNoImageError, PhotoStudioRateLimitError, PhotoStudioTimeoutError, PhotoStudioTransparencyError } from "@/lib/photo-studio/openai";
import type { PhotoStudioMode } from "@/lib/photo-studio/types";
import { parsePhotoStudioRequest, PhotoStudioValidationError, validateSourceImage } from "@/lib/photo-studio/validation";
import { recordPhotoStudioAttachment,recordPhotoStudioCreation } from "@/lib/audit/photo-studio";
import { getProductBySlug } from "@/lib/products/queries";

export type ProcessImageResult = { error?: string; image?: string; contentType?: "image/png"; width?: number; height?: number; mode?: PhotoStudioMode; assetId?:string };

export async function processPhotoStudioImageAction(formData: FormData): Promise<ProcessImageResult> {
  const actor=await requireAdmin();
  try {
    const file = formData.get("image");
    if (!(file instanceof File)) throw new PhotoStudioValidationError("Rasmni tanlang.");
    const source = await validateSourceImage(file);
    const { mode, settings, advertising } = parsePhotoStudioRequest(Object.fromEntries(formData.entries()));
    const result = await editProductImage({ ...source, mode, settings, advertising });
    const asset=await recordPhotoStudioCreation(actor,mode,result.width,result.height);
    return { image: result.bytes.toString("base64"), contentType: result.contentType, width: result.width, height: result.height, mode,assetId:asset.id };
  } catch (error) {
    if (error instanceof PhotoStudioValidationError) return { error: error.message };
    if (error instanceof OpenAINotConfiguredError) return { error: "OpenAI API sozlanmagan." };
    if (error instanceof PhotoStudioRateLimitError) return { error: "So‘rovlar soni vaqtincha cheklangan. Birozdan so‘ng qayta urinib ko‘ring." };
    if (error instanceof PhotoStudioTimeoutError) return { error: "AI xizmati javob berishga ulgurmadi. Qayta yaratishni o‘zingiz boshlashingiz mumkin." };
    if (error instanceof PhotoStudioNoImageError) return { error: "AI xizmati rasm qaytarmadi. Qayta urinib ko‘ring." };
    if (error instanceof PhotoStudioTransparencyError) return { error: "Shaffof PNG yaratilmadi. Natijada haqiqiy alpha shaffofligi topilmadi." };
    if (error instanceof PhotoStudioCompositionError) return { error: "Reklama matn qatlamini tayyorlash amalga oshmadi." };
    if (error instanceof PhotoStudioAIError) return { error: "Rasmni qayta ishlash amalga oshmadi. Qayta urinib ko‘ring." };
    return { error: "AI xizmatiga ulanishda xatolik yuz berdi." };
  }
}

type AttachStage = "authorization" | "input_validation" | "image_decode" | "product_lookup" | "asset_lookup" | "storage_upload" | "product_update" | "storage_cleanup" | "product_verification" | "attachment_record" | "public_query_verification";
const GENERATED_IMAGE_LIMIT = 20 * 1024 * 1024;

function safeAttachError(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  let message = error instanceof Error ? error.message : "Unknown attach error";
  for (const secret of [process.env.AWS_SECRET_ACCESS_KEY, process.env.AWS_ACCESS_KEY_ID, process.env.DATABASE_URL, process.env.OPENAI_API_KEY]) {
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const metadata = record.$metadata && typeof record.$metadata === "object" ? record.$metadata as Record<string, unknown> : {};
  const errorCode = [record.Code, record.code, record.__type].find(value => typeof value === "string");
  const httpStatus = typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
  const requestId = [metadata.requestId, record.requestId, record.RequestId].find(value => typeof value === "string");
  return {
    errorName: name,
    errorMessage: message.slice(0, 500),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(errorCode ? { s3ErrorCode: errorCode } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

function safeStorageConfig() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  let endpointHost: string | undefined;
  try { endpointHost = endpoint ? new URL(endpoint).hostname : undefined; } catch { endpointHost = "invalid-url"; }
  return {
    endpointHost,
    region: process.env.AWS_REGION || undefined,
    bucket: process.env.NEON_STORAGE_BUCKET || undefined,
    endpointConfigured: Boolean(endpoint),
    regionConfigured: Boolean(process.env.AWS_REGION),
    bucketConfigured: Boolean(process.env.NEON_STORAGE_BUCKET),
    accessKeyConfigured: Boolean(process.env.AWS_ACCESS_KEY_ID),
    secretKeyConfigured: Boolean(process.env.AWS_SECRET_ACCESS_KEY),
  };
}

function attachMessage(stage: AttachStage, error: unknown) {
  if (error instanceof PhotoStudioValidationError || error instanceof ImageValidationError) return error.message;
  if (error instanceof ProductNotFoundError) return "Mahsulot topilmadi.";
  if (stage === "authorization") return "Sessiya tekshirilmadi. Qayta kirib urinib ko‘ring.";
  if (stage === "storage_upload" || stage === "storage_cleanup") return "Rasmni doimiy xotiraga yuklash amalga oshmadi.";
  if (stage === "product_update") return "Rasm yuklandi, lekin mahsulot ma’lumotini yangilab bo‘lmadi. Yuklangan fayl xavfsiz tozalandi.";
  if (stage === "product_verification") return "Mahsulot yangilandi, lekin saqlangan rasm manzilini tasdiqlab bo‘lmadi.";
  if (stage === "attachment_record") return "Rasm mahsulotga biriktirildi, lekin Photo Studio tarixini yangilab bo‘lmadi.";
  if (stage === "public_query_verification") return "Rasm saqlandi, lekin mahsulot sahifasi hali yangi rasmni qabul qilmadi.";
  return "Rasmni biriktirish ma’lumotlarini tekshirib bo‘lmadi.";
}

export async function saveApprovedPhotoStudioImageAction(raw: { productId: string; placement: "main" | "gallery"; image: string;assetId:string }): Promise<{ error?: string; success?: true }> {
  let stage: string = "authorization";
  try {
    const actor=await requireAdmin();
    stage="input_validation";
    if (!raw || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.productId) || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.assetId) || !["main", "gallery"].includes(raw.placement) || typeof raw.image !== "string") throw new PhotoStudioValidationError("Saqlash ma’lumotlari noto‘g‘ri.");
    stage="image_decode";
    const bytes = Buffer.from(raw.image, "base64");
    if (!bytes.length || bytes.length > GENERATED_IMAGE_LIMIT || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) throw new PhotoStudioValidationError("Tayyor PNG rasm noto‘g‘ri yoki 20 MB limitdan katta.");
    stage="product_lookup";
    const product = await getDb().product.findUnique({ where: { id: raw.productId },select:{id:true,name:true} });
    if (!product) throw new ProductNotFoundError();
    stage="asset_lookup";
    const asset=await getDb().photoStudioAsset.findUnique({where:{id:raw.assetId},select:{id:true,attachedAt:true}});
    if(!asset||asset.attachedAt)throw new PhotoStudioValidationError("Photo Studio natijasi topilmadi yoki avval biriktirilgan.");
    const attached = await attachGeneratedProductImage(raw.productId, new File([bytes], "ai-product.png", { type: "image/png" }), raw.placement, {
      maxSize: GENERATED_IMAGE_LIMIT,
      skipAudit: true,
      onStage: nextStage => { stage = nextStage; },
    });
    stage="product_verification";
    const stored=await getDb().product.findUnique({where:{id:raw.productId},select:{slug:true,images:true,isVisible:true,category:{select:{isActive:true}}}});
    const dbVerified=Boolean(stored&&(raw.placement==="main"?stored.images[0]===attached.url:stored.images.includes(attached.url)));
    if(!stored||!dbVerified)throw new Error("Stored Product images do not contain the uploaded object URL in the requested placement");
    stage="attachment_record";
    if(!await recordPhotoStudioAttachment(actor,asset.id,product,raw.placement))throw new PhotoStudioValidationError("Photo Studio natijasi avval biriktirilgan.");
    stage="public_query_verification";
    let publicQueryVerified: boolean | "not-public" = "not-public";
    if(stored.isVisible&&stored.category.isActive){
      const publicProduct=await getProductBySlug(stored.slug);
      publicQueryVerified=Boolean(publicProduct&&(raw.placement==="main"?publicProduct.image===attached.url:publicProduct.images?.includes(attached.url)));
      if(!publicQueryVerified)throw new Error("Public product query returned stale image data after cache invalidation");
    }
    console.info("[PhotoStudioAttach]",{stage:"completed",productId:raw.productId,placement:raw.placement,objectUrl:attached.url,dbVerified,publicQueryVerified});
    return { success: true };
  } catch (error) {
    console.error("[PhotoStudioAttach]", { stage, ...safeAttachError(error), ...(stage === "storage_upload" ? { storage: safeStorageConfig() } : {}) });
    return { error: attachMessage(stage as AttachStage, error) };
  }
}
