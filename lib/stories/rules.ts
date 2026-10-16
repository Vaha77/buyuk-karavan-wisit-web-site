// Instagram stories queue: pure rules (no DB / network / Node imports — also used in the browser), tests/stories.test.mjs.

export const STORY_STATUSES = ["PENDING_APPROVAL", "APPROVED", "PUBLISHING", "PUBLISHED", "REJECTED", "FAILED", "EXPIRED"] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];
export const STATUS_LABELS: Record<StoryStatus, string> = { PENDING_APPROVAL: "Tasdiq kutilmoqda", APPROVED: "Tasdiqlangan", PUBLISHING: "Joylanmoqda", PUBLISHED: "Joylandi", REJECTED: "Rad etilgan", FAILED: "Xato", EXPIRED: "Muddati o‘tgan" };

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MIN_DURATION_MS = 3_000, MAX_DURATION_MS = 60_000;
/** 9:16 with a little tolerance (1080×1920, 720×1280, 1080×1916…). */
const PORTRAIT = 9 / 16, RATIO_TOLERANCE = 0.02;
/** 1 try + 2 retries. */
export const MAX_ATTEMPTS = 3;
/** An unapproved story expires at 18:00 Tashkent of its day (or at its own time, if that is later). */
export const EXPIRE_HOUR = 18;
const TZ_MS = 5 * 3_600_000, DAY_MS = 86_400_000;

// ---- MP4 -------------------------------------------------------------------------------------------------
export type VideoInfo = { durationMs: number; width: number; height: number };
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "udta"]);

/** Duration (mvhd) and the video track's display size (tkhd, rotation applied) of an MP4 / MOV file; null if unreadable. */
export function readMp4Info(data: Uint8Array): VideoInfo | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let durationMs: number | null = null, width = 0, height = 0;
  const walk = (start: number, end: number, depth: number) => {
    let offset = start;
    while (offset + 8 <= end && depth < 8) {
      let size = view.getUint32(offset);
      const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
      let header = 8;
      if (size === 1) { if (offset + 16 > end) return; size = Number(view.getBigUint64(offset + 8)); header = 16; }
      else if (size === 0) size = end - offset;
      if (size < header || offset + size > end) return;
      const body = offset + header;
      if (CONTAINERS.has(type)) walk(body, offset + size, depth + 1);
      else if (type === "mvhd" && body + 32 <= offset + size) {
        const version = data[body];
        const timescale = view.getUint32(body + (version === 1 ? 20 : 12));
        const duration = version === 1 ? Number(view.getBigUint64(body + 24)) : view.getUint32(body + 16);
        if (timescale > 0) durationMs = Math.round((duration / timescale) * 1000);
      } else if (type === "tkhd") {
        const version = data[body], base = body + (version === 1 ? 36 : 24) + 16; // → matrix
        if (base + 44 <= offset + size) {
          const fixed = (at: number) => view.getInt32(at) / 65536;
          const a = fixed(base), b = fixed(base + 4);
          const w = view.getUint32(base + 36) / 65536, h = view.getUint32(base + 40) / 65536;
          if (w > 0 && h > 0 && !width) { const rotated = Math.abs(a) < 0.01 && Math.abs(Math.abs(b) - 1) < 0.01; width = Math.round(rotated ? h : w); height = Math.round(rotated ? w : h); }
        }
      }
      offset += size;
    }
  };
  if (data.byteLength < 8) return null;
  walk(0, data.byteLength, 0);
  return durationMs !== null && width && height ? { durationMs, width, height } : null;
}

const isMp4 = (data: Uint8Array) => data.byteLength >= 12 && String.fromCharCode(...data.slice(4, 8)) === "ftyp";

