import "server-only";
// TTS audio lives in the site storage (Neon S3) under tts/ — public URLs (for the player, downloads and the API).
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { MIME, type AudioFormat } from "./audio";

function config() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3, bucket = process.env.NEON_STORAGE_BUCKET, region = process.env.AWS_REGION, accessKeyId = process.env.AWS_ACCESS_KEY_ID, secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey) throw new Error("TTS storage is not configured");
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("Invalid storage endpoint");
  return { endpoint: url.origin, bucket, region, accessKeyId, secretAccessKey };
}
export const storageReady = () => { try { config(); return true; } catch { return false; } };
const client = () => { const c = config(); return new S3Client({ endpoint: c.endpoint, region: c.region, forcePathStyle: true, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } }); };
const publicUrl = (key: string) => { const c = config(); return `${c.endpoint}/${c.bucket}/${key}`; };
export const isTtsKey = (key: string) => /^tts\/(\d{4}-\d{2}\/[0-9a-f-]{36}|samples\/[a-z0-9-]+-[0-9a-f]{40})\.(mp3|wav)$/.test(key);

async function put(key: string, bytes: Uint8Array, format: AudioFormat, filename: string) {
  await client().send(new PutObjectCommand({ Bucket: config().bucket, Key: key, Body: bytes, ContentType: MIME[format], ContentDisposition: `inline; filename="${filename}"`, CacheControl: "public, max-age=31536000, immutable" }));
  return { key, url: publicUrl(key) };
}

/** A generated voice-over (tts/2026-10/<uuid>.mp3). */
export function putTtsAudio(bytes: Uint8Array, format: AudioFormat) {
  const id = randomUUID();
  return put(`tts/${new Date().toISOString().slice(0, 7)}/${id}.${format}`, bytes, format, `bk-ovoz-${id.slice(0, 8)}.${format}`);
}

/** Gallery samples are cached by provider + hash (same voice, language, sentence → the same file, generated once). */
export const sampleKey = (provider: string, hash: string, format: AudioFormat) => `tts/samples/${provider}-${hash}.${format}`;
export async function existingSample(key: string) {
  if (!isTtsKey(key)) return null;
  const head = await client().send(new HeadObjectCommand({ Bucket: config().bucket, Key: key })).catch(() => null);
  return head?.ContentLength ? publicUrl(key) : null;
}
export const putSample = (key: string, bytes: Uint8Array, format: AudioFormat) => put(key, bytes, format, key.split("/").pop()!);

export async function deleteTtsAudio(key: string | null) {
  if (key && isTtsKey(key)) await client().send(new DeleteObjectCommand({ Bucket: config().bucket, Key: key })).catch(() => undefined);
}
