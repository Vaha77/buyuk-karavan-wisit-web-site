import { after, NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { markOpened, openSecret, syncCards } from "@/lib/instagram/direct";
import { directLink } from "@/lib/instagram/direct-rules";
import { validOpenSignature } from "@/lib/instagram/direct-sign";

export const runtime = "nodejs";

/**
 * "Instagram’da ochish" in a Telegram card: c = conversation, u = admin, s = HMAC of both. A valid link marks the
 * conversation Ochildi (the first admin becomes responsible), edits the cards and redirects to the Instagram chat.
 * An invalid link only redirects to the Instagram inbox.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const conversationId = params.get("c") ?? "", adminId = params.get("u") ?? "", signature = params.get("s") ?? "";
  if (!/^[a-z0-9]{10,40}$/i.test(conversationId) || !/^[a-z0-9]{10,40}$/i.test(adminId) || !validOpenSignature(openSecret(), conversationId, adminId, signature)) return NextResponse.redirect(directLink(null), 302);
  const conversation = await getDb().instagramConversation.findUnique({ where: { id: conversationId }, select: { username: true } }).catch(() => null);
  if (!conversation) return NextResponse.redirect(directLink(null), 302);
  const opened = await markOpened(conversationId, adminId).catch(() => null);
  if (opened?.changed) after(() => syncCards(conversationId).catch(error => console.error("Instagram Direct sync failed", { type: error instanceof Error ? error.name : "UnknownError" })));
  return NextResponse.redirect(directLink(conversation.username), 302);
}
