// Meta Pixel rules shared by the browser and the server (no Node imports).

/** Pixel only on public pages: never under /admin (nor /api). */
export const pixelAllowed = (pathname: string | null | undefined) => !!pathname && !/^\/(?:admin|api)(?:\/|$)/.test(pathname);
/** GA4 contact_click: which channel a link opens, or null for any other link. */
export function contactMethod(href: string | null | undefined) {
  if (!href) return null;
  if (/^tel:/i.test(href)) return "phone";
  if (/^https?:\/\/(?:t\.me|telegram\.me)\//i.test(href)) return "telegram";
  if (/^https?:\/\/(?:wa\.me|(?:api\.|web\.)?whatsapp\.com)\//i.test(href)) return "whatsapp";
  if (/^https?:\/\/(?:www\.)?(?:instagram\.com|ig\.me)\//i.test(href)) return "instagram";
  return null;
}
/** Browser Pixel and server event share this id so Meta counts the Lead once. */
export const isEventId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
