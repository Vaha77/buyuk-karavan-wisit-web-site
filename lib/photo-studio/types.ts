export const photoStudioModes = ["card", "detail", "project", "transparent", "ad"] as const;
export type PhotoStudioMode = (typeof photoStudioModes)[number];
export type PhotoStudioBackground = "white" | "transparent" | "original";
export type PhotoStudioSize = 1000 | 1500 | 2000;
export type PhotoStudioSettings = {
  background: PhotoStudioBackground;
  size: PhotoStudioSize;
  removeBackground: boolean;
  enhanceQuality: boolean;
  correctColors: boolean;
  improveLighting: boolean;
  protectProduct: boolean;
};

