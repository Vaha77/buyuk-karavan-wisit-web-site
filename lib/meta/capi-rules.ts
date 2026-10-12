// Meta Conversions API: pure payload rules (no server-only imports), covered by tests/meta-pixel.test.mjs.
// The phone is sent only as a SHA-256 hash of its digits with the country code (Meta's "ph" normalization).
import { createHash } from "node:crypto";

export { isEventId, pixelAllowed } from "./pixel-rules";

export const META_GRAPH_VERSION = "v21.0";

/** "+998 90 123-45-67" → sha256("998901234567"); a 9-digit local number gets 998 in front; nothing usable → null. */
export function hashPhone(phone: string | null | undefined) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 9) digits = `998${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return createHash("sha256").update(digits).digest("hex");
}

export type LeadEventInput = { eventId: string; phone: string | null; eventSourceUrl: string; userAgent: string | null; ip: string | null; fbp?: string | null; fbc?: string | null; contentName?: string | null; now?: Date };

/** One "Lead" server event for POST /{pixel-id}/events. */
export function buildLeadEvent(input: LeadEventInput) {
  const ph = hashPhone(input.phone);
  const userData: Record<string, unknown> = { ...(ph ? { ph: [ph] } : {}), ...(input.userAgent ? { client_user_agent: input.userAgent.slice(0, 400) } : {}), ...(input.ip ? { client_ip_address: input.ip } : {}), ...(input.fbp ? { fbp: input.fbp } : {}), ...(input.fbc ? { fbc: input.fbc } : {}) };
  return {
    event_name: "Lead",
    event_time: Math.floor((input.now ?? new Date()).getTime() / 1000),
    event_id: input.eventId,
    action_source: "website",
    event_source_url: input.eventSourceUrl,
    user_data: userData,
    ...(input.contentName ? { custom_data: { content_name: input.contentName.slice(0, 200) } } : {}),
  };
}

/** Pixel id and access token from env; both are needed or nothing is sent. */
export function metaConfig(env: Record<string, string | undefined> = process.env) {
  const pixelId = env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || null, token = env.META_CAPI_ACCESS_TOKEN?.trim() || null;
  return { pixelId: pixelId && /^\d{5,20}$/.test(pixelId) ? pixelId : null, token };
}