/** MP4 ≤100 MB, 9:16, 3–60 s → its info, or the first problem (Uzbek, shown to the uploader). */
export function checkStoryVideo(data: Uint8Array, size = data.byteLength): { ok: true; info: VideoInfo } | { ok: false; error: string } {
  if (!size) return { ok: false, error: "Video fayl bo‘sh." };
  if (size > MAX_VIDEO_BYTES) return { ok: false, error: "Video 100 MB dan katta." };
  if (!isMp4(data)) return { ok: false, error: "Faqat MP4 video qabul qilinadi." };
  const info = readMp4Info(data);
  if (!info) return { ok: false, error: "MP4 o‘qilmadi (davomiylik yoki o‘lcham topilmadi)." };
  if (info.durationMs < MIN_DURATION_MS || info.durationMs > MAX_DURATION_MS) return { ok: false, error: `Video 3–60 soniya bo‘lishi kerak (hozir ${Math.round(info.durationMs / 100) / 10} s).` };
  if (Math.abs(info.width / info.height - PORTRAIT) > RATIO_TOLERANCE) return { ok: false, error: `Video 9:16 (vertikal) bo‘lishi kerak (hozir ${info.width}×${info.height}).` };
  return { ok: true, info };
}

// ---- Time (Asia/Tashkent, UTC+5) ------------------------------------------------------------------------
/** "2026-10-12T11:00" (Tashkent) or a full ISO time with Z / offset → Date; null when invalid. */
export function parseScheduledAt(value: string | null | undefined) {
  const text = (value ?? "").trim();
  const local = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (local) {
    const [, y, mo, d, h, mi, s] = local.map(Number) as unknown as number[];
    const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s || 0) - TZ_MS);
    const check = new Date(date.getTime() + TZ_MS);
    return check.getUTCMonth() === mo - 1 && check.getUTCDate() === d && h < 24 && mi < 60 ? date : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}
