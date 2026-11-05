// "Mening foizim": the Super Admin's own kirim / chiqim, USD only (tests/foizim.test.mjs). Touches only MyCommission / ShopShortage and their logs.
import type { Prisma } from "../../generated/prisma/client";
import { MONTHS_LONG, MONTHS_SHORT } from "../dashboard/format";
import { dayKey, startOfDay } from "../dashboard/period";
import { employeeRange } from "../dokon/stats";
import { diffEntry, parseAmount, parseLocalTime, round } from "../kassa/rules";
import { monthStart, nextMonth } from "./month";

export type Kind = "SELLER_COMMISSION" | "OTHER_IN" | "SALARY" | "OTHER_OUT";
export const KINDS: Record<Kind, { direction: "IN" | "OUT"; label: string }> = { SELLER_COMMISSION: { direction: "IN", label: "👤 Sotuvchidan foiz" }, OTHER_IN: { direction: "IN", label: "💼 Boshqa kirim" }, SALARY: { direction: "OUT", label: "👷 Skladchi oyligi" }, OTHER_OUT: { direction: "OUT", label: "🧾 Boshqa" } };
export type CommissionRow = { id: string; direction: "IN" | "OUT"; kind: Kind; sellerId: string | null; storekeeperId: string | null; salaryMonth: string | null; category: string | null; fromName: string; amount: number; base: number | null; percent: number | null; note: string | null; occurredAt: Date };
type Range = { from?: Date; to?: Date };

/** ?p=bugun|oy|otgan|yil|davr (default oy) as [from, to) on Tashkent days; "otgan" = last calendar month. */
export function commissionRange(params: { p?: string; from?: string; to?: string }, now = new Date()): Range {
  if (params.p === "bugun") { const from = startOfDay(now); return { from, to: new Date(from.getTime() + 86_400_000) }; }
  if (params.p === "otgan") { const to = monthStart(dayKey(now).slice(0, 7)); return { from: monthStart(dayKey(new Date(to.getTime() - 1)).slice(0, 7)), to }; }
  return employeeRange({ ...params, p: ["yil", "davr"].includes(params.p ?? "") ? params.p : "oy" }, now);
}

/** The range as one whole calendar month ("2026-10"), else null: such a range shows its "Oy yakuni". */
export function wholeMonth({ from, to }: Range) {
  if (!from || !to) return null;
  const key = dayKey(from).slice(0, 7);
  return from.getTime() === monthStart(key).getTime() && to.getTime() === monthStart(nextMonth(key)).getTime() ? key : null;
}

export const inRange = (row: { occurredAt: Date }, { from, to }: Range) => (!from || row.occurredAt >= from) && (!to || row.occurredAt < to);
export const sumOf = (rows: Array<{ amount: number }>) => round(rows.reduce((sum, row) => sum + row.amount, 0));
/** "Foizdan hisoblash": sale × percent / 100, to the cent. */
export const percentOf = (base: number, percent: number) => round(base * percent / 100);
/** "5% × $18 000" under the note. */
export const percentText = (row: Pick<CommissionRow, "base" | "percent">) => row.base != null && row.percent != null ? `${row.percent}% × $${row.base.toLocaleString("en-US").replace(/,/g, " ")}` : "";

/** "Kimdan": names by sum, biggest first; past the top 10 one "Boshqalar" row. */
export function byFrom(rows: CommissionRow[], top = 10) {
  const sums = new Map<string, number>();
  for (const row of rows) sums.set(row.fromName, (sums.get(row.fromName) ?? 0) + row.amount);
  const sorted = [...sums].sort((a, b) => b[1] - a[1]).map(([name, sum]) => ({ name, sum: round(sum) }));
  const rest = sumOf(sorted.slice(top).map(item => ({ amount: item.sum })));
  return [...sorted.slice(0, top), ...(sorted.length > top ? [{ name: "Boshqalar", sum: rest }] : [])];
}

