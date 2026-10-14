// GET /api/cron/instagram-queue with its dependencies passed in (tests/instagram.test.mjs runs it without Next / DB).
// Only the reply queue: GitHub Actions calls it every 10 minutes so replies do not wait for the hourly cron.
import { timingSafeEqual } from "node:crypto";

export type QueueCronResponse = { status: number; body: Record<string, unknown> };

/** "Authorization: Bearer <CRON_SECRET>", compared in constant time; no secret configured → always refused. */
export function cronAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(secret), received = Buffer.from(header.slice(7));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function handleQueueCron(header: string | null, secret: string | undefined, run: () => Promise<Record<string, unknown>>): Promise<QueueCronResponse> {
  if (!cronAuthorized(header, secret)) return { status: 401, body: { ok: false } };
  try {
    return { status: 200, body: { ok: true, queue: await run() } };
  } catch (error) {
    console.error("Instagram queue cron failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return { status: 500, body: { ok: false } };
  }
}
