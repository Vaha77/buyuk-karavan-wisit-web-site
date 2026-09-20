import "server-only";
import OpenAI, { APIError, toFile } from "openai";
import sharp from "sharp";
import { buildPhotoStudioPrompt } from "./prompts";
import type { PhotoStudioMode, PhotoStudioSettings } from "./types";

export class OpenAINotConfiguredError extends Error {}
export class PhotoStudioRateLimitError extends Error {}
export class PhotoStudioAIError extends Error {}

const PHOTO_STUDIO_MODEL = "gpt-image-2.5-sunburst";

export async function editProductImage(input: { bytes: Uint8Array; type: string; name: string; mode: PhotoStudioMode; settings: PhotoStudioSettings }) {
  if (!process.env.OPENAI_API_KEY) throw new OpenAINotConfiguredError();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 0 });
  const apiEdge = input.settings.size === 1000 ? 1024 : input.settings.size === 1500 ? 1504 : 2000;
  const transparent = input.mode === "transparent" || input.settings.background === "transparent";
  const apiSize = `${apiEdge}x${apiEdge}`;
  try {
    const response = await client.images.edit({
      model: PHOTO_STUDIO_MODEL,
      image: await toFile(input.bytes, input.name, { type: input.type }),
      prompt: buildPhotoStudioPrompt(input.mode, input.settings),
      background: transparent ? "transparent" : "opaque",
      output_format: "png",
      quality: "high",
      size: apiSize,
      n: 1,
    });
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw new PhotoStudioAIError();
    const result = await sharp(Buffer.from(encoded, "base64")).resize(input.settings.size, input.settings.size, { fit: "contain", background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();
    return { bytes: result, contentType: "image/png" as const, width: input.settings.size, height: input.settings.size };
  } catch (error) {
    if (error instanceof PhotoStudioAIError) throw error;
    if (error instanceof APIError) {
      console.error("Photo Studio OpenAI API error", {
        status: error.status,
        code: error.code,
        type: error.type,
        message: error.message,
        param: error.param,
        model: PHOTO_STUDIO_MODEL,
        size: apiSize,
      });
      if (error.status === 429) throw new PhotoStudioRateLimitError();
    }
    throw new PhotoStudioAIError();
  }
}
