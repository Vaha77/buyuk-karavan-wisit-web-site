export const photoStudioModes = ["card", "detail", "project", "transparent", "ad"] as const;
export type PhotoStudioMode = (typeof photoStudioModes)[number];

export const photoStudioSizes = [1000, 1500, 2000] as const;
export type PhotoStudioSize = (typeof photoStudioSizes)[number];
export type PhotoStudioBackground = "white" | "light-gray" | "premium-neutral" | "premium-industrial" | "original" | "transparent";
export type PhotoStudioAspectRatio = "original" | "1:1" | "4:5" | "9:16" | "16:9";
export type PhotoStudioTextSafeArea = "left" | "right" | "top" | "auto";

export type PhotoStudioSettings = {
  background: PhotoStudioBackground;
  size: PhotoStudioSize;
  aspectRatio: PhotoStudioAspectRatio;
  removeBackground: boolean;
  enhanceQuality: boolean;
  correctColors: boolean;
  improveLighting: boolean;
  premiumLighting: boolean;
  detailEnhancement: boolean;
  naturalShadow: boolean;
  exposure: boolean;
  whiteBalance: boolean;
  perspectiveCorrection: boolean;
  clutterCleanup: boolean;
  preserveEnvironment: boolean;
  edgeQuality: boolean;
  fineDetailProtection: boolean;
  composition: "balanced" | "dynamic" | "minimal";
  textSafeArea: PhotoStudioTextSafeArea;
  protectProduct: boolean;
};

export type PhotoStudioModeConfig = {
  id: PhotoStudioMode;
  label: string;
  description: string;
  resultLabel: string;
  downloadStem: string;
  outputFormat: "png";
  defaults: PhotoStudioSettings;
};

export type PhotoStudioResult = {
  image: string;
  contentType: "image/png";
  width: number;
  height: number;
  mode: PhotoStudioMode;
};
