// Admin app icons (PWA, later Capacitor) from the "✳ BK" mark: node scripts/build-admin-icons.mjs
// Replace the SVG below with the real logo when it arrives and run it again.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = new URL("../public/admin-icons/", import.meta.url);
// `inset`: share of the side the mark uses (maskable icons keep it inside the safe circle).
const svg = (size, inset, round) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${round ? 22 : 0}" fill="#102c47"/>
  <g transform="translate(50 50) scale(${inset}) translate(-50 -50)" fill="none" stroke="#fff" stroke-linecap="round">
    <path d="M50 15v26M37 28h26M40.8 18.8l18.4 18.4M59.2 18.8 40.8 37.2" stroke-width="5.5" stroke="#7cc4ff"/>
    <text x="50" y="82" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="34" fill="#fff" stroke="none">BK</text>
  </g></svg>`;

mkdirSync(OUT, { recursive: true });
for (const [name, size, inset, round] of [["icon-192.png", 192, 1, true], ["icon-512.png", 512, 1, true], ["maskable-512.png", 512, 0.72, false], ["apple-touch-icon.png", 180, 1, false]]) {
  await sharp(Buffer.from(svg(size, inset, round))).png().toFile(fileURLToPath(new URL(name, OUT)));
  console.log(name);
}
