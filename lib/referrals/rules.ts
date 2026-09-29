// Pure rules for referral links and visit tracking (no server-only imports: unit-tested).

export const REFERRAL_SOURCES = ["YOUTUBE", "INSTAGRAM", "TELEGRAM", "TIKTOK", "GOOGLE_ADS", "BLOGGER", "QR", "OTHER"] as const;
export type ReferralSourceKey = (typeof REFERRAL_SOURCES)[number];
export const SOURCE_LABELS: Record<ReferralSourceKey, string> = { YOUTUBE: "YouTube", INSTAGRAM: "Instagram", TELEGRAM: "Telegram", TIKTOK: "TikTok", GOOGLE_ADS: "Google Ads", BLOGGER: "Bloger", QR: "QR-kod", OTHER: "Boshqa" };

export const TARGETS = [
  { key: "form", label: "Bepul hisob-kitob formasi", path: "/#aloqa" },
  { key: "home", label: "Bosh sahifa", path: "/" },
  { key: "products", label: "Mahsulotlar katalogi", path: "/products" },
] as const;

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export function isValidSlug(slug: string) { return SLUG_PATTERN.test(slug) && !slug.includes("--"); }

/** "YouTube — MrBeast videosi" → "youtube-mrbeast-videosi" (3–40 chars, [a-z0-9-]). */
export function suggestSlug(name: string) {
  const base = name.toLocaleLowerCase("uz-UZ").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’'`ʼ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return base.length >= 3 ? base : "";
}

/** Only same-site paths are allowed as targets (no open redirect). */
export function safeTargetPath(value: string) {
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path) || path.length > 300) return null;
  if (/^\/(?:admin|api|r)(?:\/|$|\?|#)/.test(path)) return null;
  return path;
}

/** Target path plus UTM tags, keeping an existing #hash at the end. */
export function withUtm(targetPath: string, slug: string) {
  const [pathAndQuery, hash = ""] = targetPath.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(query);
  params.set("utm_source", slug); params.set("utm_medium", "referral"); params.set("utm_campaign", slug);
  return `${path}?${params}${hash ? `#${hash}` : ""}`;
}

// Crawlers and link-preview fetchers (Telegram, WhatsApp, Facebook, …) are redirected but never counted.
const BOT_PATTERN = /bot\b|bot\/|crawler|spider|crawl|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|telegrambot|whatsapp|twitterbot|linkedinbot|discordbot|skypeuripreview|vkshare|embedly|quora link preview|pinterest|redditbot|applebot|bingpreview|yandex|google-inspectiontool|googleother|headlesschrome|lighthouse|curl\/|wget\/|python-requests|axios\/|node-fetch|go-http-client|okhttp|preview/i;
export function isBot(userAgent: string | null | undefined) { return !userAgent || userAgent.length < 10 || BOT_PATTERN.test(userAgent); }

export type DeviceKey = "MOBILE" | "DESKTOP" | "TABLET";
export function deviceFromUserAgent(userAgent: string | null | undefined): DeviceKey {
  const ua = userAgent || "";
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "TABLET";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return "MOBILE";
  return "DESKTOP";
}

// ---- Outcome: the furthest stage reached, never downgraded ------------------------------------
export const OUTCOME_ORDER = ["LEFT", "INTERESTED", "CONTACT_ATTEMPT", "LEAD", "SALE"] as const;
export type OutcomeKey = (typeof OUTCOME_ORDER)[number];
export function upgradeOutcome(current: OutcomeKey, next: OutcomeKey): OutcomeKey { return OUTCOME_ORDER.indexOf(next) > OUTCOME_ORDER.indexOf(current) ? next : current; }
export const OUTCOME_LABELS: Record<OutcomeKey, string> = { LEFT: "Ko‘rib ketdi", INTERESTED: "Qiziqdi", CONTACT_ATTEMPT: "Bog‘lanishga urindi", LEAD: "Zayavka", SALE: "Sotuv" };

export const EVENT_TYPES = ["PAGEVIEW", "PRODUCT_VIEW", "TEL_CLICK", "TELEGRAM_CLICK", "MADINA_OPEN", "FORM_SUBMIT", "HEARTBEAT"] as const;
export type EventKey = (typeof EVENT_TYPES)[number];
export const HEARTBEAT_SECONDS = 15;
export const INTERESTED_AFTER_SECONDS = 30;

/** Outcome implied by one tracker event (form submits become LEAD only when a lead is actually saved). */
export function outcomeForEvent(type: EventKey, durationSec: number): OutcomeKey {
  if (type === "TEL_CLICK" || type === "TELEGRAM_CLICK" || type === "MADINA_OPEN") return "CONTACT_ATTEMPT";
  if (type === "PRODUCT_VIEW" || durationSec >= INTERESTED_AFTER_SECONDS) return "INTERESTED";
  return "LEFT";
}

// ---- Link statistics -------------------------------------------------------------------------
export type OutcomeCounts = Record<OutcomeKey, number>;
/** Stacked bar segments: every visitor counted once by their latest stage; sales are part of "zayavka". */
export function linkSegments(counts: OutcomeCounts) {
  return { left: counts.LEFT, interested: counts.INTERESTED, contact: counts.CONTACT_ATTEMPT, lead: counts.LEAD + counts.SALE };
}
export function conversion(leads: number, clicks: number) { return clicks > 0 ? (leads / clicks) * 100 : 0; }
export function costPerLead(costUsd: number | null, leads: number) { return costUsd && leads > 0 ? costUsd / leads : null; }
