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
const AIRE_WINTER_KW: Record<number, number> = { 3: 6.6, 6: 12.5, 8: 15.8, 12: 23.7 };
/** "Aire 12 HP · 35 kW — $4 100" → model group "Aire 12 HP · 23.7 kW" (old nominal-kW leads too), text without the price, price once. */
export function productLine(text: string, price: number | null) {
  const own = text.match(/\$\s?\d[\d ]*/)?.[0].trim(), bare = text.replace(/\s*[—–-]?\s*\$\s?\d.*$/, "").trim();
  const hp = Number(bare.match(/(\d+(?:[.,]\d+)?)\s*HP/i)?.[1].replace(",", ".")), aire = /aire/i.test(bare);
  const group = /katta loyiha/i.test(bare) || (aire && hp > 12) ? "Katta loyiha" : aire && AIRE_WINTER_KW[hp] ? `Aire ${hp} HP · ${AIRE_WINTER_KW[hp]} kW` : bare;
  return { bare, group, price: group === "Katta loyiha" ? "narxsiz" : price ? priceText(price) : own ?? "narxsiz" };
}

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
  const rate = before ? Math.abs(Math.round(diff / before * 100)) : Infinity;
  return { text: `${diff < 0 ? "▼" : "▲"} ${rate <= 300 ? `${rate}%` : `${diff < 0 ? "−" : "+"}${Math.abs(diff)} ta`} ${suffix}`, down: diff < 0 };
}

export function buildLeadStats(rows: LeadStatRow[], period: LeadPeriod) {
  const inPeriod = (r: LeadStatRow) => r.at >= period.from && r.at < period.to;
  const cur = rows.filter(inPeriod), prev = rows.filter(r => r.at >= period.prevFrom && r.at < period.from);
  const sum = (list: LeadStatRow[], test: (r: LeadStatRow) => boolean = () => true) => list.reduce((s, r) => s + (test(r) ? r.n : 0), 0);
  const span = period.to.getTime() - period.from.getTime();
  const spark = (test: (r: LeadStatRow) => boolean) => { const v: number[] = Array(7).fill(0); for (const r of cur) if (test(r)) v[Math.min(6, Math.floor((r.at.getTime() - period.from.getTime()) * 7 / span))] += r.n; return v; };
  const total = sum(cur), answered = total - sum(cur, NEW);
  const todayTest = (r: LeadStatRow) => r.at >= period.today, yesterday = new Date(period.today.getTime() - DAY);
  const todayHours = Array.from({ length: HEAT_TO - HEAT_FROM }, (_, h) => sum(rows, r => todayTest(r) && local(r.at).getUTCHours() === HEAT_FROM + h));
  const todayCount = sum(rows, todayTest), yesterdayCount = sum(rows, r => r.at >= yesterday && r.at < period.today);
  const kpis = [
    { key: "total", name: "Davrdagi so‘rovlar", color: "#22d3ee", value: total, spark: spark(() => true), change: change(total, sum(prev), "o‘tgan davrga") },
    { key: "today", name: "Bugungi", color: "#8b5cf6", value: todayCount, spark: todayHours, change: change(todayCount, yesterdayCount, "kechagiga") },
    { key: "contacted", name: "Bog‘lanildi", color: "#fbbf24", value: sum(cur, CONTACTED), spark: spark(CONTACTED), change: change(sum(cur, CONTACTED), sum(prev, CONTACTED), "o‘tgan davrga") },
    { key: "won", name: "Muvaffaqiyatli", color: "#34d399", value: sum(cur, WON), spark: spark(WON), change: change(sum(cur, WON), sum(prev, WON), "o‘tgan davrga") },
  ];
  // Area: per bucket, per source group, plus the answered (≠ Yangi) line.
  const starts = period.buckets.map(b => b.from.getTime()), at = (r: LeadStatRow) => { let i = starts.length - 1; while (i > 0 && starts[i] > r.at.getTime()) i--; return i; };
  const series = period.buckets.map(b => ({ label: b.label, instagram: 0, site: 0, other: 0, answered: 0 }));
  for (const r of cur) { const s = series[at(r)]; s[sourceGroup(r.source)] += r.n; if (!NEW(r)) s.answered += r.n; }
  const sources = SOURCE_GROUPS.map(([key, name, color]) => ({ key, name, color, value: sum(cur, r => sourceGroup(r.source) === key) })).filter(s => s.value).sort((a, b) => b.value - a.value);
  const phone = sum(cur, r => r.phone), won = sum(cur, WON);
  const funnel = [["Jami so‘rovlar", total], ["Javob berildi", answered], ["Telefon olindi", phone], ["Muvaffaqiyatli", won]].map(([name, value]) => ({ name: name as string, value: value as number, pct: pct(value as number, total) }));
  const byProduct = new Map<string, { name: string; price: string; value: number }>();
  for (const r of cur) { const line = productLine(r.product, r.price), p = byProduct.get(line.group) ?? { name: line.group, price: line.price, value: 0 }; p.value += r.n; if (p.price === "narxsiz") p.price = line.price; byProduct.set(line.group, p); }
  const ranked = [...byProduct.values()].sort((a, b) => b.value - a.value), rest = ranked.slice(6).reduce((s, p) => s + p.value, 0);
  const products = [...ranked.slice(0, 6), ...(rest ? [{ name: "Boshqalar", price: "", value: rest }] : [])];
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