/** "Grafiklar": the Tashkent year by month (Yan–Dek) with the running total up to this month, plus the four cards and the year's donut. */
export function yearStats(rows: CommissionRow[], now = new Date()) {
  const today = dayKey(now), year = today.slice(0, 4), current = Number(today.slice(5, 7)) - 1, sums = Array<number>(12).fill(0);
  for (const row of rows) { const day = dayKey(row.occurredAt); if (day.startsWith(year)) sums[Number(day.slice(5, 7)) - 1] += row.amount; }
  let running = 0;
  const months = sums.map((sum, index) => ({ label: MONTHS_SHORT[index][0].toUpperCase() + MONTHS_SHORT[index].slice(1), full: `${MONTHS_LONG[index]} ${year}`, sum: round(sum), cum: index <= current ? running = round(running + sum) : null, current: index === current }));
  const best = months.reduce((top, month) => month.sum > top.sum ? month : top, months[0]), total = running;
  const top = byFrom(rows.filter(row => dayKey(row.occurredAt).startsWith(year)), 4);
  return { year, months, total, month: months[current].sum, average: round(total / (current + 1)), best: best.sum ? best : null, top, parts: top.map(item => ({ name: item.name, value: item.sum, pct: total ? Math.round(item.sum / total * 100) : 0 })).filter(part => part.pct > 0) };
}

/** Hints (names, categories): the most used first. */
export function fromSuggestions(rows: Array<{ fromName: string }>, limit = 8) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.fromName, (counts.get(row.fromName) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => name);
}

/** Newest row's value per person (rows newest first): "odatda 5%", "oxirgi $400". */
export function lastBy(rows: CommissionRow[], key: "sellerId" | "storekeeperId", value: (row: CommissionRow) => number | null) {
  const found: Record<string, number> = {};
  for (const row of rows) { const id = row[key], got = value(row); if (id && got != null && !(id in found)) found[id] = got; }
  return found;
}

/** "Bu oy Ravshanga oylik yozilgan": warns only, never blocks. */
export const salaryTaken = (rows: CommissionRow[], storekeeperId: string, month: string, exceptId = "") => rows.some(row => row.kind === "SALARY" && row.storekeeperId === storekeeperId && row.salaryMonth === month && row.id !== exceptId);

/** Sotuv rejasi "Mening foizim — sotuvchilar bo‘yicha": SELLER_COMMISSION rows only; % = olingan / savdo. */
export function sellerCommissions(rows: CommissionRow[], sellers: Array<{ id: string; name: string }>, range: Range) {
  const of = rows.filter(row => row.kind === "SELLER_COMMISSION" && inRange(row, range)), pct = (amount: number, base: number) => base ? round(amount / base * 100) : null;
  const list = sellers.map(seller => {
    const mine = of.filter(row => row.sellerId === seller.id), base = round(mine.reduce((sum, row) => sum + (row.base ?? 0), 0)), amount = sumOf(mine);
    return { ...seller, base, amount, pct: pct(amount, base) };
  }).sort((a, b) => b.amount - a.amount);
  const base = round(list.reduce((sum, item) => sum + item.base, 0)), amount = round(list.reduce((sum, item) => sum + item.amount, 0));
  return { list, total: { base, amount, pct: pct(amount, base) } };
}

const validAmount = (amount: number) => Number.isFinite(amount) && amount > 0 && amount < 1e15 && round(amount) === amount;

/** The form: the saved amount is always the typed "Summa" (the percent only pre-fills it). A seller's / storekeeper's name is set in saveCommission. */
export function parseCommission(form: Record<string, unknown>) {
  const kind = (Object.keys(KINDS) as Kind[]).find(item => item === (form.kind ?? "OTHER_IN"));
  if (!kind) return { ok: false as const, error: "So‘rov noto‘g‘ri." };
  const text = (key: string) => String(form[key] ?? "").trim(), direction = KINDS[kind].direction;
  const sellerId = kind === "SELLER_COMMISSION" ? text("sellerId") : "", storekeeperId = kind === "SALARY" ? text("storekeeperId") : "";
  const salaryMonth = kind === "SALARY" ? text("salaryMonth") : "", category = kind === "OTHER_OUT" ? text("category").slice(0, 60) : "";
  if (kind === "SELLER_COMMISSION" && !sellerId) return { ok: false as const, error: "Sotuvchini tanlang." };
  if (kind === "SALARY" && !storekeeperId) return { ok: false as const, error: "Skladchini tanlang." };
  if (kind === "SALARY" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(salaryMonth)) return { ok: false as const, error: "Oyni tanlang." };
  if (kind === "OTHER_OUT" && !category) return { ok: false as const, error: "Nimaga ketganini tanlang." };
  const fromName = kind === "OTHER_OUT" ? category : kind === "OTHER_IN" ? text("fromName") : "—", amountUsd = parseAmount(form.amount), occurredAt = parseLocalTime(form.occurredAt), note = text("note");
  if (!fromName) return { ok: false as const, error: "Kimdanligini yozing." };
  if (fromName.length > 100) return { ok: false as const, error: "Ism 100 belgidan oshmasin." };
  if (!validAmount(amountUsd)) return { ok: false as const, error: "Summani to‘g‘ri kiriting." };
  if (Number.isNaN(occurredAt.getTime())) return { ok: false as const, error: "Sanani to‘g‘ri kiriting." };
  if (note.length > 300) return { ok: false as const, error: "Izoh 300 belgidan oshmasin." };
  let baseAmountUsd: number | null = null, percent: number | null = null;
  if (form.calc === "on" && direction === "IN") {
    baseAmountUsd = parseAmount(form.base); percent = parseAmount(form.percent);
    if (!validAmount(baseAmountUsd)) return { ok: false as const, error: "Savdo summasini to‘g‘ri kiriting." };
    if (!(percent > 0 && percent <= 100 && Math.round(percent * 1000) === percent * 1000)) return { ok: false as const, error: "Foizni to‘g‘ri kiriting (0–100)." };
  }
  return { ok: true as const, data: { direction, kind, sellerId: sellerId || null, storekeeperId: storekeeperId || null, salaryMonth: salaryMonth || null, category: category || null, fromName, amountUsd, baseAmountUsd, percent, note: note || null, occurredAt } };
}

