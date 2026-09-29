import { MONTHS_LONG } from "./format";

// ---- Map colours -----------------------------------------------------------------------------
// Blue vs orange plus lightness; never red/green only.
export type Tone = "top" | "b1" | "b2" | "b3" | "low" | "none";
export const TONE_FILL: Record<Tone, string> = { top: "#123E7C", b1: "#4F7FCC", b2: "#8DB0E4", b3: "#C7D8F1", low: "#E07A2E", none: "#E6EBF2" };
export const TONE_TEXT: Record<Tone, string> = { top: "#FFFFFF", b1: "#FFFFFF", b2: "#0F1E33", b3: "#0F1E33", low: "#2B1200", none: "#5B6B82" };

type Counted = { code: string; count: number };
const ranked = (items: Counted[]) => items.filter(item => item.count > 0).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

/** Uzbekistan: top 3 navy, bottom 3 orange ("e’tibor kerak"), the rest on the blue scale by value, zero grey. */
export function uzbekistanTones(items: Counted[]): Record<string, Tone> {
  const list = ranked(items), tones: Record<string, Tone> = Object.fromEntries(items.map(item => [item.code, "none" as Tone]));
  const top = list.slice(0, 3), rest = list.slice(3), low = rest.slice(-3), middle = rest.slice(0, Math.max(0, rest.length - 3));
  const max = middle[0]?.count || 1;
  top.forEach(item => { tones[item.code] = "top"; });
  low.forEach(item => { tones[item.code] = "low"; });
  middle.forEach(item => { const share = item.count / max; tones[item.code] = share > 0.66 ? "b1" : share > 0.33 ? "b2" : "b3"; });
  return tones;
}

/** A single foreign country: the maximum navy, other regions with leads blue-2, zero grey. */
export function foreignTones(items: Counted[]): Record<string, Tone> {
  const max = Math.max(0, ...items.map(item => item.count));
  return Object.fromEntries(items.map(item => [item.code, item.count === 0 ? "none" : item.count === max ? "top" : "b2"]));
}

/** "Barchasi": countries ranked — 1st navy, 2nd blue-1, last two orange, others blue-2, zero grey. */
export function countryTones(items: Counted[]): Record<string, Tone> {
  const list = ranked(items), tones: Record<string, Tone> = Object.fromEntries(items.map(item => [item.code, "none" as Tone]));
  list.forEach((item, index) => { tones[item.code] = index === 0 ? "top" : list.length > 3 && index >= list.length - 2 ? "low" : index === 1 ? "b1" : "b2"; });
  return tones;
}

export type RankRow = Counted & { rank: number; badge: "TOP" | "PAST" | null; tone: Tone };
/** Ranking panel rows (only areas with leads) and the number of areas without leads. */
export function rankingRows(items: Counted[], tones: Record<string, Tone>) {
  const rows: RankRow[] = ranked(items).map((item, index) => ({ ...item, rank: index + 1, tone: tones[item.code], badge: tones[item.code] === "top" ? "TOP" : tones[item.code] === "low" ? "PAST" : null }));
  return { rows, withoutLeads: items.filter(item => item.count === 0).length };
}

// ---- Funnel ----------------------------------------------------------------------------------
export type FunnelStage = { key: string; label: string; count: number; percent: number };
export function buildFunnel(stages: Array<{ key: string; label: string; count: number }>) {
  const first = stages[0]?.count || 0;
  const rows: FunnelStage[] = stages.map(stage => ({ ...stage, percent: first ? (stage.count / first) * 100 : 0 }));
  let biggest: { from: string; to: string; lost: number } | null = null;
  for (let index = 1; index < rows.length; index++) {
    const lost = rows[index - 1].count - rows[index].count;
    if (lost > 0 && (!biggest || lost > biggest.lost)) biggest = { from: rows[index - 1].label, to: rows[index].label, lost };
  }
  return { rows, biggest };
}

