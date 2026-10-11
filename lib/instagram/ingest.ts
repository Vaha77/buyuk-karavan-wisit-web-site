// Webhook notification → journal rows. Pure (the store is passed in), so idempotency is testable without a database.
import { decideComment, parseWebhook, type RuleForDecision } from "./rules";

export type IngestAccount = { igUserId: string; username: string; generalReplyEnabled: boolean };
export type CommentRow = { commentId: string; mediaId: string; fromId: string; username: string | null; text: string; status: "PENDING" | "SKIPPED"; reason: string | null; createdAt: Date; nextAttemptAt: Date };
export type MessageRow = { mid: string; fromId: string; text: string | null; hasAttachments: boolean; sentAt: Date };
export type IngestStore = {
  rules: (mediaIds: string[]) => Promise<Map<string, NonNullable<RuleForDecision>>>;
  /** false when the comment id is already in the journal (unique key) — then nothing else happens for it. */
  insertComment: (row: CommentRow) => Promise<boolean>;
  insertMessages: (rows: MessageRow[]) => Promise<void>;
};

/**
 * Stores every comment on our media once (comment id = unique key) and every incoming Direct message once.
 * Returns the queued comment ids (to process right away) and the comments that should get the general public reply.
 * Events for another account and our own comments / echoes are ignored.
 */
export async function ingestWebhook(payload: unknown, account: IngestAccount, store: IngestStore, now = new Date()) {
  const { comments, messages } = parseWebhook(payload, now);
  const ours = comments.filter(event => event.accountId === account.igUserId);
  const rules = ours.length ? await store.rules([...new Set(ours.map(event => event.mediaId))]) : new Map();
  const queued: string[] = [], generalReplies: string[] = [];
  let duplicates = 0;
  for (const event of ours) {
    const decision = decideComment(event, account, rules.get(event.mediaId) ?? null, now);
    if (decision.action === "ignore") continue;
    const inserted = await store.insertComment({ commentId: event.commentId, mediaId: event.mediaId, fromId: event.fromId, username: event.username, text: event.text, status: decision.action === "queue" ? "PENDING" : "SKIPPED", reason: decision.action === "skip" ? decision.reason : null, createdAt: event.time, nextAttemptAt: now });
    if (!inserted) { duplicates++; continue; }
    if (decision.action === "queue") queued.push(event.commentId);
    else if (decision.action === "skip" && decision.generalReply) generalReplies.push(event.commentId);
  }
  const incoming = messages.filter(event => event.accountId === account.igUserId && !event.isEcho && event.fromId !== account.igUserId);
  if (incoming.length) await store.insertMessages(incoming.map(event => ({ mid: event.mid, fromId: event.fromId, text: event.text, hasAttachments: event.hasAttachments, sentAt: event.time })));
  return { queued, generalReplies, duplicates, messages: incoming.length };
}