type Tables = Pick<Prisma.TransactionClient, "myCommission" | "myCommissionLog" | "shopShortage" | "shopShortageLog">;
type Db = Tables & Pick<Prisma.TransactionClient, "adminUser"> & { $transaction: <T>(run: (tx: Tables) => Promise<T>) => Promise<T> };
type Result = { ok: true } | { ok: false; error: string };
const plain = (row: { amountUsd: unknown; baseAmountUsd: unknown; percent: unknown }) => ({ ...row, amountUsd: Number(row.amountUsd), baseAmountUsd: row.baseAmountUsd == null ? null : Number(row.baseAmountUsd), percent: row.percent == null ? null : Number(row.percent) });

/** New row or a correction; each action writes one log row (a repeated save writes none). */
export async function saveCommission(db: Db, userId: string, form: Record<string, unknown>): Promise<Result> {
  const parsed = parseCommission(form);
  if (!parsed.ok) return parsed;
  const id = String(form.id ?? ""), data = parsed.data, personId = data.sellerId ?? data.storekeeperId;
  // The picked user must really be a SELLER / STOREKEEPER; their name is what the list shows.
  if (personId) {
    const person = await db.adminUser.findFirst({ where: { id: personId, role: data.sellerId ? "SELLER" : "STOREKEEPER" }, select: { name: true } });
    if (!person) return { ok: false, error: data.sellerId ? "Sotuvchi topilmadi." : "Skladchi topilmadi." };
    data.fromName = person.name;
  }
  if (!id) return db.$transaction(async tx => {
    const row = await tx.myCommission.create({ data: { ...data, createdById: userId } });
    await tx.myCommissionLog.create({ data: { entryId: row.id, userId, changes: diffEntry({}, data) } });
    return { ok: true as const };
  });
  const row = await db.myCommission.findFirst({ where: { id, deletedAt: null } });
  if (!row) return { ok: false, error: "Yozuv topilmadi." };
  const changes = diffEntry(plain(row), data);
  if (Object.keys(changes).length) await db.$transaction(async tx => {
    await tx.myCommission.update({ where: { id }, data });
    await tx.myCommissionLog.create({ data: { entryId: id, userId, changes } });
  });
  return { ok: true };
}

export async function deleteCommission(db: Db, userId: string, id: string, reason: string): Promise<Result> {
  const at = new Date(), deleteReason = String(reason ?? "").trim().slice(0, 200) || null;
  const done = await db.$transaction(async tx => {
    const { count } = await tx.myCommission.updateMany({ where: { id: String(id), deletedAt: null }, data: { deletedAt: at, deletedById: userId, deleteReason } });
    if (count) await tx.myCommissionLog.create({ data: { entryId: String(id), userId, changes: { deletedAt: [null, at.toISOString()], deleteReason: [null, deleteReason] } } });
    return count === 1;
  });
  return done ? { ok: true } : { ok: false, error: "Yozuv topilmadi." };
}

