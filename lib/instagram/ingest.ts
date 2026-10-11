// Webhook notification → journal rows. Pure (the store is passed in), so idempotency is testable without a database.
import { decideIngest, parseWebhook } from "./rules";

export type IngestAccount = { igUserId: string; username: string };
export type CommentRow = { commentId: string; mediaId: string; fromId: string; username: string | null; text: string; parentId: string | null; status: "PENDING" | "SKIPPED"; reason: string | null; createdAt: Date; nextAttemptAt: Date };
export type MessageRow = { mid: string; fromId: string; text: string | null; hasAttachments: boolean; sentAt: Date };
export type IngestStore = {
  /** false when the comment id is already in the journal (unique key) — then nothing else happens for it. */
  insertComment: (row: CommentRow) => Promise<boolean>;
  insertMessages: (rows: MessageRow[]) => Promise<void>;
};

/**
 * Stores every comment on our media once (comment id = unique key) and every incoming Direct message once. Returns the
 * queued comment ids; classification and replies happen later in the queue. Events for another account, our own
 * comments and echoes of our own messages are ignored.
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
  const incoming = messages.filter(event => event.accountId === account.igUserId && !event.isEcho && event.fromId !== account.igUserId);
  if (incoming.length) await store.insertMessages(incoming.map(event => ({ mid: event.mid, fromId: event.fromId, text: event.text, hasAttachments: event.hasAttachments, sentAt: event.time })));
  return { queued, duplicates, messages: incoming.length };
}
