import "server-only";
import { getPhotoStudioModeConfig } from "./modes";
import { photoStudioModes, photoStudioSizes, type PhotoStudioAspectRatio, type PhotoStudioBackground, type PhotoStudioMode, type PhotoStudioSettings, type PhotoStudioTextSafeArea } from "./types";

export class PhotoStudioValidationError extends Error {}
const formats = new Map([
  ["image/jpeg", (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ["image/webp", (b: Uint8Array) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP"],
]);

export async function validateSourceImage(file: File) {
  if (!(file instanceof File) || !formats.has(file.type)) throw new PhotoStudioValidationError("Rasm formati qo‘llab-quvvatlanmaydi. PNG, JPG yoki WebP yuklang.");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new PhotoStudioValidationError("Rasm hajmi juda katta. Maksimal hajm 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!formats.get(file.type)!(bytes)) throw new PhotoStudioValidationError("Rasm fayli buzilgan yoki formati noto‘g‘ri.");
  return { bytes, type: file.type, name: file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100) || "product.png" };
}

const allowedBackgrounds: Record<PhotoStudioMode, PhotoStudioBackground[]> = {
  card: ["white", "light-gray"],
  detail: ["premium-neutral", "premium-industrial"],
  project: ["original"],
  transparent: ["transparent"],
  ad: ["premium-industrial"],
};
const allowedRatios: Record<PhotoStudioMode, PhotoStudioAspectRatio[]> = {
  card: ["1:1"], detail: ["1:1"], project: ["original", "1:1", "4:5", "16:9"], transparent: ["1:1"], ad: ["1:1", "4:5", "9:16", "16:9"],
};

export function parsePhotoStudioRequest(value: Record<string, FormDataEntryValue>): { mode: PhotoStudioMode; settings: PhotoStudioSettings } {
  const rawMode = String(value.mode);
  if (!photoStudioModes.includes(rawMode as PhotoStudioMode)) throw new PhotoStudioValidationError("Foto Studio rejimi noto‘g‘ri.");
  const mode = rawMode as PhotoStudioMode;
  const size = Number(value.size);
  const background = String(value.background) as PhotoStudioBackground;
  const aspectRatio = String(value.aspectRatio) as PhotoStudioAspectRatio;
  if (!photoStudioSizes.includes(size as 1000 | 1500 | 2000) || !allowedBackgrounds[mode].includes(background) || !allowedRatios[mode].includes(aspectRatio)) throw new PhotoStudioValidationError("Tanlangan rejim sozlamalari noto‘g‘ri.");
  const flag = (key: keyof PhotoStudioSettings) => value[key] === "true";
  const choice = <T extends string>(key: string, allowed: readonly T[], fallback: T) => allowed.includes(String(value[key]) as T) ? String(value[key]) as T : fallback;
  const defaults = getPhotoStudioModeConfig(mode).defaults;
  const settings: PhotoStudioSettings = { ...defaults, size: size as 1000 | 1500 | 2000, background, aspectRatio };
  if (mode === "card") Object.assign(settings, { removeBackground: flag("removeBackground"), enhanceQuality: flag("enhanceQuality"), correctColors: flag("correctColors"), improveLighting: flag("improveLighting"), protectProduct: flag("protectProduct") });
  if (mode === "detail") Object.assign(settings, { premiumLighting: flag("premiumLighting"), detailEnhancement: flag("detailEnhancement"), naturalShadow: flag("naturalShadow"), protectProduct: flag("protectProduct") });
  if (mode === "project") Object.assign(settings, { exposure: flag("exposure"), whiteBalance: flag("whiteBalance"), perspectiveCorrection: flag("perspectiveCorrection"), clutterCleanup: flag("clutterCleanup"), detailEnhancement: flag("detailEnhancement"), preserveEnvironment: true, protectProduct: true });
  if (mode === "transparent") Object.assign(settings, { removeBackground: true, edgeQuality: flag("edgeQuality"), fineDetailProtection: flag("fineDetailProtection"), protectProduct: flag("protectProduct") });
  if (mode === "ad") Object.assign(settings, { composition: choice("composition", ["balanced", "dynamic", "minimal"] as const, "dynamic"), textSafeArea: choice<PhotoStudioTextSafeArea>("textSafeArea", ["left", "right", "top", "auto"], "auto"), premiumLighting: flag("premiumLighting"), protectProduct: flag("protectProduct") });
  return { mode, settings };
}
