// Instagram statistics: pure rules (no DB / network, safe in client components), covered by tests/instagram-insights.test.mjs.
// Metric names follow Meta's "Instagram API with Instagram Login" Insights reference (v25.0).

export const ACCOUNT_METRICS = ["reach", "views", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "replies", "reposts"] as const;
export const MEDIA_METRICS: Record<"POST" | "REELS" | "STORY", string[]> = {
  POST: ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions", "profile_visits", "follows"],
  REELS: ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions", "ig_reels_avg_watch_time"],
  STORY: ["reach", "views", "shares", "total_interactions", "profile_visits", "follows", "replies"],
};
export const DEMOGRAPHIC_BREAKDOWNS = ["country", "city", "age", "gender"] as const;
/** Meta: last_14/30/90_days and prev_month are not supported since v20.0; this_month = the last 30 days. */
export const DEMOGRAPHIC_TIMEFRAME = "this_month";
export const INSIGHTS_SCOPE = "instagram_business_manage_insights";
export const MAP_COUNTRIES = ["UZ", "KZ", "KG", "TJ", "TM", "AF", "RU"] as const;

export const needsInsightsReconnect = (scopes: readonly string[] | null | undefined, error?: string | null) => !scopes?.includes(INSIGHTS_SCOPE) || /#(10|200|190)\b/.test(error ?? "");

// ---- Parsing Graph responses -----------------------------------------------------------------------------

type InsightRow = { name?: string; total_value?: { value?: number; breakdowns?: Array<{ dimension_keys?: string[]; results?: Array<{ dimension_values?: string[]; value?: number }> }> }; values?: Array<{ value?: number | Record<string, number> }> };
const rowsOf = (json: unknown): InsightRow[] => Array.isArray((json as { data?: unknown })?.data) ? (json as { data: InsightRow[] }).data : [];
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

/** { metric: value } from a total_value (or lifetime media) response; a missing metric stays absent (Meta: empty, not 0). */
export function parseTotals(json: unknown) {
  const out: Record<string, number> = {};
  for (const row of rowsOf(json)) {
    if (!row.name) continue;
    const value = num(row.total_value?.value) ?? num(row.values?.[0]?.value);
    if (value !== null) out[row.name] = value;
  }
  return out;
}

/** { "UZ": 120, "KZ": 30 } (or "Tashkent, Uzbekistan", "25-34", "F") from a total_value response with one breakdown. */
export function parseBreakdown(json: unknown) {
  const out: Record<string, number> = {};
  for (const row of rowsOf(json)) for (const breakdown of row.total_value?.breakdowns ?? []) for (const result of breakdown.results ?? []) {
    const key = (result.dimension_values ?? []).join("|"), value = num(result.value);
    if (key && value !== null) out[key] = (out[key] ?? 0) + value;
  }
  return out;
}

/** profile_links_taps by contact_button_type → our columns. */
export function linkTaps(breakdown: Record<string, number>) {
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return { linkTaps: Object.keys(breakdown).length ? total : null, callTaps: breakdown.CALL ?? null, directionTaps: breakdown.DIRECTION ?? null, emailTaps: breakdown.EMAIL ?? null, textTaps: breakdown.TEXT ?? null };
}

/**
 * follows_and_unfollows by follow_type. Meta's reference does not spell the values out; in the responses FOLLOWER is
 * new follows and NON_FOLLOWER the accounts that unfollowed (or left Instagram).
 */
export const followsFrom = (breakdown: Record<string, number>) => ({ follows: breakdown.FOLLOWER ?? null, unfollows: breakdown.NON_FOLLOWER ?? null });

/** REELS / POST / STORY from the media fields we can read with Instagram Login. */
export function mediaKind(media: { media_type?: string; media_product_type?: string; permalink?: string | null }, story = false) {
  if (story || media.media_product_type === "STORY") return "STORY" as const;
  if (media.media_product_type === "REELS" || /\/reels?\//.test(media.permalink ?? "")) return "REELS" as const;
  return "POST" as const;
}

// ---- Numbers ---------------------------------------------------------------------------------------------

/** Engagement rate, %: total_interactions / reach × 100 (1 decimal); null without reach. */
export const engagementRate = (interactions: number | null | undefined, reach: number | null | undefined) => reach && reach > 0 && interactions !== null && interactions !== undefined ? Math.round((interactions / reach) * 1000) / 10 : null;
/** Change against the previous period, % (1 decimal); null when there is nothing to compare with. */
export const changePercent = (current: number | null | undefined, previous: number | null | undefined) => current === null || current === undefined || !previous ? null : Math.round(((current - previous) / previous) * 1000) / 10;
const sum = (values: Array<number | null | undefined>) => { const known = values.filter((value): value is number => typeof value === "number"); return known.length ? known.reduce((a, b) => a + b, 0) : null; };
export const sumKey = <T,>(rows: T[], key: keyof T) => sum(rows.map(row => row[key] as unknown as number | null));

export type FunnelStep = { key: string; label: string; value: number | null; note?: string };
/** Conversion of each step from the previous one, % (1 decimal); null when either side has no data. */
export function funnel(steps: FunnelStep[]) {
  return steps.map((step, index) => {
    const previous = index ? steps[index - 1].value : null;
    return { ...step, conversion: index && step.value !== null && previous ? Math.round((step.value / previous) * 1000) / 10 : null };
  });
}

// ---- Periods and dates (Tashkent) ------------------------------------------------------------------------

export const PERIODS = { today: 1, "7": 7, "30": 30, "90": 90 } as const;
export type Period = keyof typeof PERIODS;
export const PERIOD_LABELS: Record<Period, string> = { today: "Bugun", "7": "7 kun", "30": "30 kun", "90": "90 kun" };
const DAY_MS = 86_400_000, TZ_MS = 5 * 3_600_000;
export const tashkentDay = (date: Date) => new Date(date.getTime() + TZ_MS).toISOString().slice(0, 10);
const shiftDay = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);
/** UTC moment of 00:00 Tashkent of a day. */
export const dayStartUtc = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - TZ_MS);