/** Not more than 10 minutes in the past, not more than 60 days ahead. */
export function scheduleError(at: Date, now = new Date()) {
  if (at.getTime() < now.getTime() - 10 * 60_000) return "Vaqt o‘tib ketgan.";
  if (at.getTime() > now.getTime() + 60 * DAY_MS) return "Vaqt 60 kundan uzoq.";
  return null;
}
export const tashkentDay = (date: Date) => new Date(date.getTime() + TZ_MS).toISOString().slice(0, 10);
/** "12.10 11:00" */
export function formatTashkent(date: Date) {
  const local = new Date(date.getTime() + TZ_MS).toISOString();
  return `${local.slice(8, 10)}.${local.slice(5, 7)} ${local.slice(11, 16)}`;
}
export const formatTime = (date: Date) => new Date(date.getTime() + TZ_MS).toISOString().slice(11, 16);
/** For <input type="datetime-local">: "2026-10-12T11:00" in Tashkent time. */
export const toLocalInput = (date: Date) => new Date(date.getTime() + TZ_MS).toISOString().slice(0, 16);
/** Start / end (UTC) of a Tashkent day "2026-10-12". */
export function dayBounds(day: string) {
  const start = new Date(Date.parse(`${day}T00:00:00Z`) - TZ_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

// ---- Status machine --------------------------------------------------------------------------------------
export type StoryAction = "approve" | "reject" | "reschedule" | "claim" | "published" | "failed" | "expire";
const FROM: Record<StoryAction, StoryStatus[]> = {
  approve: ["PENDING_APPROVAL"],
  reject: ["PENDING_APPROVAL", "APPROVED"],
  reschedule: ["PENDING_APPROVAL", "APPROVED", "EXPIRED", "FAILED"],
  claim: ["APPROVED"],
  published: ["PUBLISHING"],
  failed: ["PUBLISHING"],
  expire: ["PENDING_APPROVAL"],
};
/** The status after an action, or null when the action is not allowed from `status`. */
export function nextStatus(status: StoryStatus, action: StoryAction, attempts = 0): StoryStatus | null {
  if (!FROM[action].includes(status)) return null;
  switch (action) {
    case "approve": return "APPROVED";
    case "reject": return "REJECTED";
    // Approved stays approved; an expired / failed story goes back for approval.
    case "reschedule": return status === "APPROVED" ? "APPROVED" : "PENDING_APPROVAL";
    case "claim": return "PUBLISHING";
    case "published": return "PUBLISHED";
    case "failed": return attempts >= MAX_ATTEMPTS ? "FAILED" : "APPROVED";
    case "expire": return "EXPIRED";
  }
}

// ---- Cron selection --------------------------------------------------------------------------------------
type Selectable = { status: StoryStatus; scheduledAt: Date; lockedUntil?: Date | null; igContainerId?: string | null };
const unlocked = (item: Selectable, now: Date) => !item.lockedUntil || item.lockedUntil.getTime() <= now.getTime();
/** Approved and due (scheduledAt ≤ now), not locked by another run. */
export const isDue = (item: Selectable, now = new Date()) => item.status === "APPROVED" && item.scheduledAt.getTime() <= now.getTime() && unlocked(item, now);
/** A container created by an earlier run that still has to be checked / published. */
export const needsContainerCheck = (item: Selectable, now = new Date()) => item.status === "PUBLISHING" && !!item.igContainerId && unlocked(item, now);
/** When an unapproved story expires: 18:00 Tashkent of its day, or its own time if that is later. */
export function expiresAt(scheduledAt: Date) {
  const sixPm = new Date(dayBounds(tashkentDay(scheduledAt)).start.getTime() + EXPIRE_HOUR * 3_600_000);
  return scheduledAt.getTime() > sixPm.getTime() ? scheduledAt : sixPm;
}
export const shouldExpire = (item: Selectable, now = new Date()) => item.status === "PENDING_APPROVAL" && expiresAt(item.scheduledAt).getTime() <= now.getTime();

/** Instagram container status_code → what to do next. */
export function containerStep(statusCode: string | null | undefined): "publish" | "wait" | "fail" {
  if (statusCode === "FINISHED") return "publish";
  if (statusCode === "IN_PROGRESS" || !statusCode) return "wait";
  return "fail"; // ERROR, EXPIRED, …
}

// ---- Telegram --------------------------------------------------------------------------------------------
export type StoryCallback = { kind: "ok" | "no"; id: string } | { kind: "day"; day: string; accountId?: string };
/** story:ok:<id> · story:no:<id> · story:day:2026-10-12[:<accountId>] (≤ 64 bytes). */
export function parseStoryCallback(data: string | null | undefined): StoryCallback | null {
  const match = data?.match(/^story:(ok|no):([a-z0-9]{8,40})$/i);
  if (match) return { kind: match[1] as "ok" | "no", id: match[2] };
  const day = data?.match(/^story:day:(\d{4}-\d{2}-\d{2})(?::([a-z0-9]{1,40}))?$/i);
  return day ? { kind: "day", day: day[1], ...(day[2] ? { accountId: day[2] } : {}) } : null;
}
/** With `accountId` the day button approves only that account's stories. */
export function approvalKeyboard(id: string, scheduledAt: Date, accountId?: string) {
  const day = tashkentDay(scheduledAt);
  return { inline_keyboard: [
    [{ text: "✅ Tasdiqlash", callback_data: `story:ok:${id}` }, { text: "❌ Rad etish", callback_data: `story:no:${id}` }],
    [{ text: `✅ Hammasini tasdiqlash (${day.slice(8, 10)}.${day.slice(5, 7)})`, callback_data: `story:day:${day}${accountId ? `:${accountId}` : ""}` }],
  ] };
}
export function approvalText(item: { scheduledAt: Date; caption: string | null; durationMs: number | null; status?: StoryStatus }) {
  const lines = [`📲 Storis navbatda`, `🕐 ${formatTashkent(item.scheduledAt)}`, item.durationMs ? `⏱ ${Math.round(item.durationMs / 1000)} s` : null, item.caption ? `📝 ${item.caption.slice(0, 600)}` : null];
  if (item.status && item.status !== "PENDING_APPROVAL") lines.push("", `Holat: ${STATUS_LABELS[item.status]}`);
  return lines.filter(line => line !== null).join("\n");
}
export const publishedText = (publishedAt: Date) => `✅ Storis joylandi ${formatTime(publishedAt)}`;
export const failedText = (error: string) => `⚠️ Storis xato: ${error}`.slice(0, 900);
/** Telegram fetches files given by URL only up to 20 MB; bigger videos are sent as a link. */
export const TELEGRAM_URL_VIDEO_LIMIT = 20 * 1024 * 1024;
