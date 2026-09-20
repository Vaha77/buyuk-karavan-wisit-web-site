import "server-only";
import type { PhotoStudioMode, PhotoStudioSettings } from "./types";

const technicalProtection = `The uploaded refrigeration product is the source of truth. Preserve its exact identity and visible technical construction: body shape, geometry, proportions, compressor cylinders, fan count and positions, copper pipes, valves, receivers, gauges, electrical boxes, bolts, mounting frame, connections, logos, labels, model markings, and every visible technical component. Never invent, remove, duplicate, redesign, replace, or reposition technical parts. Never invent specifications, claims, prices, warranties, branding, labels, or text. Technical fidelity has priority over artistic creativity.`;

export function buildProductCardPrompt(settings: PhotoStudioSettings) {
  const background = settings.background === "light-gray" ? "a very light neutral gray" : "clean pure white";
  return [`Create an isolated professional ecommerce catalog photograph, not an advertising creative. Use ${background}. Center the complete product and make it occupy approximately 75–85% of the useful canvas with consistent margins. Use soft studio lighting, clean edges, accurate material colors, and a subtle realistic contact shadow. Do not include an environment, props, decorative objects, text, or additional equipment.`, technicalProtection, settings.removeBackground && "Remove the original background precisely while preserving every cable, pipe, valve, foot, frame edge, and thin component.", settings.enhanceQuality && "Improve photographic clarity without fabricating detail.", settings.correctColors && "Correct white balance while retaining authentic product colors.", settings.improveLighting && "Use physically natural, even studio exposure."].filter(Boolean).join("\n\n");
}

export function buildProductDetailPrompt(settings: PhotoStudioSettings) {
  const background = settings.background === "premium-industrial" ? "a restrained premium industrial studio backdrop" : "a subtle premium neutral studio background";
  return [`Create a large premium product photograph for a Product Detail gallery. Use ${background}, generous breathing room, refined realistic depth, accurate industrial materials, and a natural soft grounding shadow. This must visibly differ from a compact ecommerce card while remaining realistic. Do not make an advertising poster and do not add text or specifications.`, technicalProtection, settings.premiumLighting && "Use refined premium studio lighting with controlled highlights and realistic shadows.", settings.detailEnhancement && "Improve true visible surface detail without hallucinating construction.", settings.naturalShadow && "Retain a natural soft contact shadow beneath the product."].filter(Boolean).join("\n\n");
}

export function buildProjectPrompt(settings: PhotoStudioSettings) {
  return [`Enhance this real refrigeration installation or completed project photograph as professional industrial and architectural photography. Do not isolate the equipment. Do not replace the room or site with a studio. Preserve the building, room, walls, floor, pipes, installation, equipment, physical surroundings, and realistic spatial relationships. Keep the project factual and non-fictional. Add no equipment or architectural elements that were not present.`, technicalProtection, settings.exposure && "Improve exposure while retaining realistic local light.", settings.whiteBalance && "Correct white balance and material colors.", settings.perspectiveCorrection && "Correct perspective gently without changing the installation geometry.", settings.clutterCleanup && "Remove only minor visual clutter when it can be done without altering the project, installation, tools, safety elements, or structure.", settings.detailEnhancement && "Improve clarity of real visible detail without fabrication.", settings.preserveEnvironment && "The complete real environment must remain recognizable and spatially faithful."].filter(Boolean).join("\n\n");
}

export function buildTransparentPrompt(settings: PhotoStudioSettings) {
  return [`Precisely isolate the complete original product and return a PNG with real alpha transparency. Background pixels must be transparent. Do not generate a white background, checkerboard, studio wall, floor, or opaque decorative shadow. Preserve cables, copper pipes, valves, feet, frames, holes, and all thin technical components without clipping.`, technicalProtection, settings.edgeQuality && "Produce clean antialiased edges without halos or color spill.", settings.fineDetailProtection && "Give maximum protection to fine technical details and narrow gaps.", "The output must contain genuine transparent pixels outside the product."].filter(Boolean).join("\n\n");
}

export function buildAdvertisingPrompt(settings: PhotoStudioSettings) {
  const safeArea = { left: "left side", right: "right side", top: "upper area", auto: "most compositionally suitable side" }[settings.textSafeArea];
  const composition = { balanced: "balanced commercial", dynamic: "dynamic premium commercial", minimal: "minimal premium commercial" }[settings.composition];
  return [`Create a ${composition} visual with the real refrigeration product as the hero. Use cinematic but realistic lighting and a professional cold-chain or industrial visual language. Keep intentional clean negative space in the ${safeArea} for copy to be added later by the design layer. Generate no words, letters, numbers, random logos, marketing claims, specifications, prices, or warranties inside the image.`, technicalProtection, settings.premiumLighting && "Use high-end commercial lighting while keeping materials physically believable.", settings.detailEnhancement && "Enhance only real visible product detail.", "The final composition must remain usable without any generated text."].filter(Boolean).join("\n\n");
}

export const photoStudioPromptBuilders: Record<PhotoStudioMode, (settings: PhotoStudioSettings) => string> = {
  card: buildProductCardPrompt,
  detail: buildProductDetailPrompt,
  project: buildProjectPrompt,
  transparent: buildTransparentPrompt,
  ad: buildAdvertisingPrompt,
};

export function buildPhotoStudioPrompt(mode: PhotoStudioMode, settings: PhotoStudioSettings) {
  return photoStudioPromptBuilders[mode](settings);
}
