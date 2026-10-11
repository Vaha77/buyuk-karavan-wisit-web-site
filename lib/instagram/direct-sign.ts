// Signed "Instagram’da ochish" links in Telegram cards (who opened is recorded; links cannot be forged).
import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC for the "Instagram’da ochish" link of one admin (who opened is recorded; the link cannot be forged). */
export const openSignature = (secret: string, conversationId: string, adminId: string) => createHmac("sha256", `ig-direct-open:${secret}`).update(`${conversationId}.${adminId}`).digest("base64url").slice(0, 32);
export function validOpenSignature(secret: string | null | undefined, conversationId: string, adminId: string, signature: string) {
  if (!secret || !signature) return false;
  const expected = Buffer.from(openSignature(secret, conversationId, adminId)), received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
