"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { attachGeneratedProductImage, ProductNotFoundError } from "@/lib/products/mutations";
import { editProductImage, OpenAINotConfiguredError, PhotoStudioAIError, PhotoStudioCompositionError, PhotoStudioNoImageError, PhotoStudioRateLimitError, PhotoStudioTimeoutError, PhotoStudioTransparencyError } from "@/lib/photo-studio/openai";
import type { PhotoStudioMode } from "@/lib/photo-studio/types";
import { parsePhotoStudioRequest, PhotoStudioValidationError, validateSourceImage } from "@/lib/photo-studio/validation";

export type ProcessImageResult = { error?: string; image?: string; contentType?: "image/png"; width?: number; height?: number; mode?: PhotoStudioMode };

export async function processPhotoStudioImageAction(formData: FormData): Promise<ProcessImageResult> {
  await requireAdmin();
  try {
    const file = formData.get("image");
    if (!(file instanceof File)) throw new PhotoStudioValidationError("Rasmni tanlang.");
    const source = await validateSourceImage(file);
    const { mode, settings, advertising } = parsePhotoStudioRequest(Object.fromEntries(formData.entries()));
    const result = await editProductImage({ ...source, mode, settings, advertising });
    return { image: result.bytes.toString("base64"), contentType: result.contentType, width: result.width, height: result.height, mode };
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

export async function saveApprovedPhotoStudioImageAction(raw: { productId: string; placement: "main" | "gallery"; image: string }): Promise<{ error?: string; success?: true }> {
  await requireAdmin();
  try {
    if (!raw || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.productId) || !["main", "gallery"].includes(raw.placement) || typeof raw.image !== "string") throw new PhotoStudioValidationError("Saqlash ma’lumotlari noto‘g‘ri.");
    const bytes = Buffer.from(raw.image, "base64");
    if (!bytes.length || bytes.length > 20 * 1024 * 1024 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) throw new PhotoStudioValidationError("Tayyor rasm noto‘g‘ri.");
    const exists = await getDb().product.count({ where: { id: raw.productId } });
    if (!exists) throw new ProductNotFoundError();
    await attachGeneratedProductImage(raw.productId, new File([bytes], "ai-product.png", { type: "image/png" }), raw.placement);
    return { success: true };
  } catch (error) {
    if (error instanceof PhotoStudioValidationError || error instanceof ProductNotFoundError) return { error: error instanceof ProductNotFoundError ? "Mahsulot topilmadi." : error.message };
    if (error && typeof error === "object" && "$metadata" in error) return { error: "Rasmni doimiy xotiraga yuklash amalga oshmadi." };
    if (error instanceof Error && /Prisma|database|connect/i.test(`${error.name} ${error.message}`)) return { error: "Ma’lumotlar bazasida rasmni biriktirish amalga oshmadi." };
    return { error: "Rasmni saqlashda xatolik yuz berdi." };
  }
}
