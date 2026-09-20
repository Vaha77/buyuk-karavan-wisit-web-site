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

export async function uploadProductImage(productId: string, file: File): Promise<string> {
  if (!(file instanceof File)) throw new ImageValidationError("Rasmni tanlang.");
  const format = formats.get(file.type);
  if (!format) throw new ImageValidationError("Rasm formati qo‘llab-quvvatlanmaydi.");
  if (!file.size || file.size > MAX_IMAGE_SIZE) throw new ImageValidationError("Rasm hajmi juda katta.");
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (!format.signature(buffer)) throw new ImageValidationError("Rasm formati qo‘llab-quvvatlanmaydi.");
  const c = config();
  const key = `products/${productId}/${randomUUID()}.${format.extension}`;
  await client().send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: buffer, ContentType: file.type }));
  return `${c.endpoint}/${c.bucket}/${key}`;
}

export async function deleteOwnedImage(url: string, productId: string) {
  const key = ownedImageKey(url, productId);
  if (!key) return;
  const c = config();
  await client().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }));
}

export async function uploadProduct360Source(productId: string, slot: string, file: File): Promise<string> {
  if(!/^real-(12-(00[1-9]|01[0-2])|24-(00[1-9]|01\d|02[0-4]))$/.test(slot))throw new ImageValidationError("360° burchak noto‘g‘ri.");
  if (!(file instanceof File)) throw new ImageValidationError("Rasmni tanlang.");
  const format = formats.get(file.type);
  if (!format) throw new ImageValidationError("Rasm formati qo‘llab-quvvatlanmaydi.");
  if (!file.size || file.size > MAX_IMAGE_SIZE) throw new ImageValidationError("Rasm hajmi juda katta.");
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (!format.signature(buffer)) throw new ImageValidationError("Rasm formati qo‘llab-quvvatlanmaydi.");
  const c = config();
  const key = `products/${productId}/360/sources/${slot}-${randomUUID()}.${format.extension}`;
  await client().send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: buffer, ContentType: file.type }));
  return `${c.endpoint}/${c.bucket}/${key}`;
}

export async function deleteOwnedProduct360Image(url: string, productId: string) {
  const c = config();
  try {
    const parsed = new URL(url);
    const prefix = `${c.endpoint}/${c.bucket}/products/${productId}/360/`;
    if (parsed.search || parsed.hash || !parsed.href.startsWith(prefix)) return;
    const key = parsed.href.slice(`${c.endpoint}/${c.bucket}/`.length);
    if (!/^products\/[A-Za-z0-9_-]+\/360\/(sources\/((front|right|back|left)|frame-(00[1-9]|01\d|02[0-4])|real-(12-(00[1-9]|01[0-2])|24-(00[1-9]|01\d|02[0-4])))-[0-9a-f-]+|frames\/\d{3,}-[0-9a-f-]+)\.(jpg|png|webp)$/.test(key)) return;
    await client().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }));
  } catch { /* External and malformed URLs are never deleted. */ }
}

export async function uploadProduct360Frame(productId:string,position:number,bytes:Uint8Array){
  if(!Number.isInteger(position)||position<1||position>999||!bytes.length||bytes.length>20*1024*1024)throw new ImageValidationError("360° kadr noto‘g‘ri.");
  const c=config();const key=`products/${productId}/360/frames/${String(position).padStart(3,"0")}-${randomUUID()}.png`;
  await client().send(new PutObjectCommand({Bucket:c.bucket,Key:key,Body:bytes,ContentType:"image/png"}));return `${c.endpoint}/${c.bucket}/${key}`;
}
