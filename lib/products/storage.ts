import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const formats = new Map([
  ["image/jpeg", { extension: "jpg", signature: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }],
  ["image/png", { extension: "png", signature: (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 }],
  ["image/webp", { extension: "webp", signature: (b: Uint8Array) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" }],
]);

export class ImageValidationError extends Error {}

function config() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const bucket = process.env.NEON_STORAGE_BUCKET;
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey) throw new Error("Product image storage is not configured");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".neon.tech")) throw new Error("Invalid storage endpoint");
  return { endpoint: url.origin, bucket, region, accessKeyId, secretAccessKey };
}

function client() {
  const c = config();
  return new S3Client({ endpoint: c.endpoint, region: c.region, forcePathStyle: true,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } });
}

export function ownedImageKey(url: string, productId: string): string | null {
  const c = config();
  try {
    const parsed = new URL(url);
    const prefix = `${c.endpoint}/${c.bucket}/products/${productId}/`;
    if (!parsed.search && !parsed.hash && parsed.href.startsWith(prefix)) {
      const key = parsed.href.slice(`${c.endpoint}/${c.bucket}/`.length);
      if (/^products\/[A-Za-z0-9_-]+\/[0-9a-f-]+\.(jpg|png|webp)$/.test(key)) return key;
    }
  } catch { /* An old or external URL is never ours to delete. */ }
  return null;
}

export function imageOwnerId(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/^\/[^/]+\/products\/([A-Za-z0-9_-]+)\/[0-9a-f-]+\.(jpg|png|webp)$/);
    return match && ownedImageKey(url, match[1]) ? match[1] : null;
  } catch { return null; }
}

export async function uploadProductImage(productId: string, file: File, maxSize = MAX_IMAGE_SIZE): Promise<string> {
  if (!(file instanceof File)) throw new ImageValidationError("Rasmni tanlang.");
  const format = formats.get(file.type);
  if (!format) throw new ImageValidationError("Rasm formati qo‘llab-quvvatlanmaydi.");
  if (!file.size || file.size > maxSize) throw new ImageValidationError("Rasm hajmi juda katta.");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!format.signature(buffer)) throw new ImageValidationError("Rasm formati qo‘llab-quvvatlanmaydi.");
  const c = config();
  const key = `products/${productId}/${randomUUID()}.${format.extension}`;
  await client().send(new PutObjectCommand({
    Bucket: c.bucket,
    Key: key,
    Body: buffer,
    ContentLength: buffer.byteLength,
    ContentType: file.type,
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return `${c.endpoint}/${c.bucket}/${key}`;
}

export async function deleteOwnedImage(url: string, productId: string) {
  const key = ownedImageKey(url, productId);
  if (!key) return;
  const c = config();
  await client().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }));
}
