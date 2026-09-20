import "server-only";
import OpenAI, { APIError, toFile } from "openai";
import sharp from "sharp";
import { composeCreativeAdvertisement } from "./advertising";
import { buildPhotoStudioPrompt } from "./prompts";
import type { PhotoStudioAdvertisingData, PhotoStudioAspectRatio, PhotoStudioMode, PhotoStudioSettings } from "./types";

export class OpenAINotConfiguredError extends Error {}
export class PhotoStudioRateLimitError extends Error {}
export class PhotoStudioTimeoutError extends Error {}
export class PhotoStudioNoImageError extends Error {}
export class PhotoStudioTransparencyError extends Error {}
export class PhotoStudioCompositionError extends Error {}
export class PhotoStudioAIError extends Error {}

const PHOTO_STUDIO_MODEL = "gpt-image-2.5-sunburst";
const CREATIVE_AD_NATIVE_SIZE = "1440x2560";
const CREATIVE_AD_OUTPUT = { width: 1440, height: 2560 } as const;

function dimensions(size: number, ratio: PhotoStudioAspectRatio, source?: { width?: number; height?: number }) {
  if (ratio === "4:5") return { width: Math.round(size * 0.8), height: size };
  if (ratio === "9:16") return { width: Math.round(size * 9 / 16), height: size };
  if (ratio === "16:9") return { width: size, height: Math.round(size * 9 / 16) };
  if (ratio === "original" && source?.width && source.height) {
    return source.width >= source.height ? { width: size, height: Math.max(1, Math.round(size * source.height / source.width)) } : { width: Math.max(1, Math.round(size * source.width / source.height)), height: size };
  }
  return { width: size, height: size };
}

function canvasBackground(settings: PhotoStudioSettings) {
  if (settings.background === "transparent") return { r: 0, g: 0, b: 0, alpha: 0 };
  if (settings.background === "light-gray" || settings.background === "premium-neutral") return { r: 244, g: 246, b: 248, alpha: 1 };
  if (settings.background === "premium-industrial") return { r: 230, g: 236, b: 241, alpha: 1 };
  return { r: 255, g: 255, b: 255, alpha: 1 };
}

async function hasRealTransparency(bytes: Buffer) {
  const image = sharp(bytes);
  const metadata = await image.metadata();
  if (!metadata.hasAlpha) return false;
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += info.channels) if (data[index] < 250) return true;
  return false;
}

export async function editProductImage(input: { bytes: Uint8Array; type: string; name: string; mode: PhotoStudioMode; settings: PhotoStudioSettings; advertising?: PhotoStudioAdvertisingData }) {
  if (!process.env.OPENAI_API_KEY) throw new OpenAINotConfiguredError();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 0 });
  const apiEdge = input.settings.size === 1000 ? 1024 : input.settings.size === 1500 ? 1504 : 2000;
  const transparent = input.mode === "transparent";
  const apiSize = input.mode === "ad" ? CREATIVE_AD_NATIVE_SIZE : `${apiEdge}x${apiEdge}`;
  try {
    const sourceMetadata = await sharp(input.bytes).metadata();
    const response = await client.images.edit({
      model: PHOTO_STUDIO_MODEL,
      image: await toFile(input.bytes, input.name, { type: input.type }),
      prompt: buildPhotoStudioPrompt(input.mode, input.settings),
      background: transparent ? "transparent" : "opaque",
      output_format: "png",
      quality: input.mode === "ad" ? "max" : "high",
      size: apiSize,
      n: 1,
    });
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw new PhotoStudioNoImageError();
    const generated = Buffer.from(encoded, "base64");
    if (transparent && !(await hasRealTransparency(generated))) throw new PhotoStudioTransparencyError();
    const output = input.mode === "ad" ? CREATIVE_AD_OUTPUT : dimensions(input.settings.size, input.settings.aspectRatio, sourceMetadata);
    let result: Buffer<ArrayBufferLike> = input.mode === "ad"
      ? await sharp(generated).resize(output.width, output.height, { fit: "cover", position: "centre", withoutEnlargement: true }).png({ compressionLevel: 6 }).toBuffer()
      : await sharp(generated).resize(output.width, output.height, { fit: "contain", position: "centre", background: canvasBackground(input.settings), withoutEnlargement: false }).png({ quality: 100 }).toBuffer();
    if (input.mode === "ad") {
      if (!input.advertising || input.advertising.command !== "/creativeads") throw new PhotoStudioCompositionError();
      try { result = await composeCreativeAdvertisement({ visual: result, ...output, data: input.advertising }); }
      catch (error) { if (error instanceof PhotoStudioCompositionError) throw error; throw new PhotoStudioCompositionError(); }
    }
    if (transparent && !(await hasRealTransparency(result))) throw new PhotoStudioTransparencyError();
    return { bytes: result, contentType: "image/png" as const, ...output };
  } catch (error) {
    if (error instanceof PhotoStudioNoImageError || error instanceof PhotoStudioTransparencyError || error instanceof PhotoStudioCompositionError) throw error;
    if (error instanceof APIError) {
      console.error("Photo Studio OpenAI API error", { status: error.status, code: error.code, type: error.type, message: error.message, param: error.param, model: PHOTO_STUDIO_MODEL, size: apiSize });
      if (error.status === 429) throw new PhotoStudioRateLimitError();
      if (error.status === 408) throw new PhotoStudioTimeoutError();
    }
    if (error instanceof Error && (error.name === "APIConnectionTimeoutError" || error.message.toLowerCase().includes("timed out"))) throw new PhotoStudioTimeoutError();
    throw new PhotoStudioAIError();
  }
}
