// "Mijoz so‘rovlari" charts: pure aggregation over grouped lead rows (one SQL GROUP BY in stats.ts). Tashkent = UTC+5, no DST.
export const LEAD_PERIODS = [["today", "Bugun"], ["7d", "7 kun"], ["30d", "30 kun"], ["year", "Yil"]] as const;
export type LeadPeriodKey = (typeof LEAD_PERIODS)[number][0];
export type LeadStatRow = { at: Date; source: string; status: string; phone: boolean; product: string; price: number | null; n: number };
export type SourceGroup = "instagram" | "site" | "other";

const HOUR = 3_600_000, DAY = 24 * HOUR, TZ = 5 * HOUR;
const local = (date: Date) => new Date(date.getTime() + TZ);
const dayStart = (date: Date) => new Date(Math.floor((date.getTime() + TZ) / DAY) * DAY - TZ);
const monthStart = (year: number, month: number) => new Date(Date.UTC(year, month, 1) - TZ);
export const SOURCE_GROUPS: Array<[SourceGroup, string, string]> = [["instagram", "Instagram", "#f472b6"], ["site", "Sayt · Madina", "#8b5cf6"], ["other", "Boshqa", "#fbbf24"]];
export const sourceGroup = (source: string): SourceGroup => source.startsWith("INSTAGRAM") ? "instagram" : source === "OTHER" ? "other" : "site";
export const WEEKDAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
export const HEAT_FROM = 8, HEAT_TO = 22;
const MONTHS = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];

export const priceText = (price: number | null) => price ? `$${String(Math.round(price)).replace(/\B(?=(\d{3})+$)/g, " ")}` : "narxsiz";

/** [from, to) of the chosen chip, the equal period before it and the chart buckets (hours today, days, months for Yil). */
export function leadPeriod(raw: string | undefined, now = new Date()) {
  const key: LeadPeriodKey = LEAD_PERIODS.some(([id]) => id === raw) ? raw as LeadPeriodKey : "7d";
  const today = dayStart(now), to = new Date(today.getTime() + DAY), buckets: Array<{ from: Date; label: string }> = [];
  if (key === "today") for (let h = 0; h < 24; h++) buckets.push({ from: new Date(today.getTime() + h * HOUR), label: `${String(h).padStart(2, "0")}:00` });
  else if (key === "year") {
    const n = local(now), y = n.getUTCFullYear(), m = n.getUTCMonth();
    for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(y, m - i, 1)); buckets.push({ from: monthStart(d.getUTCFullYear(), d.getUTCMonth()), label: MONTHS[d.getUTCMonth()] }); }
  } else {
    const days = key === "7d" ? 7 : 30;
    for (let i = days; i > 0; i--) { const from = new Date(to.getTime() - i * DAY), d = local(from); buckets.push({ from, label: days === 7 ? WEEKDAYS[(d.getUTCDay() + 6) % 7].slice(0, 2) : `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}` }); }
  }
  const from = buckets[0].from, length = to.getTime() - from.getTime();
  return { key, from, to, prevFrom: new Date(from.getTime() - length), today, buckets };
}
export type LeadPeriod = ReturnType<typeof leadPeriod>;

const NEW = (r: LeadStatRow) => r.status === "NEW", CONTACTED = (r: LeadStatRow) => r.status === "CONTACTED", WON = (r: LeadStatRow) => r.status === "WON" || r.status === "COMPLETED";
const pct = (part: number, whole: number) => whole ? Math.round(part / whole * 100) : 0;
function change(now: number, before: number, suffix: string) {
  const diff = now - before;
  return { text: `${diff < 0 ? "▼" : "▲"} ${before ? `${Math.abs(Math.round(diff / before * 100))}%` : Math.abs(diff)} ${suffix}`, down: diff < 0 };
}

