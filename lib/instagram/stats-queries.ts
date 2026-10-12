import "server-only";
import { getDb } from "@/lib/db";
import { activityHeatmap, changePercent, contentTypes, dayStartUtc, engagementRate, followerGrowthCheck, funnel, growthPercent, instagramComments, needsInsightsReconnect, periodRange, sumKey, tashkentDay, type Period } from "./insights-rules";

type Audience = Record<string, Record<string, number>>;
const asAudience = (value: unknown): Audience => value && typeof value === "object" ? value as Audience : {};

/** Everything the "Statistika" tab shows for a period, plus the previous period for the % changes. */
export async function getStatsBoard(period: Period) {
  const db = getDb(), now = new Date();
  const range = periodRange(period, now);
  const from = dayStartUtc(range.from), prevFrom = dayStartUtc(range.prevFrom), to = now;
  const leadSources = { source: { in: ["INSTAGRAM", "INSTAGRAM_DM"] as Array<"INSTAGRAM" | "INSTAGRAM_DM"> } };

  const [account, days, prevDays, latestFollowers, media, audience, comments, kinds, firstComment, dmIn, prevDmIn, dmAnswers, waiting, conversations, leads, activity] = await Promise.all([
    db.instagramAccount.findUnique({ where: { id: "global" }, select: { username: true, grantedScopes: true, insightsFetchedAt: true, insightsError: true } }),
    db.instagramDailyStat.findMany({ where: { date: { gte: range.from, lte: range.to } }, orderBy: { date: "asc" } }),
    db.instagramDailyStat.findMany({ where: { date: { gte: range.prevFrom, lte: range.prevTo } } }),
    db.instagramDailyStat.findFirst({ where: { followersCount: { not: null } }, orderBy: { date: "desc" }, select: { followersCount: true, date: true } }),
    db.instagramMediaStat.findMany({ where: { postedAt: { gte: from } }, orderBy: { postedAt: "desc" } }),
    db.instagramAudienceSnapshot.findFirst({ orderBy: { date: "desc" } }),
    db.instagramComment.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { createdAt: true, kind: true, mediaId: true, dmSentAt: true, leadId: true } }),
    // Comment kinds: our webhook journal, all of it (since the auto-reply system started), not the period.
    db.instagramComment.groupBy({ by: ["kind"], _count: { _all: true } }),
    db.instagramComment.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.instagramMessage.findMany({ where: { direction: "IN", sentAt: { gte: from, lte: to } }, select: { sentAt: true, conversationId: true } }),
    db.instagramMessage.count({ where: { direction: "IN", sentAt: { gte: prevFrom, lt: from } } }),
    db.instagramMessage.findMany({ where: { direction: "OUT", isAuto: false, responseMs: { not: null }, sentAt: { gte: from, lte: to } }, select: { responseMs: true } }),
    db.instagramConversation.count({ where: { status: { in: ["UNREAD", "OPENED"] } } }),
    db.instagramConversation.count({ where: { lastIncomingAt: { gte: from } } }),
    db.lead.findMany({ where: { ...leadSources, createdAt: { gte: from, lte: to } }, select: { id: true, sale: { select: { status: true, saleAmount: true, currency: true } } } }),
    // Best time: our comments and Direct messages of the last 90 days.
    Promise.all([
      db.instagramComment.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 90 * 86_400_000) } }, select: { createdAt: true } }),
      db.instagramMessage.findMany({ where: { direction: "IN", sentAt: { gte: new Date(now.getTime() - 90 * 86_400_000) } }, select: { sentAt: true } }),
    ]),
  ]);

  // ---- KPIs (sums of daily totals; Meta's reach is per day, so the period reach is the sum of daily reach).
  const total = (rows: typeof days, key: keyof (typeof days)[number]) => sumKey(rows, key);
  const follows = total(days, "follows"), unfollows = total(days, "unfollows");
  const firstFollowers = days.find(row => row.followersCount !== null)?.followersCount ?? null;
  const net = follows !== null || unfollows !== null ? (follows ?? 0) - (unfollows ?? 0) : latestFollowers?.followersCount !== null && latestFollowers && firstFollowers !== null ? latestFollowers.followersCount! - firstFollowers : null;
  const prevNet = sumKey(prevDays, "follows") !== null ? (sumKey(prevDays, "follows") ?? 0) - (sumKey(prevDays, "unfollows") ?? 0) : null;
  const er = engagementRate(total(days, "totalInteractions"), total(days, "reach")), prevEr = engagementRate(sumKey(prevDays, "totalInteractions"), sumKey(prevDays, "reach"));
  const profileVisits = sumKey(media, "profileVisits");
  // Comments: Instagram's own numbers (account daily insight, else the period's posts), never the webhook journal.
  const commentTotal = instagramComments(days, media), prevCommentTotal = instagramComments(prevDays, []);
  // Net growth from the followers_count history (from the day before the period) against follows − unfollows.
  const growth = followerGrowthCheck([...prevDays.filter(row => row.date === range.prevTo), ...days]);
  const kpi = (key: string, label: string, value: number | null, previous: number | null, extra?: string) => ({ key, label, value, previous, change: changePercent(value, previous), extra });
  const kpis = [
    kpi("followers", "Obunachilar", latestFollowers?.followersCount ?? null, null, net === null ? undefined : `${net >= 0 ? "+" : ""}${net} sof o‘sish`),
    kpi("reach", "Qamrov", total(days, "reach"), sumKey(prevDays, "reach")),
    kpi("views", "Ko‘rishlar", total(days, "views"), sumKey(prevDays, "views")),
    kpi("profile", "Profilga kirish", profileVisits, null, "shu davrdagi postlardan"),
    kpi("comments", "Kommentlar", commentTotal.value, prevCommentTotal.value, commentTotal.source === "media" ? "shu davrdagi postlardan" : undefined),
    kpi("direct", "Direct xabarlar", dmIn.length, prevDmIn),
    kpi("likes", "Like", total(days, "likes"), sumKey(prevDays, "likes")),
    kpi("er", "ER%", er, prevEr),
  ];
  kpis[0].change = changePercent(net, prevNet);

  // ---- Funnel: views → comments → price questions → Direct conversations → leads → sales.
  const kindCount = Object.fromEntries(kinds.map(row => [row.kind ?? "PENDING", row._count._all])) as Record<string, number>;
  const sales = leads.filter(lead => lead.sale && lead.sale.status !== "REJECTED");
  const salesSum = sales.reduce((sum, lead) => sum + Number(lead.sale!.saleAmount ?? 0), 0);
  const steps = funnel([
    { key: "views", label: "Ko‘rishlar", value: total(days, "views") },
    { key: "comments", label: "Kommentlar", value: commentTotal.value },
    { key: "price", label: "Narx so‘raganlar", value: kindCount.PRICE ?? 0 },
    { key: "direct", label: "Direct suhbatlar", value: conversations },
    { key: "leads", label: "Lidlar (BKLead)", value: leads.length },
    { key: "sales", label: "Sotuvlar", value: sales.length ? sales.length : null, note: sales.length ? `${Math.round(salesSum).toLocaleString("en-US").replace(/,/g, " ")} ${sales[0].sale!.currency ?? "USD"}` : "ma’lumot yo‘q" },
  ]);

  // ---- Daily series.
  const byDay = <T,>(rows: T[], at: (row: T) => Date) => { const out: Record<string, number> = {}; for (const row of rows) { const day = tashkentDay(at(row)); out[day] = (out[day] ?? 0) + 1; } return out; };
  const dmByDay = byDay(dmIn, row => row.sentAt);
  const statsByDay = new Map(days.map(row => [row.date, row]));
  const daily = range.days.map(day => ({ day, likes: statsByDay.get(day)?.likes ?? 0, comments: statsByDay.get(day)?.comments ?? 0, direct: dmByDay[day] ?? 0 }));

  // ---- Posts: leads and Direct (Private Replies) per post from our comment journal.
  const perMedia = new Map<string, { leads: number; direct: number }>();
  for (const row of comments) { const item = perMedia.get(row.mediaId) ?? { leads: 0, direct: 0 }; if (row.leadId) item.leads++; if (row.dmSentAt) item.direct++; perMedia.set(row.mediaId, item); }
  const posts = media.map(row => ({ id: row.mediaId, type: row.type, postedAt: row.postedAt.toISOString(), caption: row.caption, permalink: row.permalink, thumbnail: row.thumbnail, views: row.views, reach: row.reach, likes: row.likes, comments: row.comments, saved: row.saved, shares: row.shares, avgWatchMs: row.avgWatchMs, totalInteractions: row.totalInteractions, er: engagementRate(row.totalInteractions, row.reach), direct: perMedia.get(row.mediaId)?.direct ?? 0, leads: perMedia.get(row.mediaId)?.leads ?? 0 }));
  const types = contentTypes(posts.map(post => ({ mediaId: post.id, type: post.type, reach: post.reach, totalInteractions: post.totalInteractions, leads: post.leads })));

  const responses = dmAnswers.map(row => row.responseMs!);
  const heat = activityHeatmap([...activity[0].map(row => row.createdAt), ...activity[1].map(row => row.sentAt)]);
  return {
    period, range: { from: range.from, to: range.to, days: range.days },
    status: { connected: !!account, username: account?.username ?? null, fetchedAt: account?.insightsFetchedAt?.toISOString() ?? null, error: account?.insightsError ?? null, reconnect: account ? needsInsightsReconnect(account.grantedScopes, account.insightsError) : false, hasData: days.length > 0 || media.length > 0 || !!audience },
    kpis, funnel: steps, daily,
    commentsSource: commentTotal.source,
    kindsSince: firstComment?.createdAt.toISOString() ?? null,
    kinds: { PRICE: kindCount.PRICE ?? 0, POSITIVE: kindCount.POSITIVE ?? 0, QUESTION: kindCount.QUESTION ?? 0, NEGATIVE: kindCount.NEGATIVE ?? 0, SPAM: kindCount.SPAM ?? 0 },
    direct: { avgResponseMs: responses.length ? Math.round(responses.reduce((a, b) => a + b, 0) / responses.length) : null, answered: responses.length, waiting },
    audience: audience ? { date: audience.date, timeframe: audience.timeframe, follower: asAudience(audience.follower), engaged: asAudience(audience.engaged) } : null,
    heatmap: heat,
    types, posts,
    profile: { website: sumKey(media, "websiteClicks"), call: (total(days, "callTaps") ?? 0) + (sumKey(media, "callClicks") ?? 0) || null, direction: (total(days, "directionTaps") ?? 0) + (sumKey(media, "directionClicks") ?? 0) || null, follows, unfollows, net, netPercent: growthPercent(net, latestFollowers?.followersCount ?? null), growth },
  };
}
export type StatsBoard = Awaited<ReturnType<typeof getStatsBoard>>;