export async function restoreCommission(db: Db, userId: string, id: string): Promise<Result> {
  const row = await db.myCommission.findFirst({ where: { id: String(id), deletedAt: { not: null } } });
  if (!row?.deletedAt) return { ok: false, error: "Yozuv topilmadi." };
  const deletedAt = row.deletedAt;
  await db.$transaction(async tx => {
    await tx.myCommission.update({ where: { id: row.id }, data: { deletedAt: null, deletedById: null, deleteReason: null } });
    await tx.myCommissionLog.create({ data: { entryId: row.id, userId, changes: { deletedAt: [deletedAt.toISOString(), null], deleteReason: [row.deleteReason, null] } } });
  });
  return { ok: true };
}

/** "＋ Kamomat qo‘shish": OPENING / ADD above 0; an ADJUST may be minus (never 0). */
export function parseShortage(form: Record<string, unknown>) {
  const type = (["OPENING", "ADD", "ADJUST"] as const).find(item => item === form.type), raw = String(form.amount ?? "").trim(), minus = /^[-−]/.test(raw), amount = parseAmount(raw.replace(/^[-−]/, ""));
  const note = String(form.note ?? "").trim(), occurredAt = parseLocalTime(form.occurredAt);
  if (!type) return { ok: false as const, error: "So‘rov noto‘g‘ri." };
  if (!validAmount(amount) || (minus && type !== "ADJUST")) return { ok: false as const, error: "Summani to‘g‘ri kiriting." };
  if (!note) return { ok: false as const, error: "Nima kam chiqqanini yozing." };
  if (note.length > 300) return { ok: false as const, error: "Izoh 300 belgidan oshmasin." };
  if (Number.isNaN(occurredAt.getTime())) return { ok: false as const, error: "Sanani to‘g‘ri kiriting." };
  return { ok: true as const, data: { type, amountUsd: minus ? -amount : amount, note, occurredAt } };
}

export async function saveShortage(db: Db, userId: string, form: Record<string, unknown>): Promise<Result> {
  const parsed = parseShortage(form);
  if (!parsed.ok) return parsed;
  const id = String(form.id ?? ""), data = parsed.data;
  if (!id) return db.$transaction(async tx => {
    const row = await tx.shopShortage.create({ data: { ...data, createdById: userId } });
    await tx.shopShortageLog.create({ data: { entryId: row.id, userId, changes: diffEntry({}, data) } });
    return { ok: true as const };
  });
  const row = await db.shopShortage.findFirst({ where: { id, deletedAt: null } });
  if (!row) return { ok: false, error: "Yozuv topilmadi." };
  const changes = diffEntry({ ...row, amountUsd: Number(row.amountUsd) }, data);
  if (Object.keys(changes).length) await db.$transaction(async tx => {
    await tx.shopShortage.update({ where: { id }, data });
    await tx.shopShortageLog.create({ data: { entryId: id, userId, changes } });
  });
  return { ok: true };
}

export async function deleteShortage(db: Db, userId: string, id: string, reason: string): Promise<Result> {
  const at = new Date(), deleteReason = String(reason ?? "").trim().slice(0, 200) || null;
  const done = await db.$transaction(async tx => {
    const { count } = await tx.shopShortage.updateMany({ where: { id: String(id), deletedAt: null }, data: { deletedAt: at, deletedById: userId, deleteReason } });
    if (count) await tx.shopShortageLog.create({ data: { entryId: String(id), userId, changes: { deletedAt: [null, at.toISOString()], deleteReason: [null, deleteReason] } } });
    return count === 1;
  });
  return done ? { ok: true } : { ok: false, error: "Yozuv topilmadi." };
}

/** The page's one undo toast: the id is a kirim/chiqim row or a kamomat row. */
export async function restoreAny(db: Db, userId: string, id: string): Promise<Result> {
  if ((await restoreCommission(db, userId, id)).ok) return { ok: true };
  const row = await db.shopShortage.findFirst({ where: { id: String(id), deletedAt: { not: null } } });
  if (!row?.deletedAt) return { ok: false, error: "Yozuv topilmadi." };
  const deletedAt = row.deletedAt;
  await db.$transaction(async tx => {
    await tx.shopShortage.update({ where: { id: row.id }, data: { deletedAt: null, deletedById: null, deleteReason: null } });
    await tx.shopShortageLog.create({ data: { entryId: row.id, userId, changes: { deletedAt: [deletedAt.toISOString(), null], deleteReason: [row.deleteReason, null] } } });
  });
  return { ok: true };
}
