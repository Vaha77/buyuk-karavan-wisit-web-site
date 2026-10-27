// Kassa rules, pure (tests/kassa.test.mjs). A day is the Tashkent calendar day; USD and UZS never mix.
import { dayKey } from "../dashboard/period";

export type Currency = "USD" | "UZS";
export type EntryType = "IN" | "OUT";
export type Payment = "CASH" | "CARD" | "BANK";
export type Sums = Record<Currency, number>;
export type LedgerRow = { type: EntryType; currency: Currency; amount: number; occurredAt: Date };
export type DayTotals = { start: number; in: number; out: number; end: number };
export type LedgerDay = { day: string } & Record<Currency, DayTotals>;

export const CURRENCIES: Currency[] = ["USD", "UZS"];
export const PAYMENTS: Record<Payment, string> = { CASH: "💵 Naqd", CARD: "💳 Karta / Click", BANK: "🏦 Bank" };
const DAY = 86_400_000;
const round = (value: number) => Math.round(value * 100) / 100;

/** "$ 1 200", "−450 000 so‘m"; `sign` adds + for positive amounts. */
export function money(value: number, currency: Currency, sign = false) {
  const digits = Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 }).replace(/,/g, " ");
  const prefix = value < 0 ? "−" : sign && value > 0 ? "+" : "";
  return currency === "USD" ? `${prefix}$ ${digits}` : `${prefix}${digits} so‘m`;
}

export const addDays = (day: string, days: number) => dayKey(new Date(new Date(`${day}T00:00:00+05:00`).getTime() + days * DAY));

/** Every Tashkent day in [fromDay, toDay]: start = `carry` (opening + all entries before fromDay) + earlier days of the range. */
export function ledger(carry: Sums, rows: LedgerRow[], fromDay: string, toDay: string): LedgerDay[] {
  const flows = new Map<string, Record<Currency, { in: number; out: number }>>();
  for (const row of rows) {
    const day = dayKey(row.occurredAt);
    if (!flows.has(day)) flows.set(day, { USD: { in: 0, out: 0 }, UZS: { in: 0, out: 0 } });
    flows.get(day)![row.currency][row.type === "IN" ? "in" : "out"] += row.amount;
  }
  const days: LedgerDay[] = [], balance = { ...carry };
  for (let day = fromDay; day <= toDay; day = addDays(day, 1)) {
    const item = { day } as LedgerDay;
    for (const currency of CURRENCIES) {
      const flow = flows.get(day)?.[currency] ?? { in: 0, out: 0 }, start = balance[currency];
      balance[currency] = round(start + flow.in - flow.out);
      item[currency] = { start: round(start), in: round(flow.in), out: round(flow.out), end: balance[currency] };
    }
    days.push(item);
  }
  return days;
}

/** Kun boshi · kirim · chiqim · kun oxiri of one currency over the given days. */
export function totals(days: LedgerDay[], currency: Currency): DayTotals {
  return { start: days[0][currency].start, in: round(days.reduce((sum, day) => sum + day[currency].in, 0)), out: round(days.reduce((sum, day) => sum + day[currency].out, 0)), end: days[days.length - 1][currency].end };
}

/** Opening balance plus the net of grouped sums ({ type, currency, sum }) of every entry before the range. */
export function carryFrom(opening: Sums, groups: Array<{ type: EntryType; currency: Currency; sum: number }>): Sums {
  const carry = { ...opening };
  for (const group of groups) carry[group.currency] += group.type === "IN" ? group.sum : -group.sum;
  return carry;
}

export type EntryInput = { type: EntryType; amount: number; currency: Currency; categoryId: string; paymentType: Payment; note: string; occurredAt: Date };
const pick = <T extends string>(value: unknown, allowed: readonly T[]) => (allowed as readonly unknown[]).includes(value) ? value as T : null;

/** Form fields → entry; `occurredAt` is a datetime-local value in Tashkent time ("2026-10-27T14:20"). */
export function parseEntry(form: Record<string, unknown>): { ok: true; data: EntryInput } | { ok: false; error: string } {
  const type = pick(form.type, ["IN", "OUT"] as const), currency = pick(form.currency, CURRENCIES), paymentType = pick(form.paymentType, ["CASH", "CARD", "BANK"] as const);
  const amount = Number(String(form.amount ?? "").replace(/[\s ]/g, "").replace(",", "."));
  const note = String(form.note ?? "").trim(), categoryId = String(form.categoryId ?? "");
  const when = String(form.occurredAt ?? ""), occurredAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when) ? new Date(`${when}:00+05:00`) : new Date(NaN);
  if (!type || !currency || !paymentType) return { ok: false, error: "So‘rov noto‘g‘ri." };
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e15 || round(amount) !== amount) return { ok: false, error: "Summani to‘g‘ri kiriting." };
  if (!categoryId || categoryId.length > 40) return { ok: false, error: "Kategoriyani tanlang." };
  if (!note) return { ok: false, error: "Izoh yozing." };
  if (note.length > 300) return { ok: false, error: "Izoh 300 belgidan oshmasin." };
  if (Number.isNaN(occurredAt.getTime())) return { ok: false, error: "Sanani to‘g‘ri kiriting." };
  return { ok: true, data: { type, amount, currency, categoryId, paymentType, note, occurredAt } };
}

/** Correction log: only the fields that changed, { field: [old, new] } (dates as ISO strings). */
export function diffEntry(before: Record<string, unknown>, after: Record<string, unknown>) {
  const text = (value: unknown) => value instanceof Date ? value.toISOString() : value == null ? null : String(value);
  const changes: Record<string, [string | null, string | null]> = {};
  for (const key of Object.keys(after)) if (text(before[key]) !== text(after[key])) changes[key] = [text(before[key]), text(after[key])];
  return changes;
}

export type NoteHint = { note: string; amount: number; currency: Currency; categoryId: string; type: EntryType };
/** Earlier notes containing the typed text (newest first, one per note) for the same entry type. */
export function suggestNotes(history: NoteHint[], text: string, type: EntryType, limit = 5) {
  const query = text.trim().toLocaleLowerCase();
  if (query.length < 2) return [];
  const seen = new Set<string>();
  return history.filter(hint => {
    const key = hint.note.toLocaleLowerCase();
    if (hint.type !== type || seen.has(key) || !key.includes(query) || key === query) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export const LOG_ACTIONS = { CREATED: "Qo‘shildi", EDITED: "Tuzatildi", DELETED: "O‘chirildi", RESTORED: "Tiklandi", BOT_CONFIRMED: "Botdan tasdiqlandi", BOT_CANCELLED: "Botdan bekor qilindi" } as const;
export type LogAction = keyof typeof LOG_ACTIONS;
/** What a KassaEntryLog row did, read from its changes (creation logs every field as [null, value]; a bot one adds draftId). */
export function logAction(changes: Record<string, [string | null, string | null]>): LogAction {
  if (changes.draftId) return "BOT_CONFIRMED";
  if (changes.deletedAt) return changes.deletedAt[0] ? "RESTORED" : "DELETED";
  return changes.type?.[0] === null && changes.amount?.[0] === null ? "CREATED" : "EDITED";
}
