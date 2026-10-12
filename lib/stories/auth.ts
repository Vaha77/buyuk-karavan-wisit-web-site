// Bearer token check for the stories API and cron (Node only).
import { createHash, timingSafeEqual } from "node:crypto";

/** "Authorization: Bearer <STORY_QUEUE_TOKEN>"; compared in constant time (hashed, so lengths never leak). No token set → closed. */
export function bearerMatches(header: string | null | undefined, secret: string | null | undefined) {
  const token = secret?.trim();
  if (!token || !header?.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header.slice(7).trim()), digest(token));
}

