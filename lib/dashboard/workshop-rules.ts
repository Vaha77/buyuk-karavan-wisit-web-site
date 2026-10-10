// Dashboard "Seh zakazlari": pure helpers (no database), so the tests run them directly.
import { dayKey } from "./period";

const DAY = 86_400_000;
/** A "Yangi" order nobody accepted for this long is listed under "Diqqat talab". */
export const UNACCEPTED_ALERT_MS = DAY;
/** Statuses that are still in the workshop right now. */
export const OPEN_STATUSES = ["NEW", "ACCEPTED", "STARTED"] as const;

/** First Monday (Tashkent) of the 12-week window that ends with the current week, as "YYYY-MM-DD". */
export function weekWindowStart(now = new Date()) {
  const todayKey = dayKey(now);
  const weekday = (new Date(`${todayKey}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.parse(`${todayKey}T00:00:00+05:00`) - weekday * DAY - 11 * 7 * DAY);
}

/** 12 weekly buckets from DB rows ({ week: "YYYY-MM-DD" Monday, kind: "in" | "out", count }); missing weeks are 0. */
export function fillWeeks(start: Date, rows: Array<{ week: string; kind: string; count: number }>) {
  const counts = new Map(rows.map(row => [`${row.week}:${row.kind}`, row.count]));
  return Array.from({ length: 12 }, (_, index) => {
    const week = dayKey(new Date(start.getTime() + index * 7 * DAY));
    return { week, incoming: counts.get(`${week}:in`) ?? 0, issued: counts.get(`${week}:out`) ?? 0 };
  });
}

/** Average preparation time: "45 daq", "5,5 soat", "2,3 kun"; "—" without data. */
export function formatPrepTime(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const hours = seconds / 3600;
  const one = (value: number) => (Math.round(value * 10) / 10).toString().replace(".", ",");
  if (hours < 1) return `${Math.max(1, Math.round(seconds / 60))} daq`;
  if (hours < 48) return `${one(hours)} soat`;
  return `${one(hours / 24)} kun`;
}

export type AttentionReason = "unaccepted" | "overdue";
/** Why an open order needs attention: past its due date (Tashkent day) and/or "Yangi" for over 24 hours. */
export function attentionReasons(order: { status: string; createdAt: Date; dueDate: string | null }, now = new Date()): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (!(OPEN_STATUSES as readonly string[]).includes(order.status)) return reasons;
  if (order.dueDate && order.dueDate < dayKey(now)) reasons.push("overdue");
  if (order.status === "NEW" && now.getTime() - order.createdAt.getTime() > UNACCEPTED_ALERT_MS) reasons.push("unaccepted");
  return reasons;
}
