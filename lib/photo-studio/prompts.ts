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
  return [`Execute our dedicated /creativeads art direction. Create a finished, visually powerful premium 9:16 Instagram Reels and Stories campaign visual for an industrial refrigeration company. This is an advertisement, not product cleanup, a centered catalog photo, a generic warehouse snapshot, or a product pasted onto a background. Build a coherent cold-chain or refrigeration environment with atmospheric foreground and background depth, controlled blue industrial tones, realistic premium reflections, believable floor contact shadows, strong subject separation, and agency-quality B2B commercial photography. Make the uploaded product large, dominant, complete, and visually impressive as the hero.`, "Compose the scene intelligently around this specific product. Keep the upper 20–25% visually controlled for brand and headline, the complete product prominent through the middle, and the bottom 18–22% readable for applications, CTA, and contact. Avoid a rigid catalog pose, huge blank areas, a tiny product, or a boring centered composition. Extend the environment, lighting, texture, and atmosphere fully to every edge of the native 9:16 canvas. Never create letterboxing, white bars, empty canvas, or unused bands.", "Our application adds all supplied advertising text and branding in a second deterministic stage. Generate absolutely no words, letters, numbers, fake logos, labels, claims, specifications, prices, or warranties in the AI scene.", technicalProtection, settings.premiumLighting && "Use cinematic commercial lighting with controlled highlights, realistic shadows, premium separation, dramatic but believable depth, and physically accurate materials. Avoid effects, fog, darkness, or graphic elements that hide technical parts.", "Keep every product component unobstructed and inside the safe central composition. Do not add unrelated refrigeration components, duplicate parts, create fantasy machinery, crop the product, stretch it, deform it, redesign it, recolor it, or obscure its technical construction. Background creativity must never override product fidelity."].filter(Boolean).join("\n\n");
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
