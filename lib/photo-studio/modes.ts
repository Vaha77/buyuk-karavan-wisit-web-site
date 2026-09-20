import type { PhotoStudioMode, PhotoStudioModeConfig, PhotoStudioSettings } from "./types";

const base: PhotoStudioSettings = {
  background: "white", size: 1500, aspectRatio: "1:1", removeBackground: false,
  enhanceQuality: true, correctColors: true, improveLighting: true, premiumLighting: false,
  detailEnhancement: false, naturalShadow: false, exposure: false, whiteBalance: false,
  perspectiveCorrection: false, clutterCleanup: false, preserveEnvironment: false,
  edgeQuality: false, fineDetailProtection: false,
  textSafeArea: "auto", protectProduct: true,
};

export const photoStudioModeConfigs: Record<PhotoStudioMode, PhotoStudioModeConfig> = {
  card: { id: "card", label: "Mahsulot kartasi", resultLabel: "KATALOG NATIJASI", description: "Toza fonli, markazlangan professional katalog rasmi.", downloadStem: "buyuk-karavan-product-card", outputFormat: "png", defaults: { ...base, background: "white", size: 1500, removeBackground: true, naturalShadow: true } },
  detail: { id: "detail", label: "Mahsulot sahifasi", resultLabel: "PREMIUM NATIJA", description: "Katta galereya uchun kengroq kompozitsiya va premium studiya chuqurligi.", downloadStem: "buyuk-karavan-product-detail", outputFormat: "png", defaults: { ...base, background: "premium-neutral", size: 2000, premiumLighting: true, detailEnhancement: true, naturalShadow: true } },
  project: { id: "project", label: "Loyiha", resultLabel: "LOYIHA NATIJASI", description: "Real montaj muhiti va fazoviy bog‘lanishlarni saqlagan professional loyiha fotosi.", downloadStem: "buyuk-karavan-project", outputFormat: "png", defaults: { ...base, background: "original", size: 2000, aspectRatio: "original", exposure: true, whiteBalance: true, perspectiveCorrection: true, clutterCleanup: false, detailEnhancement: true, preserveEnvironment: true } },
  transparent: { id: "transparent", label: "Transparent PNG", resultLabel: "SHAFFOF PNG", description: "Haqiqiy alpha shaffofligi va nozik texnik qirralari saqlangan PNG.", downloadStem: "buyuk-karavan-transparent", outputFormat: "png", defaults: { ...base, background: "transparent", size: 2000, removeBackground: true, edgeQuality: true, fineDetailProtection: true } },
  ad: { id: "ad", label: "Reklama", resultLabel: "REKLAMA NATIJASI", description: "Mahsulot qahramon bo‘lgan, matn uchun xavfsiz joyli premium reklama vizuali.", downloadStem: "buyuk-karavan-advertising", outputFormat: "png", defaults: { ...base, background: "premium-industrial", size: 2000, aspectRatio: "9:16", premiumLighting: true, detailEnhancement: true, textSafeArea: "auto" } },
};

export function getPhotoStudioModeConfig(mode: PhotoStudioMode) { return photoStudioModeConfigs[mode]; }
