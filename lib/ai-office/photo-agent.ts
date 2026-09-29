import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import heicConvert from "heic-convert";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import { Prisma, type AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit/service";
import { recordPhotoStudioCreation } from "@/lib/audit/photo-studio";
import { photoStudioModeConfigs } from "@/lib/photo-studio/modes";
import { editProductImage, OpenAINotConfiguredError, PhotoStudioNoImageError, PhotoStudioRateLimitError, PhotoStudioTimeoutError } from "@/lib/photo-studio/openai";
import { deletePendingPhoto, getPendingPhoto, isPendingPhotoKey, putPendingPhoto } from "@/lib/products/storage";
import { assessProcessedImage, PHOTO_QUALITY_MESSAGE } from "./photo-agent-quality";
import { normalizePhotoQuery, PHOTO_AGENT_DEADLINE_MS, PHOTO_AGENT_MAX_FILE_BYTES, planPlacements, type PhotoCandidate } from "./photo-agent-rules";
import { extractProductModels } from "./product-agent-rules";

/** Server whitelist. The interpreting LLM gets none of them as write access: it only ranks candidates from the image. */
export const PHOTO_AGENT_TOOLS = ["findProducts", "processPhoto", "buildPhotoPreview"] as const;
export const PHOTO_AGENT_ID = "photo-agent-02";
const DEFAULT_MODEL = "gpt-4.1";
const PREVIEW_TTL = 30 * 60_000;

/** Errors whose message is safe and meant for the admin. */
export class PhotoAgentUserError extends Error {}


// ---- findProducts ----------------------------------------------------------------------------

type CandidateRow = { id: string; name: string; model: string; images: string[]; category: string };
const compactSql = (column: Prisma.Sql) => Prisma.sql`regexp_replace(lower(${column}), 'xueying|xueing|[^a-z0-9]+', '', 'g')`;

export async function findProducts(query: string): Promise<PhotoCandidate[]> {
  const models = extractProductModels(query).map(normalizePhotoQuery);
  const text = normalizePhotoQuery(query);
  let where: Prisma.Sql;
  if (models.length) where = Prisma.join(models.map(model => Prisma.sql`${compactSql(Prisma.sql`p.model`)} = ${model}`), " OR ");
  else if (text.length >= 3) where = Prisma.sql`${compactSql(Prisma.sql`p.model`)} = ${text} OR ${compactSql(Prisma.sql`p.name || ' ' || p.model`)} LIKE ${`%${text}%`}`;
  else return [];
  const rows = await getDb().$queryRaw<CandidateRow[]>(Prisma.sql`SELECT p.id, p.name, p.model, p.images, c.name AS category FROM "Product" p JOIN "ProductCategory" c ON c.id = p."categoryId" WHERE ${where} ORDER BY p."order" ASC, p.name ASC LIMIT 12`);
  return rows.map(row => ({ id: row.id, name: row.name, model: row.model, category: row.category, hasMainImage: Boolean(row.images[0]), mainImage: row.images[0] || null }));
}

// ---- uploads ---------------------------------------------------------------------------------

export type PreparedUpload = { bytes: Uint8Array; type: "image/jpeg"; name: string; original: string };
function isHeic(bytes: Uint8Array, file: File) {
  const brand = bytes.length > 12 && new TextDecoder("latin1").decode(bytes.slice(4, 12));
  return /heic|heif/iu.test(file.type) || /\.hei[cf]$/iu.test(file.name) || (!!brand && /^ftyp(?:heic|heix|hevc|hevx|mif1|msf1)$/u.test(brand));
}
const magic = { jpeg: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, png: (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, webp: (b: Uint8Array) => new TextDecoder("latin1").decode(b.slice(0, 4)) === "RIFF" && new TextDecoder("latin1").decode(b.slice(8, 12)) === "WEBP" };

export function validatePhotoAgentFile(file: File) {
  if (!file.size || file.size > PHOTO_AGENT_MAX_FILE_BYTES) throw new PhotoAgentUserError("Har bir rasm 10 MB dan oshmasin.");
}

/** JPG/PNG/WEBP/HEIC → EXIF-rotated JPEG without metadata (phone GPS is dropped), longest edge ≤ 2048px. */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  let bytes = new Uint8Array(await file.arrayBuffer());
  if (isHeic(bytes, file)) {
    try { bytes = new Uint8Array(await sharp(bytes).jpeg({ quality: 94 }).toBuffer()); }
    catch {
      try { bytes = new Uint8Array(await heicConvert({ buffer: bytes, format: "JPEG", quality: 0.94 })); }
      catch { throw new PhotoAgentUserError(`${file.name}: HEIC rasmni o‘qib bo‘lmadi. Telefon sozlamasida “Eng mos” (JPG) formatini tanlang.`); }
    }
  } else if (!magic.jpeg(bytes) && !magic.png(bytes) && !magic.webp(bytes)) throw new PhotoAgentUserError(`${file.name}: faqat JPG, PNG, WEBP yoki HEIC rasm yuboring.`);
  try {
    const jpeg = await sharp(bytes).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
    return { bytes: new Uint8Array(jpeg), type: "image/jpeg", name: `${(file.name.replace(/\.[^.]+$/u, "").replace(/[^A-Za-z0-9_-]/g, "_") || "photo").slice(0, 60)}.jpg`, original: file.name.slice(0, 120) };
  } catch { throw new PhotoAgentUserError(`${file.name}: rasm fayli buzilgan yoki o‘qib bo‘lmadi.`); }
}

// ---- interpretation (read-only LLM) ----------------------------------------------------------

const recommendationSchema = z.object({ productId: z.string().nullable() });
/** When several products share a model, the photo decides which one is shown (e.g. a whole unit vs. a bare compressor). */
export async function recommendCandidate(candidates: PhotoCandidate[], image: PreparedUpload, message: string): Promise<string | null> {
  if (candidates.length < 2 || !process.env.OPENAI_API_KEY) return null;
  try {
    const thumbnail = await sharp(image.bytes).resize(768, 768, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25_000, maxRetries: 0 });
    const response = await client.responses.parse({
      model: process.env.OPENAI_PHOTO_AGENT_MODEL?.trim() || DEFAULT_MODEL, store: false,
      input: [
        { role: "system", content: "Rasmdagi sovutish uskunasini ko‘rib, ro‘yxatdan eng mos mahsulot id sini tanla. Kompressor alohida, havoli (vazdushniy) agregat — kompressor + ventilyatorli kondensator ramada, vadinoy agregat — suvli kondensatorli, komplekt — agregat + isparitel. Ishonching komil bo‘lmasa productId=null qaytar." },
        { role: "user", content: [{ type: "input_text", text: `Admin xabari: ${message}\nNomzodlar: ${JSON.stringify(candidates.map(item => ({ id: item.id, name: item.name, model: item.model, category: item.category })))}` }, { type: "input_image", image_url: `data:image/jpeg;base64,${thumbnail.toString("base64")}`, detail: "low" }] },
      ],
      text: { format: zodTextFormat(recommendationSchema, "photo_agent_recommendation") },
    });
    const id = response.output_parsed?.productId;
    return id && candidates.some(item => item.id === id) ? id : null;
  } catch (error) {
    console.warn("[PhotoAgent] recommendation skipped", { name: error instanceof Error ? error.name : "UnknownError" });
    return null;
  }
}

