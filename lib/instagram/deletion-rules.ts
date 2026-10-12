// Meta "Data Deletion Request Callback": pure rules (no DB / network), covered by tests/instagram-deletion.test.mjs.
// signed_request = base64url(HMAC-SHA256(payload, app secret)) + "." + base64url(JSON payload); payload.user_id is the
// app-scoped id of the person who asked for deletion.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type SignedRequestPayload = { algorithm?: string; user_id?: string | number; issued_at?: number; expires?: number };

const fromBase64Url = (value: string) => Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** The payload when the signature matches `appSecret` and the algorithm is HMAC-SHA256; otherwise null. */
export function parseSignedRequest(signedRequest: string | null | undefined, appSecret: string | null | undefined): (SignedRequestPayload & { userId: string }) | null {
  if (!signedRequest || !appSecret || signedRequest.length > 8_192) return null;
  const [encodedSig, payload, extra] = signedRequest.split(".");
  if (!encodedSig || !payload || extra !== undefined) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest(), received = fromBase64Url(encodedSig);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  let data: SignedRequestPayload;
  try { data = JSON.parse(fromBase64Url(payload).toString("utf8")); } catch { return null; }
  if (!data || typeof data !== "object" || String(data.algorithm ?? "").toUpperCase() !== "HMAC-SHA256") return null;
  const userId = data.user_id === undefined || data.user_id === null ? "" : String(data.user_id).trim();
  return /^[\w.-]{1,64}$/.test(userId) ? { ...data, userId } : null;
}

/** 12 characters, A–Z and 2–9 (no 0/O, 1/I): easy to read out over the phone. */
export function confirmationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", bytes = randomBytes(12);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}
export const isConfirmationCode = (value: string | null | undefined): value is string => !!value && /^[A-Z2-9]{12}$/.test(value);

/** The Instagram user id is never stored as is. */
export const userHash = (userId: string) => createHash("sha256").update(`ig-deletion:${userId}`).digest("hex");

/** The status page Meta shows to the person. */
export const deletionStatusUrl = (siteUrl: string, code: string) => `${siteUrl}/data-deletion?code=${encodeURIComponent(code)}`;

/** What an anonymised lead keeps: the business record (dates, product, status, sale) without the person. */
export const ANONYMISED_LEAD = { customerName: "O‘chirilgan (Instagram)", phone: null, telegram: null, notes: null, aiSummary: null, chatHistory: [] as never[] };
