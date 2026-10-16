import "server-only";
// Instagram statistics collection: daily cron (06:00 Tashkent) and "Hozir yangilash". Account totals per Tashkent day
// (the last 3 days again — Meta may lag up to 48 h; the first run back-fills 30 days), lifetime insights of the posts of
// the last 90 days and today's stories, and one audience snapshot per day. Errors are stored (token-free), never thrown.
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { GraphError, accountInsights, followersCount, listMediaSince, listStories, mediaInsights, type IgMedia } from "./graph";
import { ACCOUNT_METRICS, DEMOGRAPHIC_BREAKDOWNS, DEMOGRAPHIC_TIMEFRAME, MEDIA_METRICS, dayStartUtc, followsFrom, linkTaps, mediaKind, parseBreakdown, parseTotals, tashkentDay } from "./insights-rules";
import { errorReason } from "./rules";
import { accountToken, getInstagramAccount, listInstagramAccounts } from "./service";

const DAY_MS = 86_400_000;
const reason = (error: unknown) => error instanceof GraphError ? errorReason(error.info) : error instanceof Error ? error.name : "Xato";
const shift = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);

/** Runs `task` over `items` with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) await task(items[next++]); }));
}

async function dailyTotals(token: string, igUserId: string, day: string) {
  const range = { period: "day", metric_type: "total_value", since: String(Math.floor(dayStartUtc(day).getTime() / 1000)), until: String(Math.floor((dayStartUtc(day).getTime() + DAY_MS) / 1000) - 1) };
  const totals = parseTotals(await accountInsights(token, igUserId, { ...range, metric: ACCOUNT_METRICS.join(",") }));
  const follows = await accountInsights(token, igUserId, { ...range, metric: "follows_and_unfollows", breakdown: "follow_type" }).then(parseBreakdown).catch(() => ({}));
  const taps = await accountInsights(token, igUserId, { ...range, metric: "profile_links_taps", breakdown: "contact_button_type" }).then(parseBreakdown).catch(() => ({}));
  return {
    reach: totals.reach ?? null, views: totals.views ?? null, accountsEngaged: totals.accounts_engaged ?? null, totalInteractions: totals.total_interactions ?? null,
    likes: totals.likes ?? null, comments: totals.comments ?? null, shares: totals.shares ?? null, saves: totals.saves ?? null, replies: totals.replies ?? null, reposts: totals.reposts ?? null,
    ...followsFrom(follows), ...linkTaps(taps),
  };
}

/** One post's lifetime insights; a metric Meta refuses for this post is dropped and the rest asked again. */
async function mediaTotals(token: string, media: IgMedia, kind: "POST" | "REELS" | "STORY") {
  // All metrics → only the stable ones ("in development" metrics may be refused for older media) → reach only.
  const ladder = [MEDIA_METRICS[kind], MEDIA_METRICS[kind].filter(metric => ["reach", "likes", "comments", "saved", "shares"].includes(metric)), ["reach"]];
  let totals: Record<string, number> = {};
  for (let attempt = 0; attempt < ladder.length; attempt++) {
    try { totals = parseTotals(await mediaInsights(token, media.id, ladder[attempt])); break; }
    catch (error) { if (!(error instanceof GraphError) || attempt === ladder.length - 1) throw error; }
  }
  const activity = kind === "REELS" ? {} : await mediaInsights(token, media.id, ["profile_activity"], "action_type").then(parseBreakdown).catch(() => ({} as Record<string, number>));
  return {
    views: totals.views ?? null, reach: totals.reach ?? null, likes: totals.likes ?? null, comments: totals.comments ?? media.comments_count ?? null, saved: totals.saved ?? null, shares: totals.shares ?? null,
    totalInteractions: totals.total_interactions ?? null, profileVisits: totals.profile_visits ?? null, follows: totals.follows ?? null,
    websiteClicks: activity.BIO_LINK_CLICKED ?? null, callClicks: activity.CALL ?? null, directionClicks: activity.DIRECTION ?? null,
    avgWatchMs: totals.ig_reels_avg_watch_time ?? null,
  };
}

export type RefreshResult = { ok: boolean; days: number; media: number; audience: boolean; errors: string[] };

/** Daily cron: every account, one after another. */
export async function refreshAllInsights() {
  const results: Array<RefreshResult & { account: string }> = [];
  for (const account of await listInstagramAccounts()) results.push({ account: account.username, ...await refreshInsights({ accountId: account.id }) });
  return results;
}

