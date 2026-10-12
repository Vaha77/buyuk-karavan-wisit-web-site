import "server-only";
// Story videos live in the site storage (Neon S3) under stories/; the public URL is what Instagram's video_url fetches.
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_VIDEO_BYTES } from "./rules";

function config() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3, bucket = process.env.NEON_STORAGE_BUCKET, region = process.env.AWS_REGION, accessKeyId = process.env.AWS_ACCESS_KEY_ID, secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey) throw new Error("Story storage is not configured");
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("Invalid storage endpoint");
  return { endpoint: url.origin, bucket, region, accessKeyId, secretAccessKey };
}
const client = () => { const c = config(); return new S3Client({ endpoint: c.endpoint, region: c.region, forcePathStyle: true, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } }); };
export const isStoryKey = (key: string) => /^stories\/\d{4}-\d{2}\/[0-9a-f-]{36}\.mp4$/.test(key);
const newKey = () => `stories/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.mp4`;
export const publicUrl = (key: string) => { const c = config(); return `${c.endpoint}/${c.bucket}/${key}`; };

/** Direct upload (multipart request body). */
export async function putStoryVideo(body: Uint8Array) {
  const key = newKey();
  await client().send(new PutObjectCommand({ Bucket: config().bucket, Key: key, Body: body, ContentType: "video/mp4" }));
  return { key, url: publicUrl(key) };
}

/** Large files: a 10-minute presigned PUT, then POST /api/stories/queue with { videoKey }. */
export async function createStoryUpload(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_VIDEO_BYTES) throw new Error("size");
  const key = newKey();
  const uploadUrl = await getSignedUrl(client(), new PutObjectCommand({ Bucket: config().bucket, Key: key, ContentType: "video/mp4", Metadata: { "expected-size": String(size) } }), { expiresIn: 600 });
  return { key, uploadUrl, expiresIn: 600, headers: { "Content-Type": "video/mp4", "x-amz-meta-expected-size": String(size) } };
}

/** The uploaded object's bytes (≤100 MB) for checking; null when missing or too big. */
export async function readStoryVideo(key: string) {
  if (!isStoryKey(key)) return null;
  const c = config(), s3 = client();
  const head = await s3.send(new HeadObjectCommand({ Bucket: c.bucket, Key: key })).catch(() => null);
  if (!head?.ContentLength || head.ContentLength > MAX_VIDEO_BYTES) return null;
  const object = await s3.send(new GetObjectCommand({ Bucket: c.bucket, Key: key }));
  const bytes = await object.Body?.transformToByteArray();
  return bytes ? { bytes, size: head.ContentLength, url: publicUrl(key) } : null;
}

export async function deleteStoryVideo(key: string) {
  if (isStoryKey(key)) await client().send(new DeleteObjectCommand({ Bucket: config().bucket, Key: key })).catch(() => undefined);
}
