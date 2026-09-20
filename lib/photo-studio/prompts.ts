import type { PhotoStudioMode, PhotoStudioSettings } from "./types";

const preservation = `The uploaded industrial refrigeration product or installation is the source of truth. Preserve its identity and visible technical construction as faithfully as possible: body, casing, physical proportions, geometry, cylinder count, fan count and positions, copper pipes, valves, receivers, gauges, electrical boxes, bolts, mounting frame, connections, logos, labels, model markings, and all visible technical components. Do not add or remove components, invent pipes or valves, alter fan or cylinder count, change the model, redesign the casing, replace branding, invent labels or specifications, or add decorative equipment. Do not add any text.`;
const goals: Record<PhotoStudioMode, string> = {
  card: "Create a professional square ecommerce catalog product image. Center the complete product with consistent margins, clean neutral studio presentation, and a natural contact shadow.",
  detail: "Create a high-detail large product presentation. Let the complete product occupy most of the frame with clean industrial studio lighting and natural shadows.",
  project: "Improve this real industrial refrigeration project photograph without changing the installation or layout. Improve cleanliness, exposure, color balance, lighting, and professional architectural presentation.",
  transparent: "Precisely isolate the original product. Preserve every visible edge and technical component. Return a true transparent background with alpha, not a checkerboard.",
  ad: "Create a premium commercial product visual with refined dramatic lighting and composition while keeping the actual product unchanged. Add no marketing copy or text.",
};

export function buildPhotoStudioPrompt(mode: PhotoStudioMode, settings: PhotoStudioSettings) {
  const instructions = [goals[mode], preservation];
  if (settings.background === "white") instructions.push("Use a clean pure white studio background.");
  if (settings.background === "transparent") instructions.push("Use a true alpha-transparent background.");
  if (settings.background === "original") instructions.push("Retain and professionally clean up the original background and context.");
  if (settings.removeBackground) instructions.push("Remove distracting background elements while retaining the product edges accurately.");
  if (settings.enhanceQuality) instructions.push("Improve clarity and photographic quality without fabricating detail.");
  if (settings.correctColors) instructions.push("Correct white balance and colors while preserving authentic material colors.");
  if (settings.improveLighting) instructions.push("Improve exposure, shadows, and lighting with physically natural results.");
  if (settings.protectProduct) instructions.push("Prioritize input fidelity over visual creativity whenever they conflict.");
  return instructions.join("\n\n");
}

