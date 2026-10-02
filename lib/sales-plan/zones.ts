// The six completion zones of "Sotuv rejasi". The only place that knows zone colours, labels, decisions and
// thresholds: the board, cards, monthly cells, legend and group cards all go through zoneOf()/resolveZones().
// Thresholds are the lower bounds in percent; admins can change them in Sozlamalar (SiteSettings.salesPlanZones).
import { formatDecimal } from "../dashboard/format";

export type ZoneKey = "record" | "excellent" | "good" | "fair" | "warning" | "danger";
/** Lower bound (percent, inclusive) of each zone except "danger", which is everything below "warning". */
export type ZoneThresholds = { record: number; excellent: number; good: number; fair: number; warning: number };

export const DEFAULT_THRESHOLDS: ZoneThresholds = { record: 100, excellent: 80, good: 70, fair: 60, warning: 40 };
/** Highest zone first; thresholds must increase from warning to record. */
export const THRESHOLD_KEYS = ["warning", "fair", "good", "excellent", "record"] as const;

const STYLE: Record<ZoneKey, { label: string; color: string; text: string; decision: string }> = {
  record: { label: "Rekord", color: "#0F6B3A", text: "#FFFFFF", decision: "Bonus va mukofot, keyingi davr rejasi oshiriladi" },
  excellent: { label: "Ajoyib", color: "#45B36B", text: "#0B2E18", decision: "Bonus, 100% ga yetish uchun rag‘bat" },
  good: { label: "Yaxshi", color: "#A8D5A2", text: "#14213D", decision: "Maqtov, 80% ga chiqish maqsadi qo‘yiladi" },
  fair: { label: "Qoniqarli", color: "#F2C230", text: "#3D2E00", decision: "Izlanish: rahbar bilan suhbat, sabablar tahlili" },
  warning: { label: "Ogohlantirish", color: "#F08A3C", text: "#3D1C00", decision: "Yozma ogohlantirish + 1 oylik yaxshilash rejasi" },
  danger: { label: "Xavf", color: "#D2372B", text: "#FFFFFF", decision: "2 davr ketma-ket bo‘lsa — almashtirish" },
};
const ORDER: ZoneKey[] = ["record", "excellent", "good", "fair", "warning", "danger"];

export type ZoneInfo = { key: ZoneKey; label: string; color: string; text: string; decision: string; min: number; range: string };

const pct = (value: number) => formatDecimal(value, 1);
/** Zones with their bounds and range labels ("100%+", "80–99%", …, "40% dan past") for the given thresholds. */
export function resolveZones(thresholds: ZoneThresholds = DEFAULT_THRESHOLDS): ZoneInfo[] {
  return ORDER.map((key, index) => {
    const min = key === "danger" ? -Infinity : thresholds[key];
    const upper = index === 0 ? null : thresholds[ORDER[index - 1] as keyof ZoneThresholds];
    const range = key === "record" ? `${pct(min)}%+` : key === "danger" ? `${pct(thresholds.warning)}% dan past` : `${pct(min)}–${pct(upper! - 1)}%`;
    return { key, ...STYLE[key], min, range };
  });
}

/** Zone of a completion percent; a bound belongs to the higher zone (exactly 60% is "fair"). */
export function zoneOf(percent: number, thresholds: ZoneThresholds = DEFAULT_THRESHOLDS): ZoneKey {
  for (const key of ORDER) if (key === "danger" || percent >= thresholds[key]) return key;
  return "danger";
}

export const zoneStyle = (key: ZoneKey) => STYLE[key];

/** null when valid; otherwise an Uzbek message. Whole percents 0–200, strictly increasing warning < … < record. */
export function validateThresholds(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Chegaralarni kiriting.";
  const record = value as Record<string, unknown>;
  for (const key of THRESHOLD_KEYS) {
    const number = record[key];
    if (typeof number !== "number" || !Number.isInteger(number) || number < 0 || number > 200) return "Har bir chegara 0–200% oralig‘idagi butun son bo‘lsin.";
  }
  for (let index = 1; index < THRESHOLD_KEYS.length; index++) {
    if ((record[THRESHOLD_KEYS[index]] as number) <= (record[THRESHOLD_KEYS[index - 1]] as number)) return "Chegaralar o‘suvchi tartibda bo‘lsin: Ogohlantirish < Qoniqarli < Yaxshi < Ajoyib < Rekord.";
  }
  return null;
}

/** Thresholds stored in SiteSettings, or the defaults when missing or invalid. */
export function parseThresholds(value: unknown): ZoneThresholds {
  if (validateThresholds(value)) return DEFAULT_THRESHOLDS;
  const record = value as ZoneThresholds;
  return { record: record.record, excellent: record.excellent, good: record.good, fair: record.fair, warning: record.warning };
}
