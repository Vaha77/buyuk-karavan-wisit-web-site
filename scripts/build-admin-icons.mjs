// Admin app icons (PWA, Capacitor), the sidebar emblem and the offer-PDF logo from public/brand/:
//   node scripts/build-admin-icons.mjs
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const path = relative => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const ICON = path("public/brand/bk-icon-1024.png"), MASKABLE = path("public/brand/bk-icon-maskable-1024.png"), LOGO = path("public/brand/bk-logo.png");
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
mkdirSync(path("public/admin-icons"), { recursive: true });
mkdirSync(path("mobile/assets"), { recursive: true });

const resize = (source, size, out) => sharp(source).resize(size, size, { fit: "contain", background: WHITE }).flatten({ background: WHITE }).png().toFile(path(out));
await resize(ICON, 192, "public/admin-icons/icon-192.png");
await resize(ICON, 512, "public/admin-icons/icon-512.png");
await resize(MASKABLE, 512, "public/admin-icons/maskable-512.png");
await resize(ICON, 180, "public/admin-icons/apple-touch-icon.png");
await resize(ICON, 32, "public/admin-icons/favicon-32.png");
// Sidebar / login emblem shown at 32px (2× for sharp screens).
await resize(ICON, 64, "public/admin-icons/emblem-64.png");
// Offer PDF: ~40px high on the page, 3× for print.
await sharp(LOGO).resize({ height: 120 }).png().toFile(path("public/admin-icons/pdf-logo.png"));

// Capacitor (@capacitor/assets): icon and a white splash with the emblem in the middle.
await resize(ICON, 1024, "mobile/assets/icon-only.png");
await resize(MASKABLE, 1024, "mobile/assets/icon-foreground.png");
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } }).png().toFile(path("mobile/assets/icon-background.png"));
const emblem = await sharp(ICON).resize(900, 900).png().toBuffer();
for (const name of ["splash.png", "splash-dark.png"]) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: WHITE } }).composite([{ input: emblem, gravity: "center" }]).png().toFile(path(`mobile/assets/${name}`));
}
console.log("admin icons, emblem, pdf logo and Capacitor assets written");
