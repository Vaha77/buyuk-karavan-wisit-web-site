// Deterministic uz-UZ formatting shared by server and client (Intl output differs between Node and browsers,
// which would cause hydration mismatches). Thousands use a narrow no-break space, decimals a comma: "1 240", "2,3%".
const GROUP = " ";

export function formatInt(value: number) {
  const sign = value < 0 ? "−" : "";
  return sign + Math.round(Math.abs(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
}

export function formatDecimal(value: number, digits = 1) {
  const fixed = Math.abs(value).toFixed(digits);
  const [whole, fraction] = fixed.split(".");
  return `${value < 0 ? "−" : ""}${formatInt(Number(whole))}${fraction && Number(fraction) !== 0 ? `,${fraction}` : ""}`;
}

export function formatPercent(value: number, digits = 1) { return `${formatDecimal(value, digits)}%`; }
export function formatUsd(value: number, digits = 0) { return `$${digits ? formatDecimal(value, digits) : formatInt(value)}`; }
/** "18,4k" for table cells in thousands of USD. */
export function formatUsdK(value: number) { return value >= 1000 ? `${formatDecimal(value / 1000, 1)}k` : formatInt(value); }

export function percentOf(part: number, whole: number) { return whole > 0 ? (part / whole) * 100 : 0; }

const MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
export const MONTHS_LONG = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
/** "13 iyl" in Asia/Tashkent (UTC+5, no DST). */
export function formatDayMonth(date: Date) { const local = tashkent(date); return `${local.getUTCDate()} ${MONTHS_SHORT[local.getUTCMonth()]}`; }
export function tashkent(date: Date) { return new Date(date.getTime() + 5 * 3_600_000); }

/** "12 daqiqa oldin", "3 soat oldin", "kecha", "4 kun oldin" relative to `now` (passed in for determinism). */
export function formatRelative(date: Date, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "hozirgina";
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor((tashkent(now).setUTCHours(0, 0, 0, 0) - tashkent(date).setUTCHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 1) return "kecha";
  return `${days} kun oldin`;
}

/** Seconds as "1:12" (m:ss). */
export function formatDuration(seconds: number) { const s = Math.max(0, Math.round(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