/** The period's days (oldest first, ending today) and the same number of days before it. */
export function periodRange(period: Period, now = new Date()) {
  const length = PERIODS[period], today = tashkentDay(now);
  const days = Array.from({ length }, (_, index) => shiftDay(today, index - length + 1));
  const previous = Array.from({ length }, (_, index) => shiftDay(today, index - 2 * length + 1));
  return { length, days, previous, from: days[0], to: today, prevFrom: previous[0], prevTo: previous[previous.length - 1] };
}

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
/** "2026-10-11" → "11-okt 2026"; `short` → "11-okt". */
export function formatDayUz(day: string, short = false) {
  const [year, month, date] = day.slice(0, 10).split("-").map(Number);
  return `${date}-${MONTHS[month - 1]}${short ? "" : ` ${year}`}`;
}
/** 90550 → "90 550", 12.5 → "12,5". */
export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const [whole, fraction] = Math.abs(value).toFixed(digits).split(".");
  return `${value < 0 ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${fraction && Number(fraction) ? `,${fraction}` : ""}`;
}
export function formatDurationMs(ms: number | null | undefined) {
  if (!ms && ms !== 0) return "—";
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} daq ${seconds % 60} s`;
}

// ---- Audience --------------------------------------------------------------------------------------------

/** Shares of the total, % (1 decimal), largest first. */
export function shares(values: Record<string, number>, keys?: readonly string[]) {
  const total = Object.values(values).reduce((a, b) => a + b, 0);
  const rows = (keys ?? Object.keys(values)).map(key => ({ key, value: values[key] ?? 0, percent: total ? Math.round(((values[key] ?? 0) / total) * 1000) / 10 : 0 }));
  return { total, rows: rows.sort((a, b) => b.value - a.value) };
}
export const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
export const GENDER_LABELS: Record<string, string> = { M: "Erkak", F: "Ayol", U: "Noma’lum" };
/** "Tashkent, Tashkent" → "Tashkent". */
export const cityName = (key: string) => key.split(",")[0].trim();

// ---- Best time to post -----------------------------------------------------------------------------------

/**
 * Day-of-week × hour counts (Tashkent, Monday first). Meta's online_followers is not in the current Instagram Login
 * metric list, so this is built from the times our own comments and Direct messages arrive.
 */
export function activityHeatmap(times: Date[]) {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const time of times) {
    const local = new Date(time.getTime() + TZ_MS);
    grid[(local.getUTCDay() + 6) % 7][local.getUTCHours()]++;
  }
  const max = Math.max(0, ...grid.flat());
  let best: { day: number; hour: number } | null = null;
  grid.forEach((row, day) => row.forEach((value, hour) => { if (max && value === max && !best) best = { day, hour }; }));
  return { grid, max, best: best as { day: number; hour: number } | null };
}
export const WEEKDAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

// ---- Content types ---------------------------------------------------------------------------------------

export type MediaRow = { mediaId: string; type: string; reach: number | null; totalInteractions: number | null; leads: number };
export function contentTypes(media: MediaRow[]) {
  return (["REELS", "POST", "STORY"] as const).map(type => {
    const rows = media.filter(row => row.type === type);
    const reach = sum(rows.map(row => row.reach)), interactions = sum(rows.map(row => row.totalInteractions));
    return { type, count: rows.length, avgReach: rows.length && reach !== null ? Math.round(reach / rows.length) : null, er: engagementRate(interactions, reach), leads: rows.reduce((total, row) => total + row.leads, 0) };
  });
}
export const TYPE_LABELS: Record<string, string> = { REELS: "Reels", POST: "Post", STORY: "Storis" };
