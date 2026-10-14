// Webhook notification → journal rows. Pure (the store is passed in), so idempotency is testable without a database.
import { decideIngest, parseWebhook, type MessageEvent } from "./rules";

export type IngestAccount = { igUserId: string; username: string };
export type CommentRow = { commentId: string; mediaId: string; fromId: string; username: string | null; text: string; parentId: string | null; status: "PENDING" | "SKIPPED"; reason: string | null; createdAt: Date; nextAttemptAt: Date };
export type IngestStore = {
  /** false when the comment id is already in the journal (unique key) — then nothing else happens for it. */
  insertComment: (row: CommentRow) => Promise<boolean>;
};

/**
 * Stores every comment on our media once (comment id = unique key). Returns the queued comment ids (classified and
 * answered later in the queue) and this account's Direct events (customer messages and echoes of ours, in time order)
 * for lib/instagram/direct.ts. Events for another account and our own comments are ignored.
 */
export async function ingestWebhook(payload: unknown, account: IngestAccount, store: IngestStore, now = new Date()) {
  const { comments, messages } = parseWebhook(payload, now);
  const queued: string[] = [];
  let duplicates = 0;
  for (const event of comments.filter(item => item.accountId === account.igUserId)) {
    const decision = decideIngest(event, account, now);
    if (decision.action === "ignore") continue;
    const inserted = await store.insertComment({ commentId: event.commentId, mediaId: event.mediaId, fromId: event.fromId, username: event.username, text: event.text, parentId: event.parentId, status: decision.action === "queue" ? "PENDING" : "SKIPPED", reason: decision.action === "skip" ? decision.reason : null, createdAt: event.time, nextAttemptAt: now });
    if (!inserted) { duplicates++; continue; }
    if (decision.action === "queue") queued.push(event.commentId);
  }
  const direct: MessageEvent[] = messages.filter(event => event.accountId === account.igUserId).sort((a, b) => a.time.getTime() - b.time.getTime());
  return { queued, duplicates, direct };
}

// ---- Catch-up (comments the webhook may have missed) -----------------------------------------------------

/** One comment of GET /{media-id}/comments (fields: id,text,timestamp,from,username,parent_id). */
export type ApiComment = { id?: string; text?: string; timestamp?: string; from?: { id?: string; username?: string }; username?: string; parent_id?: string };
export type MediaComments = { mediaId: string; comments: ApiComment[] };

/** Graph timestamps look like "2026-10-11T10:00:00+0000"; the offset gets a colon so every runtime parses it. */
export function graphTime(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Comments fetched from the Graph API go through the same rules as webhook events (decideIngest + the unique comment id):
 * a comment already in the journal does nothing, our own are ignored, replies are logged as skipped. Comments older than
 * `days` are dropped without a row. `found` = comments from others within the window.
 */
export async function ingestFetchedComments(media: MediaComments[], account: IngestAccount, store: IngestStore, options: { days?: number; now?: Date } = {}) {
  const now = options.now ?? new Date(), windowMs = (options.days ?? 7) * 86_400_000;
  const queued: string[] = [];
  let found = 0, skipped = 0, duplicates = 0;
  for (const { mediaId, comments } of media) {
    for (const comment of comments) {
      const time = graphTime(comment.timestamp), fromId = comment.from?.id ? String(comment.from.id) : null;
      if (!comment.id || !fromId || !time || now.getTime() - time.getTime() > windowMs) continue;
      const event = { commentId: String(comment.id), mediaId, fromId, username: comment.from?.username ?? comment.username ?? null, text: typeof comment.text === "string" ? comment.text.slice(0, 2000) : "", parentId: comment.parent_id ? String(comment.parent_id) : null, time };
      const decision = decideIngest(event, account, now);
      if (decision.action === "ignore") continue;
      found++;
      const inserted = await store.insertComment({ ...event, status: decision.action === "queue" ? "PENDING" : "SKIPPED", reason: decision.action === "skip" ? decision.reason : null, createdAt: time, nextAttemptAt: now });
      if (!inserted) { duplicates++; continue; }
      if (decision.action === "queue") queued.push(event.commentId); else skipped++;
    }
  }
  return { found, queued, skipped, duplicates };
}
