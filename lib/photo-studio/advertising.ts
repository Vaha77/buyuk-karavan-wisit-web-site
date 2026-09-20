import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import type { PhotoStudioAdvertisingData } from "./types";

type ComposeInput = { visual: Buffer; width: number; height: number; data: PhotoStudioAdvertisingData; logo?: Buffer };
type Layout = { padding: number; headerX: number; headerY: number; headerWidth: number; headlineSize: number; subSize: number; bodySize: number; benefitsY: number; footerY: number; footerHeight: number };

const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
function wrap(value: string, maxCharacters: number) { const words = value.trim().split(/\s+/).filter(Boolean); const result: string[] = []; let line = ""; for (const word of words) { const next = line ? `${line} ${word}` : word; if (next.length <= maxCharacters || !line) line = next; else { result.push(line); line = word; } } if (line) result.push(line); return result; }
function present(data: PhotoStudioAdvertisingData) { return Boolean(data.brand || data.headline || data.subheadline || data.benefits.length || data.applications.length || data.phone || data.website || data.cta); }

function layoutFor(width: number, height: number, headlineLength: number): Layout {
  const short = Math.min(width, height); const padding = Math.round(short * 0.055); const shrink = headlineLength > 120 ? 0.7 : headlineLength > 75 ? 0.82 : 1;
  return { padding, headerX: padding, headerY: padding, headerWidth: width - padding * 2, headlineSize: Math.round(short * 0.083 * shrink), subSize: Math.round(short * 0.034), bodySize: Math.round(short * 0.025), benefitsY: Math.round(height * 0.255), footerY: Math.round(height * 0.775), footerHeight: Math.round(height * 0.225) };
}

