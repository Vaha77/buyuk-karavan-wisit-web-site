// Tungi rejim: turns hard-coded colors into CSS variables with the original color as fallback (light mode is
// unchanged) and writes their dark values into app/globals.css. Re-run after adding colors: node scripts/theme-dark.mjs
// Dark values follow the palette: bg #141A24, card #1C2431, border #2A3443, text #E6EBF2, muted #9AA7B8; colored text is
// lifted until it has ≥ 4.5:1 on the card; saturated button/brand backgrounds and their white text stay as they are.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GLOBALS = join(ROOT, "app/globals.css"), START = "/* theme:dark:start (scripts/theme-dark.mjs) */", END = "/* theme:dark:end */";
export const PALETTE = { bg: "#141A24", card: "#1C2431", border: "#2A3443", text: "#E6EBF2", muted: "#9AA7B8" };

// ---- color math ----------------------------------------------------------------------------------
const hex6 = hex => (hex.length === 4 ? `#${[...hex.slice(1)].map(c => c + c).join("")}` : hex).toLowerCase();
const rgb = hex => [1, 3, 5].map(i => parseInt(hex6(hex).slice(i, i + 2), 16) / 255);
const toHex = values => `#${values.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
function hsl(hex) {
  const [r, g, b] = rgb(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l, 0];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l, d];
}
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([r + m, g + m, b + m]);
}
const luminance = hex => rgb(hex).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Dark value of `hex` used as `role` (fg = text/icon, bg = surface/shape, bd = border/line); null = keep the color. */
export function darkOf(hex, role) {
  if (role === "on") return PALETTE.bg; // white text on an accent that turns light in the dark theme
  const [h, s, l, chroma] = hsl(hex), tinted = chroma >= 0.05, saturated = chroma >= 0.12 && s >= 0.35;
  if (role === "fg") {
    if (l >= 0.7) return null; // already light text (on dark or colored surfaces)
    if (l < 0.25) return PALETTE.text; // ink: navy / near-black body text
    if (!saturated) return l < 0.34 ? PALETTE.text : PALETTE.muted;
    let lift = 0.62, out = fromHsl(h, Math.min(s, 0.85), lift);
    while (contrast(out, PALETTE.card) < 4.6 && lift < 0.9) out = fromHsl(h, Math.min(s, 0.85), (lift += 0.02));
    return out;
  }
  if (role === "bd") {
    if (l >= 0.75) return tinted ? fromHsl(h, Math.min(s, 0.3), 0.24) : PALETTE.border;
    return null;
  }
  // bg
  if (!tinted) return l >= 0.985 ? PALETTE.card : l >= 0.9 ? PALETTE.bg : l >= 0.75 ? PALETTE.border : l >= 0.35 ? "#3A4555" : null;
  if (l >= 0.85) return fromHsl(h, Math.min(s, 0.4), 0.17);
  if (l >= 0.45) return fromHsl(h, Math.min(s, 0.7) * 0.85, 0.3);
  return null;
}

// ---- rewriting -----------------------------------------------------------------------------------
const used = new Map(); // "fg-102c47" → dark value
const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F\w-])/g;
function variable(hex, role) {
  const dark = darkOf(hex, role);
  if (!dark) return hex;
  const key = `${role}-${hex6(hex).slice(1)}`;
  used.set(key, dark);
  return `var(--k-${key}, ${hex})`;
}
const roleOfProperty = prop => /^(background|--)/.test(prop) ? "bg" : /^(border|outline|column-rule)/.test(prop) ? "bd" : /^(color|fill|stroke|caret-color|text-decoration)/.test(prop) ? "fg" : null;
// Custom properties are shared by text and surfaces; their names tell the role.
const roleOfCustom = name => /border|line|input|chip/.test(name) ? "bd" : /text|ink|muted|sub|title|primary|blue|navy|accent|red|green|yellow|orange|gold|silver|bronze|b\d/.test(name) ? "fg" : "bg";
const replaceIn = (value, role) => role ? value.replace(/var\(--k-[^)]*\)|#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F\w-])/g, match => match.startsWith("var(") ? match : variable(match, role)) : value;

function css(source) {
  // White text on a background from an accent variable (light in the dark theme) turns dark there.
  source = source.replace(/\{[^{}]*\}/g, body => /background(?:-color)?:\s*var\(--[\w-]*(?:primary|blue|navy|accent)/.test(body)
    ? body.replace(/([;{])color:\s*#(?:fff|ffffff)/gi, (all, lead) => { used.set("on-ffffff", PALETTE.bg); return `${lead}color:var(--k-on-ffffff, #fff)`; }) : body);
  return source.replace(/([{;\s])(-{0,2}[a-z][\w-]*)\s*:\s*([^;{}]+)/g, (all, lead, prop, value) => {
    if (prop === "box-shadow" || prop === "text-shadow" || !HEX.test(value)) return all;
    HEX.lastIndex = 0;
    return `${lead}${prop}:${replaceIn(value, prop.startsWith("--") ? roleOfCustom(prop) : roleOfProperty(prop))}`;
  });
}
function tsx(source) {
  // style={{ … }} objects, then SVG/JSX color attributes.
  let out = source.replace(/style=\{\{([^{}]*)\}\}/g, (all, body) => `style={{${body.replace(/(\b[a-zA-Z]+)\s*:\s*"([^"]*)"/g, (pair, key, value) => {
    const prop = key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), role = prop === "fill" ? "fg" : roleOfProperty(prop);
    return role && /#[0-9a-fA-F]{3,6}/.test(value) ? `${key}: "${replaceIn(value, role)}"` : pair;
  })}}}`);
  out = out.replace(/\b(fill|stroke|color)="(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})"/g, (all, attr, hex) => `${attr}="${variable(hex, attr === "fill" ? "bg" : attr === "stroke" ? "bd" : "fg")}"`);
  return out;
}

const walk = dir => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? (name === "node_modules" ? [] : walk(path)) : [path]; });
export function run() {
  const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))];
  for (const file of files) {
    if (!/\.(css|tsx)$/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    // PDFs have no CSS variables; illustrations (AI office scene, hero glow, preloader) keep their colors like images do.
    if (source.includes("@react-pdf/renderer") || /ai-office[\\/].*\.tsx$|home[\\/](hero|preloader)/.test(file)) continue;
    const body = file === GLOBALS && source.includes(START) ? source.slice(0, source.indexOf(START)) + source.slice(source.indexOf(END) + END.length) : source;
    const next = file.endsWith(".css") ? css(body) : tsx(body);
    if (next !== body) writeFileSync(file, next);
  }
  // Variables already in place from an earlier run keep their dark value.
  for (const file of files) for (const match of readFileSync(file, "utf8").matchAll(/var\(--k-(fg|bg|bd|on)-([0-9a-f]{6}), #[0-9a-fA-F]{3,6}\)/g)) {
    const dark = darkOf(`#${match[2]}`, match[1]);
    if (dark) used.set(`${match[1]}-${match[2]}`, dark);
  }
  const block = `${START}\n[data-theme=dark]{color-scheme:dark;${[...used].sort().map(([key, value]) => `--k-${key}:${value}`).join(";")}}\n${END}`;
  const globals = readFileSync(GLOBALS, "utf8");
  writeFileSync(GLOBALS, globals.includes(START) ? globals.slice(0, globals.indexOf(START)) + block + globals.slice(globals.indexOf(END) + END.length) : `${globals.trimEnd()}\n${block}\n`);
  return used.size;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(`dark variables: ${run()}`);
