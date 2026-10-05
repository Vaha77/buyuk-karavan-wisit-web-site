// Prays pricing rules. Pure (no database, no "server-only"), so node:test can run them directly.
import { detectAgentProductKind, extractCondenserCode, extractEvaporatorCode, type AgentProductKind } from "../ai-office/product-agent-rules";

export const MARKUP_MIN = 1;
export const MARKUP_MAX = 20;
export const DEFAULT_MARKUP = 10;
/** A price list older than this many days is shown in yellow. */
export const STALE_PRICE_LIST_DAYS = 60;

export function clampMarkup(value: number) {
  return Number.isInteger(value) && value >= MARKUP_MIN && value <= MARKUP_MAX ? value : null;
}

const cents = (value: number) => Math.round(value * 100);

/** Selling price: ceil(base × (100 + markup) / 100), whole dollars. Integer arithmetic, so 880 × 1.10 is exactly 968. */
export function sellPrice(base: number, markupPercent: number) {
  const scaled = cents(base) * (100 + markupPercent);
  return Math.ceil(scaled / 10_000);
}

/**
 * Backfill: the smallest whole x with ceil(x × (100 + markup) / 100) = price.
 * Null when the price is not whole or no whole x maps to it (with +10 % some whole prices are skipped).
 */
export function inferBasePrice(price: number, markupPercent = DEFAULT_MARKUP) {
  if (!Number.isFinite(price) || price < 1 || !Number.isInteger(price)) return null;
  const x = Math.floor(((price - 1) * 100) / (100 + markupPercent)) + 1;
  return sellPrice(x, markupPercent) === price ? x : null;
}

/** ±% change of a base price: whole dollars when the old price is whole, cents otherwise. */
export function applyPercent(base: number, percent: number) {
  const next = base * (100 + percent) / 100;
  return Number.isInteger(base) ? Math.round(next) : Math.round(next * 100) / 100;
}

export type ChangeStatus = "UP" | "DOWN" | "NEW" | "SAME" | "NOT_FOUND";
export const CHANGE_LABEL: Record<ChangeStatus, string> = { UP: "O‘zgaradi", DOWN: "Arzonlashadi", NEW: "Yangi", SAME: "O‘zgarmaydi", NOT_FOUND: "Topilmadi" };
export function changeStatus(oldBase: number | null, newBase: number): ChangeStatus {
  if (oldBase === null) return "NEW";
  if (cents(oldBase) === cents(newBase)) return "SAME";
  return newBase > oldBase ? "UP" : "DOWN";
}
export function changePercent(oldBase: number | null, newBase: number) {
  return oldBase ? Math.round(((newBase - oldBase) / oldBase) * 1000) / 10 : null;
}

export function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const text = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  const [whole, fraction] = text.split(".");
  return `${sign}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${fraction ? `.${fraction}` : ""}`;
}
export function formatSignedUsd(value: number) {
  return value === 0 ? "±$0" : `${value > 0 ? "+" : "−"}${formatUsd(Math.abs(value))}`;
}

/** "15.07.26 Bitzer R22 …" → 2026-07-15. */
export function parseListDate(text: string) {
  const match = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/);
  if (!match) return null;
  const day = Number(match[1]), month = Number(match[2]), year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}
export function formatShortDate(date: Date | null | undefined) {
  if (!date) return "—";
  const d = new Date(date);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCFullYear()).slice(2)}`;
}
export function daysSince(date: Date, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 86_400_000));
}

// ---- Product identity -------------------------------------------------------------------------------
const BRANDS: Array<[RegExp, string]> = [[/\bbitzer\b/i, "BITZER"], [/\bxue\s*y?ing\b/i, "XUEYING"], [/\bbril+iant\b/i, "BRILIANT"]];
export function normalizeBrand(value: string) {
  const found = BRANDS.find(([pattern]) => pattern.test(value));
  return found ? found[1] : value.trim().toUpperCase();
}
export function detectBrand(text: string) {
  return BRANDS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
/** "2 FES+3", "BITZER 2FES+3", "BR −25PZ" → "2FES+3", "BR-25PZ": brand words, spaces and dash variants removed. */
export function modelKey(value: string) {
  return value.toUpperCase().replace(/[−–—]/g, "-").replace(/\b(?:BITZER|XUE\s*Y?ING|BRIL+IANT)\b/g, "").replace(/\s+/g, "");
}
export function detectFreon(text: string) {
  const match = text.toUpperCase().match(/\bR\s?-?(22|404A?|407C?|410A?|134A?|507A?|290|600A?)\b/);
  return match ? `R${match[1].replace(/A$/, "").replace(/C$/, "")}` : null;
}

export type ProductKind = AgentProductKind;
export type ProductFeatures = { brand: string; modelKey: string; kind: ProductKind; liters: string | null; hp: string | null; fn: string | null; evaporator: string | null; freon: string | null };
const kindOf = (text: string) => { const kind = detectAgentProductKind({ categoryName: text }); return kind === "other" ? null : kind; };
export function litersOf(text: string) {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:L|l|Л|л|litr)(?![A-Za-zА-Яа-я])/);
  return match ? match[1].replace(",", ".") : null;
}
export function hpOf(text: string) {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*HP\b/i);
  return match ? match[1].replace(",", ".") : null;
}
/** What a catalog product is, read from its name first (more specific), then its category. */
export function productFeatures(product: { name: string; brand: string; model: string; categoryName?: string | null }): ProductFeatures {
  const kind = kindOf(product.name) ?? (product.categoryName ? kindOf(product.categoryName) : null) ?? "other";
  const name = product.name;
  return {
    brand: normalizeBrand(product.brand),
    modelKey: modelKey(product.model || name),
    kind,
    liters: litersOf(name),
    hp: hpOf(name),
    fn: extractCondenserCode(name) || null,
    evaporator: extractEvaporatorCode(name) || null,
    freon: detectFreon(`${name} ${product.model} ${product.categoryName ?? ""}`),
  };
}
