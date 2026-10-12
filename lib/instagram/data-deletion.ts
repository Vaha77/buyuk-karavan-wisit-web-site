import "server-only";
// Deletes one Instagram user's data at their request (Meta Data Deletion Callback): their comments, Direct messages and
// conversations are removed, leads created from them are anonymised (the sale / statistics row stays), and if it is the
// connected business account itself, its access token is wiped. The request is recorded under a hash of the user id.
import { getDb } from "@/lib/db";
import { ANONYMISED_LEAD, confirmationCode, userHash } from "./deletion-rules";

export async function deleteInstagramUserData(userId: string) {
  const db = getDb(), code = confirmationCode(), hash = userHash(userId);
  await db.instagramDataDeletion.create({ data: { code, userHash: hash } });
  const counts = await db.$transaction(async tx => {
    const comments = await tx.instagramComment.findMany({ where: { fromId: userId }, select: { leadId: true } });
    const conversations = await tx.instagramConversation.findMany({ where: { igsid: userId }, select: { id: true, leadId: true } });
    const conversationIds = conversations.map(row => row.id);
    const leadIds = [...new Set([...comments, ...conversations].map(row => row.leadId).filter((id): id is string => !!id))];
    const messages = await tx.instagramMessage.deleteMany({ where: { OR: [{ fromId: userId }, { toId: userId }, ...(conversationIds.length ? [{ conversationId: { in: conversationIds } }] : [])] } });
    const deletedComments = await tx.instagramComment.deleteMany({ where: { fromId: userId } });
    const deletedConversations = await tx.instagramConversation.deleteMany({ where: { igsid: userId } });
    const leads = leadIds.length ? await tx.lead.updateMany({ where: { id: { in: leadIds }, source: { in: ["INSTAGRAM", "INSTAGRAM_DM"] } }, data: ANONYMISED_LEAD }) : { count: 0 };
    // The connected business account asked: its token is wiped (Sozlamalar → Instagram shows "qayta ulash").
    await tx.instagramAccount.updateMany({ where: { igUserId: userId }, data: { tokenEncrypted: "", tokenExpiresAt: new Date(0), grantedScopes: [], webhookSubscribedAt: null } });
    return { comments: deletedComments.count, messages: messages.count, conversations: deletedConversations.count, leads: leads.count };
  });
  await db.instagramDataDeletion.update({ where: { code }, data: { ...counts, status: "COMPLETED", completedAt: new Date() } });
  return { code, ...counts };
}

export const getDeletionRequest = (code: string) => getDb().instagramDataDeletion.findUnique({ where: { code }, select: { code: true, status: true, requestedAt: true, completedAt: true, comments: true, messages: true, conversations: true, leads: true } });
