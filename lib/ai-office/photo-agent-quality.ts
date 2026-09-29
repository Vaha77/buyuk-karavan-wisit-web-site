import sharp from "sharp";

export type PhotoQuality = { ok: true } | { ok: false; reason: "empty" | "too-small" | "tiny-subject" | "cropped" };

/**
 * Checks a processed card image (white background, product centered): not blank, at least 1400px,
 * the product occupies a sensible share and does not touch the canvas edges (a cut-off product).
 */
export async function assessProcessedImage(bytes: Uint8Array, options: { minEdge?: number } = {}): Promise<PhotoQuality> {
  if (!bytes.length) return { ok: false, reason: "empty" };
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) return { ok: false, reason: "empty" };
  if (Math.min(metadata.width, metadata.height) < (options.minEdge ?? 1400)) return { ok: false, reason: "too-small" };
  const size = 160;
  const { data, info } = await sharp(bytes).flatten({ background: "#ffffff" }).resize(size, size, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = size, minY = size, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const index = (y * info.width + x) * info.channels;
    // Soft shadows are light grey; only clearly non-background pixels count as product.
    if (Math.min(data[index], data[index + 1], data[index + 2]) < 200) { count++; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  }
  if (count < size * size * 0.01) return { ok: false, reason: "empty" };
  const area = ((maxX - minX + 1) * (maxY - minY + 1)) / (size * size);
  if (area < 0.06) return { ok: false, reason: "tiny-subject" };
  const edge = 1;
  if (minX < edge || minY < edge || maxX > size - 1 - edge || maxY > size - 1 - edge) return { ok: false, reason: "cropped" };
  return { ok: true };
}

export const PHOTO_QUALITY_MESSAGE: Record<Exclude<PhotoQuality, { ok: true }>["reason"], string> = {
  empty: "Tayyor rasm bo‘sh chiqdi",
  "too-small": "Tayyor rasm o‘lchami 1500px dan kichik chiqdi",
  "tiny-subject": "Mahsulot rasmda juda kichik chiqdi",
  cropped: "Mahsulot rasm chetida kesilib qoldi",
};
