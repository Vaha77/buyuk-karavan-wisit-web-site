import "server-only";
import { photoStudioModes, type PhotoStudioBackground, type PhotoStudioMode, type PhotoStudioSettings, type PhotoStudioSize } from "./types";

export class PhotoStudioValidationError extends Error {}
const formats = new Map([
  ["image/jpeg", (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ["image/webp", (b: Uint8Array) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP"],
]);

export async function validateSourceImage(file: File) {
  if (!(file instanceof File) || !formats.has(file.type)) throw new PhotoStudioValidationError("Rasm formati qo‘llab-quvvatlanmaydi.");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new PhotoStudioValidationError("Rasm hajmi juda katta.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!formats.get(file.type)!(bytes)) throw new PhotoStudioValidationError("Rasm formati qo‘llab-quvvatlanmaydi.");
  return { bytes, type: file.type, name: file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100) || "product.png" };
}

export function parsePhotoStudioRequest(value: Record<string, FormDataEntryValue>): { mode: PhotoStudioMode; settings: PhotoStudioSettings } {
  const mode = String(value.mode) as PhotoStudioMode;
  const background = String(value.background) as PhotoStudioBackground;
  const size = Number(value.size) as PhotoStudioSize;
  if (!photoStudioModes.includes(mode) || !["white", "transparent", "original"].includes(background) || ![1000, 1500, 2000].includes(size)) throw new PhotoStudioValidationError("Foto Studio sozlamalari noto‘g‘ri.");
  const flag = (key: string) => value[key] === "true";
  return { mode, settings: { background, size, removeBackground: flag("removeBackground"), enhanceQuality: flag("enhanceQuality"), correctColors: flag("correctColors"), improveLighting: flag("improveLighting"), protectProduct: flag("protectProduct") } };
}

