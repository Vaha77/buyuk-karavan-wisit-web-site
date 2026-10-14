// Instagram webhook POST, with its dependencies passed in (tests/instagram-webhook.test.mjs runs it without Next / DB).
// Meta gets its answer as soon as the rows are written; classification, replies with their 8–25 s pauses, Telegram
// cards etc. are handed to `schedule` (next/server `after`) and never awaited here.
import { validSignature } from "./rules";

export type WebhookDeps<T> = {
  appSecret: string | null;
  /** Fast, DB only: writes comment / Direct rows. null = no connected account. */
  ingest: (payload: unknown) => Promise<T | null>;
  /** Slow work, run after the response (Next.js `after`). */
  background: (result: T) => Promise<unknown>;
  schedule: (task: () => Promise<unknown>) => void;
  log?: (message: string, details: Record<string, unknown>) => void;
};
export type WebhookResponse = { status: number; body: { ok: boolean } };

export async function handleWebhookPost<T>(raw: Buffer, signature: string | null, deps: WebhookDeps<T>): Promise<WebhookResponse> {
  if (raw.length > 1_000_000) return { status: 413, body: { ok: false } };
  if (!validSignature(raw, signature, deps.appSecret)) return { status: 401, body: { ok: false } };
  let payload: unknown;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return { status: 400, body: { ok: false } }; }
  try {
    const result = await deps.ingest(payload);
    if (result !== null) deps.schedule(() => deps.background(result));
    return { status: 200, body: { ok: true } };
  } catch (error) {
    // A database error: 500, so Meta delivers the notification again.
    deps.log?.("Instagram webhook failed", { type: error instanceof Error ? error.name : "UnknownError" });
    return { status: 500, body: { ok: false } };
  }
}