// ---- processPhoto ----------------------------------------------------------------------------

export type ProcessedPhoto = { bytes: Buffer; width: number; height: number; original: string };
/**
 * Foto Studio "card": background removed, white, centered, 1:1, 1500px, natural shadow; protectProduct keeps shape, logo and text.
 * One image per request; a bad result is retried once if the 90 s budget allows.
 */
export async function processPhoto(upload: PreparedUpload): Promise<ProcessedPhoto> {
  const deadline = Date.now() + PHOTO_AGENT_DEADLINE_MS;
  const settings = { ...photoStudioModeConfigs.card.defaults, protectProduct: true };
  let lastProblem = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2 && deadline - Date.now() < 35_000) break;
    try {
      const result = await withDeadline(editProductImage({ bytes: upload.bytes, type: upload.type, name: upload.name, mode: "card", settings }), deadline);
      const quality = await assessProcessedImage(result.bytes);
      if (quality.ok) return { bytes: result.bytes, width: result.width, height: result.height, original: upload.original };
      lastProblem = PHOTO_QUALITY_MESSAGE[quality.reason];
    } catch (error) {
      if (error instanceof PhotoAgentUserError) throw error;
      if (error instanceof OpenAINotConfiguredError) throw new PhotoAgentUserError("OpenAI API sozlanmagan.");
      if (error instanceof PhotoStudioRateLimitError) throw new PhotoAgentUserError("AI xizmati so‘rovlari vaqtincha cheklangan. Bir daqiqadan so‘ng qayta urinib ko‘ring.");
      if (error instanceof PhotoStudioTimeoutError) throw new PhotoAgentUserError("AI xizmati 90 soniyada javob bermadi. Qayta urinib ko‘ring.");
      lastProblem = error instanceof PhotoStudioNoImageError ? PHOTO_QUALITY_MESSAGE.empty : "Rasmga ishlov berish amalga oshmadi";
    }
  }
  throw new PhotoAgentUserError(`${upload.original}: ${lastProblem || "rasm tayyorlanmadi"}. Mahsulot to‘liq ko‘rinadigan boshqa rasm bilan qayta urinib ko‘ring.`);
}

async function withDeadline<T>(work: Promise<T>, deadline: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PhotoAgentUserError("Ishlov berish 90 soniyadan oshdi. Rasmni qayta yuboring yoki boshqa rasm tanlang.")), Math.max(1, deadline - Date.now())); });
  try { return await Promise.race([work, timeout]); } finally { clearTimeout(timer); }
}