export function buildLeadStats(rows: LeadStatRow[], period: LeadPeriod) {
  const inPeriod = (r: LeadStatRow) => r.at >= period.from && r.at < period.to;
  const cur = rows.filter(inPeriod), prev = rows.filter(r => r.at >= period.prevFrom && r.at < period.from);
  const sum = (list: LeadStatRow[], test: (r: LeadStatRow) => boolean = () => true) => list.reduce((s, r) => s + (test(r) ? r.n : 0), 0);
  const span = period.to.getTime() - period.from.getTime();
  const spark = (test: (r: LeadStatRow) => boolean) => { const v = Array(7).fill(0); for (const r of cur) if (test(r)) v[Math.min(6, Math.floor((r.at.getTime() - period.from.getTime()) * 7 / span))] += r.n; return v as number[]; };
  const total = sum(cur), answered = total - sum(cur, NEW);
  const todayTest = (r: LeadStatRow) => r.at >= period.today, yesterday = new Date(period.today.getTime() - DAY);
  const todayCount = sum(rows, todayTest), yesterdayCount = sum(rows, r => r.at >= yesterday && r.at < period.today);
  const kpis = [
    { key: "new", name: "Yangi so‘rovlar", color: "#22d3ee", value: sum(cur, NEW), spark: spark(NEW), change: change(sum(cur, NEW), sum(prev, NEW), "o‘tgan davrga") },
    { key: "today", name: "Bugungi", color: "#8b5cf6", value: todayCount, spark: spark(() => true), change: change(todayCount, yesterdayCount, "kechagiga") },
    { key: "contacted", name: "Bog‘lanildi", color: "#fbbf24", value: sum(cur, CONTACTED), spark: spark(CONTACTED), change: change(sum(cur, CONTACTED), sum(prev, CONTACTED), "o‘tgan davrga") },
    { key: "won", name: "Muvaffaqiyatli", color: "#34d399", value: sum(cur, WON), spark: spark(WON), change: change(sum(cur, WON), sum(prev, WON), "o‘tgan davrga") },
  ];
  // Area: per bucket, per source group, plus the answered (≠ Yangi) line.
  const starts = period.buckets.map(b => b.from.getTime()), at = (r: LeadStatRow) => { let i = starts.length - 1; while (i > 0 && starts[i] > r.at.getTime()) i--; return i; };
  const series = period.buckets.map(b => ({ label: b.label, instagram: 0, site: 0, other: 0, answered: 0 }));
  for (const r of cur) { const s = series[at(r)]; s[sourceGroup(r.source)] += r.n; if (!NEW(r)) s.answered += r.n; }
  const sources = SOURCE_GROUPS.map(([key, name, color]) => ({ key, name, color, value: sum(cur, r => sourceGroup(r.source) === key) })).filter(s => s.value).sort((a, b) => b.value - a.value);
  const phone = sum(cur, r => r.phone), won = sum(cur, WON);
  const funnel = [["Jami so‘rovlar", total], ["Javob berildi", answered], ["Telefon olindi", phone], ["Muvaffaqiyatli", won]].map(([name, value], i, all) => ({ name: name as string, value: value as number, pct: i ? Math.min(100, pct(value as number, all[i - 1][1] as number)) : 100 }));
  // shortcut: stages are the spec's independent counts (a NEW lead can already have a phone), so % is capped at 100.
  const byProduct = new Map<string, { name: string; price: number | null; value: number }>();
  for (const r of cur) { const p = byProduct.get(r.product) ?? { name: r.product, price: r.price, value: 0 }; p.value += r.n; p.price ??= r.price; byProduct.set(r.product, p); }
  const ranked = [...byProduct.values()].sort((a, b) => b.value - a.value), rest = ranked.slice(6).reduce((s, p) => s + p.value, 0);
  const products = [...ranked.slice(0, 6).map(p => ({ name: p.name, price: priceText(p.price), value: p.value })), ...(rest ? [{ name: "Boshqalar", price: "", value: rest }] : [])];
  // Heatmap: Monday-first weekday × hours 08–21 (each cell is one hour, the last ends at 22:00).
  const heat = WEEKDAYS.map(() => Array(HEAT_TO - HEAT_FROM).fill(0) as number[]);
  for (const r of cur) { const d = local(r.at), h = d.getUTCHours(); if (h >= HEAT_FROM && h < HEAT_TO) heat[(d.getUTCDay() + 6) % 7][h - HEAT_FROM] += r.n; }
  let peak = { day: 0, hour: 0, value: 0 };
  heat.forEach((row, day) => row.forEach((value, hour) => { if (value > peak.value) peak = { day, hour, value }; }));
  const peakText = peak.value ? `${WEEKDAYS[peak.day]} ${String(HEAT_FROM + peak.hour).padStart(2, "0")}:00–${String(HEAT_FROM + peak.hour + 1).padStart(2, "0")}:00` : "";
  return { total, answered, answeredPct: pct(answered, total), kpis, series, sources, funnel, products, heat, peakText };
}
export type LeadStats = ReturnType<typeof buildLeadStats>;

/** "18 daq", "3 soat", "Kecha", else the Tashkent date. */
export function ago(iso: string, now = new Date()) {
  const at = new Date(iso), min = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  if (min < 60) return `${min || 1} daq`;
  if (at >= dayStart(now)) return `${Math.floor(min / 60)} soat`;
  if (at >= new Date(dayStart(now).getTime() - DAY)) return "Kecha";
  const d = local(at);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].toLowerCase()}`;
}