/** Fetches what Meta has for one account and stores it. Never throws; the first error (token-free) is kept on the account. */
export async function refreshInsights(options: { accountId?: string; backfillDays?: number } = {}): Promise<RefreshResult> {
  const db = getDb(), result: RefreshResult = { ok: false, days: 0, media: 0, audience: false, errors: [] };
  const account = await getInstagramAccount(options.accountId);
  const token = account && accountToken(account);
  if (!account || !token) { result.errors.push("Instagram ulanmagan yoki token o‘qilmadi"); return result; }
  const today = tashkentDay(new Date());

  // Account totals: the last 3 days, or 30 when there is nothing yet.
  const accountId = account.id;
  const known = await db.instagramDailyStat.count({ where: { accountId } });
  const span = options.backfillDays ?? (known ? 3 : 30);
  for (let index = span - 1; index >= 0; index--) {
    const day = shift(today, -index);
    try {
      const data = await dailyTotals(token, account.igUserId, day);
      await db.instagramDailyStat.upsert({ where: { accountId_date: { accountId, date: day } }, create: { accountId, date: day, ...data }, update: data });
      result.days++;
    } catch (error) { result.errors.push(`${day}: ${reason(error)}`); if (error instanceof GraphError && [10, 190, 200].includes(error.info.code ?? 0)) break; }
  }
  try {
    const followers = await followersCount(token);
    if (followers !== null) await db.instagramDailyStat.upsert({ where: { accountId_date: { accountId, date: today } }, create: { accountId, date: today, followersCount: followers }, update: { followersCount: followers } });
  } catch (error) { result.errors.push(`followers_count: ${reason(error)}`); }

  // Posts of the last 90 days + live stories.
  try {
    const posts = await listMediaSince(token, account.igUserId, new Date(Date.now() - 90 * DAY_MS));
    const stories = await listStories(token, account.igUserId).catch(() => [] as IgMedia[]);
    const items = [...posts.map(media => ({ media, kind: mediaKind(media) })), ...stories.map(media => ({ media, kind: "STORY" as const }))];
    await pool(items, 4, async ({ media, kind }) => {
      try {
        const stats = await mediaTotals(token, media, kind);
        const base = { accountId, type: kind, mediaType: media.media_type ?? null, postedAt: new Date(media.timestamp ?? Date.now()), caption: media.caption?.slice(0, 1000) ?? null, permalink: media.permalink ?? null, thumbnail: media.thumbnail_url ?? (media.media_type === "VIDEO" ? null : media.media_url ?? null) };
        await db.instagramMediaStat.upsert({ where: { mediaId: media.id }, create: { mediaId: media.id, ...base, ...stats }, update: { ...base, ...stats } });
        result.media++;
      } catch (error) { if (result.errors.length < 20) result.errors.push(`media ${media.id}: ${reason(error)}`); }
    });
  } catch (error) { result.errors.push(`media: ${reason(error)}`); }

  // Audience: followers and engaged accounts by country / city / age / gender (Meta: top 45, last 30 days).
  try {
    const audience: Record<"follower" | "engaged", Record<string, Record<string, number>>> = { follower: {}, engaged: {} };
    for (const [key, metric] of [["follower", "follower_demographics"], ["engaged", "engaged_audience_demographics"]] as const) {
      for (const breakdown of DEMOGRAPHIC_BREAKDOWNS) {
        audience[key][breakdown] = await accountInsights(token, account.igUserId, { metric, period: "lifetime", metric_type: "total_value", timeframe: DEMOGRAPHIC_TIMEFRAME, breakdown }).then(parseBreakdown).catch(error => { if (result.errors.length < 25) result.errors.push(`${metric}/${breakdown}: ${reason(error)}`); return {}; });
      }
    }
    if (Object.values(audience.follower).some(item => Object.keys(item).length) || Object.values(audience.engaged).some(item => Object.keys(item).length)) {
      const data = { timeframe: DEMOGRAPHIC_TIMEFRAME, follower: audience.follower as Prisma.InputJsonValue, engaged: audience.engaged as Prisma.InputJsonValue, fetchedAt: new Date() };
      await db.instagramAudienceSnapshot.upsert({ where: { accountId_date: { accountId, date: today } }, create: { accountId, date: today, ...data }, update: data });
      result.audience = true;
    }
  } catch (error) { result.errors.push(`audience: ${reason(error)}`); }

  result.ok = result.days > 0 || result.media > 0 || result.audience;
  await db.instagramAccount.update({ where: { id: accountId }, data: { insightsFetchedAt: new Date(), insightsError: result.errors[0]?.slice(0, 300) ?? null } }).catch(() => undefined);
  return result;
}