// ---- buildPhotoPreview (no database writes) --------------------------------------------------

export type PhotoPreviewPayload = { id: string; agentId: typeof PHOTO_AGENT_ID; adminId: string; sessionId: string; createdAt: number; expiresAt: number; product: { id: string; name: string; model: string; category: string }; index: number; placement: "main" | "gallery"; key: string; sha256: string; width: number; height: number };
export function sha256(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }

/** Stores the full PNG under a temporary key and returns a signed preview (only the key, never the image) plus a 600px JPEG for display. */
export async function buildPhotoPreview(args: { product: PhotoCandidate; processed: ProcessedPhoto; index: number; total: number; wantsMain: boolean; adminId: string; sessionId: string }) {
  const placement = planPlacements(args.total, args.product.hasMainImage, args.wantsMain)[args.index] ?? "gallery";
  const key = await putPendingPhoto(args.processed.bytes);
  const now = Date.now();
  const payload: PhotoPreviewPayload = {
    id: randomUUID(), agentId: PHOTO_AGENT_ID, adminId: args.adminId, sessionId: args.sessionId, createdAt: now, expiresAt: now + PREVIEW_TTL,
    product: { id: args.product.id, name: args.product.name, model: args.product.model, category: args.product.category },
    index: args.index, placement, key, sha256: sha256(args.processed.bytes), width: args.processed.width, height: args.processed.height,
  };
  const preview = await sharp(args.processed.bytes).resize(600, 600, { fit: "inside" }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
  return { payload, previewJpeg: preview.toString("base64") };
}

// Signed like the Product agent preview: HMAC keyed by the admin session, so a token only works in this session.
export function signPhotoPreview(payload: PhotoPreviewPayload, sessionTokenHash: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", sessionTokenHash).update(body).digest("base64url")}`;
}
export function verifyPhotoPreview(token: string, adminId: string, sessionId: string, sessionTokenHash: string, options: { allowExpired?: boolean } = {}): PhotoPreviewPayload {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) throw new Error("PREVIEW_TOKEN_INVALID");
  const expected = createHmac("sha256", sessionTokenHash).update(body).digest(); const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("PREVIEW_TOKEN_INVALID");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PhotoPreviewPayload;
  if (payload.agentId !== PHOTO_AGENT_ID || payload.adminId !== adminId || payload.sessionId !== sessionId || !isPendingPhotoKey(payload.key) || (!options.allowExpired && payload.expiresAt < Date.now())) throw new Error("PREVIEW_TOKEN_INVALID");
  return payload;
}

// ---- confirm ---------------------------------------------------------------------------------

export async function isPhotoPreviewConfirmed(payload: PhotoPreviewPayload) {
  return Boolean(await getDb().auditLog.findFirst({ where: { action: "AI_PHOTO_CONFIRMED", entityType: "AI_AGENT", entityId: payload.id }, select: { id: true } }));
}

/** Loads the pending PNG, checks it is the previewed one and creates the Foto Studio asset used by the shared save path. */
export async function claimPhotoPreview(payload: PhotoPreviewPayload, actor: Pick<AdminUser, "id" | "name">) {
  const image = await getPendingPhoto(payload.key).catch(() => { throw new PhotoAgentUserError("Vaqtinchalik rasm topilmadi. Rasmni qayta ishlang."); });
  if (sha256(image) !== payload.sha256) throw new PhotoAgentUserError("Rasm preview bilan mos emas. Qayta ishlang.");
  const product = await getDb().product.findUnique({ where: { id: payload.product.id }, select: { images: true } });
  if (!product) throw new PhotoAgentUserError("Mahsulot topilmadi.");
  const asset = await recordPhotoStudioCreation(actor, "card", payload.width, payload.height);
  return { image, assetId: asset.id, previousMainImage: product.images[0] || null };
}

/** Audit: who (actor), when (createdAt), which product, main/gallery, the previous main image URL. */
export async function auditPhotoConfirmed(payload: PhotoPreviewPayload, actor: Pick<AdminUser, "id" | "name">, details: { assetId: string; previousMainImage: string | null }) {
  const product = await getDb().product.findUnique({ where: { id: payload.product.id }, select: { images: true } });
  await writeAudit(actor, { action: "AI_PHOTO_CONFIRMED", entityType: "AI_AGENT", entityId: payload.id, entityName: payload.product.name, summary: `Foto agent rasmni ${payload.placement === "main" ? "asosiy rasm" : "galereya"} sifatida saqladi`, before: { mainImage: details.previousMainImage }, after: { mainImage: product?.images[0] || null, imageCount: product?.images.length ?? null }, metadata: { agentId: PHOTO_AGENT_ID, previewId: payload.id, productId: payload.product.id, productModel: payload.product.model, placement: payload.placement, previousMainImage: details.previousMainImage, assetId: details.assetId, index: payload.index } });
}

export { deletePendingPhoto };
