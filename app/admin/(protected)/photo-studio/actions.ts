"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { attachGeneratedProductImage, ProductNotFoundError } from "@/lib/products/mutations";
import { editProductImage, OpenAINotConfiguredError, PhotoStudioAIError, PhotoStudioRateLimitError } from "@/lib/photo-studio/openai";
import { parsePhotoStudioRequest, PhotoStudioValidationError, validateSourceImage } from "@/lib/photo-studio/validation";

export type ProcessImageResult = { error?: string; image?: string; contentType?: "image/png"; width?: number; height?: number };
export async function processPhotoStudioImageAction(formData: FormData): Promise<ProcessImageResult> {
  await requireAdmin();
  try {
    const file = formData.get("image");
    if (!(file instanceof File)) throw new PhotoStudioValidationError("Rasmni tanlang.");
    const source = await validateSourceImage(file);
    const values = Object.fromEntries(formData.entries());
    if (values.mode === "360") return { error: "360° AI ishlovi keyingi bosqichda ulanadi." };
    const { mode, settings } = parsePhotoStudioRequest(values);
    const result = await editProductImage({ ...source, mode, settings });
    return { image: result.bytes.toString("base64"), contentType: result.contentType, width: result.width, height: result.height };
  } catch (error) {
    if (error instanceof PhotoStudioValidationError) return { error: error.message };
    if (error instanceof OpenAINotConfiguredError) return { error: "OpenAI API sozlanmagan." };
    if (error instanceof PhotoStudioRateLimitError) return { error: "So‘rovlar soni vaqtincha cheklangan. Birozdan so‘ng qayta urinib ko‘ring." };
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
    return { error: "Rasmni saqlashda xatolik yuz berdi." };
  }
}
