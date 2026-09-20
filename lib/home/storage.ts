import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const formats = new Map([
  ["image/jpeg", { extension: "jpg", signature: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }],
  ["image/png", { extension: "png", signature: (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 }],
  ["image/webp", { extension: "webp", signature: (b: Uint8Array) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" }],
]);

export class HomeImageValidationError extends Error {}
function config() { const endpoint = process.env.AWS_ENDPOINT_URL_S3; const bucket = process.env.NEON_STORAGE_BUCKET; const region = process.env.AWS_REGION; const accessKeyId = process.env.AWS_ACCESS_KEY_ID; const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY; if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey) throw new Error("Home image storage is not configured"); const url = new URL(endpoint); if (url.protocol !== "https:" || !url.hostname.endsWith(".neon.tech")) throw new Error("Invalid storage endpoint"); return { endpoint: url.origin, bucket, region, accessKeyId, secretAccessKey }; }
function client() { const c = config(); return new S3Client({ endpoint: c.endpoint, region: c.region, forcePathStyle: true, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } }); }

export async function uploadHomeImage(section: string, dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new HomeImageValidationError("Rasm formati qo‘llab-quvvatlanmaydi.");
  const format = formats.get(match[1]); const bytes = Buffer.from(match[2], "base64");
  if (!format || !bytes.length || bytes.length > 10 * 1024 * 1024 || !format.signature(bytes)) throw new HomeImageValidationError("Rasm fayli noto‘g‘ri yoki hajmi juda katta.");
  const c = config(); const safeSection = section.replace(/[^a-zA-Z0-9_-]/g, "-"); const key = `home/${safeSection}/${randomUUID()}.${format.extension}`;
  await client().send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: bytes, ContentType: match[1] }));
  return `${c.endpoint}/${c.bucket}/${key}`;
}

export function ownedHomeImageKey(url: string): string | null { const c = config(); try { const parsed = new URL(url); const prefix = `${c.endpoint}/${c.bucket}/home/`; if (!parsed.search && !parsed.hash && parsed.href.startsWith(prefix)) { const key = parsed.href.slice(`${c.endpoint}/${c.bucket}/`.length); if (/^home\/[A-Za-z0-9_-]+\/[0-9a-f-]+\.(jpg|png|webp)$/.test(key)) return key; } } catch {} return null; }
export async function deleteOwnedHomeImage(url: string) { const key = ownedHomeImageKey(url); if (!key) return; const c = config(); await client().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key })); }