function createOverlay(input: ComposeInput) {
  const { width, height, data } = input; const layout = layoutFor(width, height, data.headline.length); const { padding, bodySize } = layout; const nodes: string[] = [];
  const text = (value: string, x: number, y: number, size: number, weight: number, color = "#fff", anchor = "start", spacing = 0) => nodes.push(`<text x="${x}" y="${y}" fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${spacing}">${xml(value)}</text>`);
  const multiline = (value: string, x: number, y: number, maxWidth: number, size: number, weight: number, color = "#fff", lineHeight = 1.12) => { const rows = wrap(value, Math.max(10, Math.floor(maxWidth / (size * 0.55)))); rows.forEach((row, index) => text(row, x, y + index * size * lineHeight, size, weight, color)); return y + rows.length * size * lineHeight; };

  nodes.push(`<rect width="${width}" height="${Math.round(height * 0.36)}" fill="url(#topShade)"/>`);
  nodes.push(`<rect y="${layout.footerY - Math.round(layout.footerHeight * 0.3)}" width="${width}" height="${height - layout.footerY + Math.round(layout.footerHeight * 0.3)}" fill="url(#bottomShade)"/>`);

  let y = layout.headerY + Math.round(layout.headlineSize * 0.3);
  if (data.brand) { nodes.push(`<rect x="${layout.headerX}" y="${y - layout.bodySize}" width="${Math.max(5, Math.round(layout.bodySize * 0.14))}" height="${Math.round(layout.bodySize * 1.25)}" rx="3" fill="#55bff5"/>`); text(data.brand, layout.headerX + Math.round(layout.bodySize * 0.55), y, Math.round(layout.bodySize * 0.9), 800, "#a9dcf8", "start", Math.max(1, Math.round(bodySize * 0.08))); y += Math.round(layout.bodySize * 1.75); }
  if (data.headline) y = multiline(data.headline, layout.headerX, y + layout.headlineSize, layout.headerWidth, layout.headlineSize, 900) + Math.round(layout.headlineSize * 0.1);
  if (data.subheadline) multiline(data.subheadline, layout.headerX, y + layout.subSize, layout.headerWidth, layout.subSize, 500, "#d9eaf4", 1.2);

  const benefitValues = data.benefits.slice(0, 3); const benefitGap = Math.round(bodySize * 0.55);
  if (benefitValues.length) {
    const available = width - padding * 2; const cardWidth = Math.floor((available - benefitGap * (benefitValues.length - 1)) / benefitValues.length); const benefitFont = Math.round(bodySize * 0.68); const benefitRows = benefitValues.map(value => wrap(value, Math.max(10, Math.floor((cardWidth - bodySize * 2.1) / (benefitFont * 0.52))))); const maxRows = Math.max(...benefitRows.map(rows => rows.length)); const cardHeight = Math.max(Math.round(bodySize * 3.8), Math.round(bodySize * 1.25 + maxRows * benefitFont * 1.15));
    benefitValues.forEach((_, index) => { const x = padding + index * (cardWidth + benefitGap); const by = layout.benefitsY; nodes.push(`<rect x="${x}" y="${by}" width="${cardWidth}" height="${cardHeight}" rx="${Math.round(bodySize * 0.55)}" fill="#09273c" fill-opacity="0.78" stroke="#8ed6ff" stroke-opacity="0.25"/>`); nodes.push(`<circle cx="${x + bodySize}" cy="${by + bodySize}" r="${Math.round(bodySize * 0.38)}" fill="#2e91c9"/><path d="M ${x + bodySize * 0.78} ${by + bodySize} l ${bodySize * 0.15} ${bodySize * 0.16} l ${bodySize * 0.34} ${-bodySize * 0.36}" fill="none" stroke="#fff" stroke-width="${Math.max(2, Math.round(bodySize * 0.08))}" stroke-linecap="round"/>`); benefitRows[index].forEach((row, rowIndex) => text(row, x + bodySize * 1.65, by + bodySize * 0.9 + rowIndex * benefitFont * 1.15, benefitFont, 700, "#fff")); });
  }

  const footerTop = layout.footerY; let footerTextY = footerTop + Math.round(layout.footerHeight * 0.34);
  if (data.applications.length) { text("QO‘LLANISH SOHALARI", padding, footerTextY, Math.round(bodySize * 0.68), 800, "#78c9f3", "start", Math.max(1, Math.round(bodySize * 0.05))); footerTextY += Math.round(bodySize * 1.25); const applicationText = data.applications.join("  •  "); multiline(applicationText, padding, footerTextY, width - padding * 2, Math.round(bodySize * 0.75), 600, "#eef8fd", 1.25); }
  const contactY = height - Math.round(padding * 0.63); const contact = [data.phone, data.website].filter(Boolean).join("   •   "); if (contact) text(contact, padding, contactY, Math.round(bodySize * 0.8), 700, "#dcecf5");
  if (data.cta) { const ctaSize = Math.round(bodySize * 0.78); const ctaWidth = Math.min(Math.round(width * 0.46), Math.max(Math.round(bodySize * 7), data.cta.length * ctaSize * 0.59 + padding)); const ctaHeight = Math.round(bodySize * 2.05); const ctaX = width - padding - ctaWidth; const ctaY = height - padding - ctaHeight; nodes.push(`<rect x="${ctaX}" y="${ctaY}" width="${ctaWidth}" height="${ctaHeight}" rx="${Math.round(ctaHeight * 0.28)}" fill="#1588c4"/><rect x="${ctaX + 2}" y="${ctaY + 2}" width="${ctaWidth - 4}" height="${ctaHeight - 4}" rx="${Math.round(ctaHeight * 0.27)}" fill="none" stroke="#bce9ff" stroke-opacity="0.45"/>`); text(data.cta, ctaX + ctaWidth / 2, ctaY + ctaHeight * 0.64, ctaSize, 800, "#fff", "middle"); }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="topShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#041523" stop-opacity="0.92"/><stop offset="0.72" stop-color="#08263a" stop-opacity="0.5"/><stop offset="1" stop-color="#08263a" stop-opacity="0"/></linearGradient><linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#061a29" stop-opacity="0"/><stop offset="0.36" stop-color="#061a29" stop-opacity="0.78"/><stop offset="1" stop-color="#030e18" stop-opacity="0.96"/></linearGradient><linearGradient id="sideShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#041521" stop-opacity="0.93"/><stop offset="0.7" stop-color="#071d2c" stop-opacity="0.55"/><stop offset="1" stop-color="#071d2c" stop-opacity="0"/></linearGradient></defs>${nodes.join("")}</svg>`;
}

export async function composeCreativeAdvertisement(input: ComposeInput) {
  if (!present(input.data) && !input.logo) return input.visual;
  const composites: OverlayOptions[] = [{ input: Buffer.from(createOverlay(input)) }];
  if (input.logo) { const layout = layoutFor(input.width, input.height, input.data.headline.length); composites.push({ input: await sharp(input.logo).resize({ width: Math.round(layout.headerWidth * 0.28), height: Math.round(Math.min(input.width, input.height) * 0.065), fit: "inside", withoutEnlargement: true }).png().toBuffer(), left: layout.headerX, top: layout.headerY }); }
  return sharp(input.visual).composite(composites).png({ quality: 100 }).toBuffer();
}
