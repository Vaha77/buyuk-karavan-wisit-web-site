import "server-only";
import { isVaultEnabled } from "@/lib/auth/password-vault";
import { getDb } from "@/lib/db";
import { appConfig, GraphError, listMedia, type IgMedia } from "./graph";
import { needsInsightsReconnect } from "./insights-rules";
import { errorReason, isReel, tashkentDayStart } from "./rules";
import { accountToken, getInstagramAccount } from "./service";

/** Sozlamalar card: connection state without the token. */
export async function getInstagramStatus() {
  const account = await getInstagramAccount().catch(() => null);
  const config = appConfig();
  return {
    missingEnv: config.missing,
    vault: isVaultEnabled(),
    account: account && { username: account.username, tokenExpiresAt: account.tokenExpiresAt.toISOString(), tokenDaysLeft: Math.floor((account.tokenExpiresAt.getTime() - Date.now()) / 86_400_000), webhookSubscribedAt: account.webhookSubscribedAt?.toISOString() ?? null, webhookError: account.webhookError, lastWebhookAt: account.lastWebhookAt?.toISOString() ?? null, tokenReadable: accountToken(account) !== null, insightsReconnect: needsInsightsReconnect(account.grantedScopes, account.insightsError) },
  };
}
export type InstagramStatus = Awaited<ReturnType<typeof getInstagramStatus>>;

export type BoardMedia = { id: string; caption: string; isReel: boolean; thumbnail: string | null; permalink: string | null; postedAt: string | null; commentsCount: number | null; fromApi: boolean };

/** "Instagram" section: latest media (API) + saved rules, per-media stats and the comment journal. */
export async function getInstagramBoard() {
  const db = getDb();
  const account = await getInstagramAccount();
  let media: IgMedia[] = [], mediaError: string | null = null;
  if (account) {
    const token = accountToken(account);
    if (!token) mediaError = "Tokenni o‘qib bo‘lmadi (PASSWORD_VIEW_KEY o‘zgarganmi?) — Sozlamalarda qayta ulang.";
    else {
      try { media = await listMedia(token, account.igUserId, 24); }
      catch (error) { mediaError = `Postlarni olib bo‘lmadi: ${error instanceof GraphError ? errorReason(error.info) : "tarmoq xatosi"}`; }
    }
  }
  const [rules, stats, leads, journal, products, kinds, cost, repliesToday] = await Promise.all([
    db.instagramMediaRule.findMany({ orderBy: { updatedAt: "desc" } }),
    db.instagramComment.groupBy({ by: ["mediaId", "status"], _count: { _all: true } }),
    db.instagramComment.groupBy({ by: ["mediaId"], where: { leadId: { not: null } }, _count: { _all: true } }),
    db.instagramComment.findMany({ orderBy: { createdAt: "desc" }, take: 150, select: { commentId: true, mediaId: true, username: true, text: true, status: true, reason: true, productName: true, createdAt: true, leadId: true, publicReplyError: true, kind: true, classifiedBy: true, aiCostUsd: true, aiTokens: true, dmText: true, publicReplyText: true, reviewedAt: true, reviewedBy: true } }),
    db.product.findMany({ where: { archivedAt: null }, orderBy: [{ name: "asc" }], select: { id: true, name: true, model: true, priceUsd: true, isVisible: true } }),
    db.instagramComment.groupBy({ by: ["kind"], _count: { _all: true } }),
    db.instagramComment.aggregate({ _sum: { aiCostUsd: true, aiTokens: true } }),
    db.instagramComment.count({ where: { publicReplyAt: { gte: tashkentDayStart() } } }),
  ]);
  const perMedia: Record<string, { comments: number; sent: number; failed: number; leads: number }> = {};
  for (const row of stats) {
    const item = perMedia[row.mediaId] ??= { comments: 0, sent: 0, failed: 0, leads: 0 };
    item.comments += row._count._all;
    if (row.status === "SENT") item.sent += row._count._all;
    if (row.status === "FAILED") item.failed += row._count._all;
  }
  for (const row of leads) if (perMedia[row.mediaId]) perMedia[row.mediaId].leads = row._count._all;

  const list: BoardMedia[] = media.map(item => ({ id: item.id, caption: item.caption ?? "", isReel: isReel(item.permalink), thumbnail: item.thumbnail_url ?? (item.media_type === "VIDEO" ? null : item.media_url ?? null), permalink: item.permalink ?? null, postedAt: item.timestamp ?? null, commentsCount: item.comments_count ?? null, fromApi: true }));
  // Rules for posts outside the latest 24 stay listed (they keep working).
  for (const rule of rules) if (!list.some(item => item.id === rule.mediaId)) list.push({ id: rule.mediaId, caption: rule.caption ?? "", isReel: isReel(rule.permalink), thumbnail: null, permalink: rule.permalink, postedAt: rule.postedAt?.toISOString() ?? null, commentsCount: null, fromApi: false });

  const permalinks = new Map(list.map(item => [item.id, item.permalink]));

  return {
    account: account && { username: account.username, generalReplyEnabled: account.generalReplyEnabled, generalReplyText: account.generalReplyText, phone: account.phone ?? "", priceEnabled: account.priceEnabled, positiveEnabled: account.positiveEnabled, questionEnabled: account.questionEnabled, negativeNotify: account.negativeNotify, dailyReplyLimit: account.dailyReplyLimit, questionReplyText: account.questionReplyText, questionDmTemplate: account.questionDmTemplate },
    kinds: Object.fromEntries(kinds.map(row => [row.kind ?? "PENDING", row._count._all])) as Record<string, number>,
    aiCostUsd: Number(cost._sum.aiCostUsd ?? 0),
    aiTokens: cost._sum.aiTokens ?? 0,
    repliesToday,
    media: list,
    mediaError,
    rules: Object.fromEntries(rules.map(rule => [rule.mediaId, { productId: rule.productId, isActive: rule.isActive, keywords: rule.keywords, dmTemplate: rule.dmTemplate, publicReplyEnabled: rule.publicReplyEnabled, publicReplyText: rule.publicReplyText, publicReplyVariants: rule.publicReplyVariants }])),
    stats: perMedia,
    journal: journal.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null, aiCostUsd: row.aiCostUsd === null ? null : Number(row.aiCostUsd), permalink: permalinks.get(row.mediaId) ?? null })),
    products: products.map(item => ({ id: item.id, name: item.name, model: item.model, hasPrice: item.priceUsd !== null, isVisible: item.isVisible })),
  };
}
export type InstagramBoard = Awaited<ReturnType<typeof getInstagramBoard>>;