/**
 * Lead → funnel level (documented mapping):
 * 0 Lid keldi — every lead in the period;
 * 1 Bog‘lanildi — status left NEW (REVIEWING, CONTACTED, IN_PROGRESS, COMPLETED, WON, LOST);
 * 2 Hisob-kitob qilindi — status IN_PROGRESS, COMPLETED or WON (the seller is working the request);
 * 3 Tijorat taklifi — a CRM outcome OFFER_SENT, NEGOTIATING or SALE was recorded, or status WON;
 * 4 Sotuv — the lead's sale is APPROVED.
 */
export function funnelLevel(lead: { status: string; hasOffer: boolean; saleApproved: boolean }) {
  if (lead.saleApproved) return 4;
  if (lead.hasOffer || lead.status === "WON") return 3;
  if (["IN_PROGRESS", "COMPLETED"].includes(lead.status)) return 2;
  if (lead.status !== "NEW") return 1;
  return 0;
}

// ---- Deltas ----------------------------------------------------------------------------------
export function delta(current: number, previous: number) {
  if (!previous) return { value: current ? 100 : 0, direction: current ? "up" as const : "flat" as const, relative: false };
  const value = ((current - previous) / previous) * 100;
  return { value: Math.abs(value), direction: value > 0 ? "up" as const : value < 0 ? "down" as const : "flat" as const, relative: true };
}

// ---- Regular customer ranking ----------------------------------------------------------------
export type CustomerYear = { id: string; name: string; regionCode: string | null; months: Array<number | null> };
export type CustomerRankRow = CustomerYear & { place: number; total: number; missing: number[]; status: { text: string; tone: "ok" | "missing" | "gap" } };

/** Months that must already be filled: before the current month in the current year, all 12 in past years. */
export function requiredMonths(year: number, now: { year: number; month: number }) {
  const last = year < now.year ? 12 : year === now.year ? now.month - 1 : 0;
  return Array.from({ length: Math.max(0, last) }, (_, index) => index + 1);
}

export function rankCustomers(customers: CustomerYear[], year: number, now: { year: number; month: number }): CustomerRankRow[] {
  const required = requiredMonths(year, now);
  const rows = customers.map(customer => ({ ...customer, total: customer.months.reduce<number>((sum, value) => sum + (value || 0), 0), missing: required.filter(month => customer.months[month - 1] === null) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const third = rows[2]?.total ?? 0;
  return rows.map((row, index) => {
    const place = index + 1;
    const status = row.missing.length === 1 ? { text: `${MONTHS_LONG[row.missing[0] - 1]} kiritilmagan`, tone: "missing" as const }
      : row.missing.length > 1 ? { text: `${row.missing.length} oy kiritilmagan`, tone: "missing" as const }
      : place === 4 && third > row.total ? { text: `3-o‘ringa $${Math.ceil(third - row.total).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`, tone: "gap" as const }
      : { text: "To‘liq", tone: "ok" as const };
    return { ...row, place, status };
  });
}

/** Rank a customer would have after saving `amountUsd` for `month` (1–12). */
export function previewRank(customers: CustomerYear[], customerId: string, month: number, amountUsd: number) {
  const updated = customers.map(customer => customer.id !== customerId ? customer : { ...customer, months: customer.months.map((value, index) => index === month - 1 ? amountUsd : value) });
  const totals = updated.map(customer => ({ id: customer.id, total: customer.months.reduce<number>((sum, value) => sum + (value || 0), 0) })).sort((a, b) => b.total - a.total);
  const before = customers.map(customer => ({ id: customer.id, total: customer.months.reduce<number>((sum, value) => sum + (value || 0), 0) })).sort((a, b) => b.total - a.total);
  return { rank: totals.findIndex(item => item.id === customerId) + 1, previousRank: before.findIndex(item => item.id === customerId) + 1, total: totals.find(item => item.id === customerId)?.total ?? 0 };
}
