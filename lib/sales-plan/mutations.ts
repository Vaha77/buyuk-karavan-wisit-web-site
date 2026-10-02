import "server-only";

import { z } from "zod";
import type { AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit/service";
import { periodMonths } from "./rules";
import { parseThresholds, validateThresholds, type ZoneThresholds } from "./zones";

export class SalesPlanError extends Error {}
type Actor = Pick<AdminUser, "id" | "name">;

const money = (message: string) => z.string().trim().transform(value => value.replace(/[\s,]/g, "")).refine(value => value === "" || (/^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) < 1e15), message);
const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null);

export const personSchema = z.object({
  name: z.string().trim().min(2, "Ismni kiriting.").max(120),
  kind: z.enum(["EMPLOYEE", "BRANCH"]),
  branchHead: optionalText(120),
  note: optionalText(300),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  telegramChatId: z.string().trim().max(32).refine(value => value === "" || /^-?\d{5,20}$/.test(value), "Telegram chat ID faqat raqam (masalan 123456789).").transform(value => value || null).default(""),
  periodId: z.string().trim().max(40).nullable(),
  plan: money("Reja summasini to‘g‘ri kiriting."),
});
export type PersonInput = z.input<typeof personSchema>;

export async function saveSalesPerson(id: string | null, raw: PersonInput, actor: Actor) {
  const input = personSchema.parse(raw);
  const data = { name: input.name, kind: input.kind, branchHead: input.kind === "BRANCH" ? input.branchHead : null, note: input.note, isActive: input.isActive, sortOrder: input.sortOrder, telegramChatId: input.telegramChatId };
  const db = getDb();
  const previous = id ? await db.salesPerson.findUnique({ where: { id } }) : null;
  if (id && !previous) throw new SalesPlanError("Sotuvchi topilmadi.");
  const person = id ? await db.salesPerson.update({ where: { id }, data }) : await db.salesPerson.create({ data });
  if (input.periodId && Number(input.plan) > 0) {
    await db.salesPlan.upsert({ where: { periodId_personId: { periodId: input.periodId, personId: person.id } }, create: { periodId: input.periodId, personId: person.id, planUsd: input.plan }, update: { planUsd: input.plan } });
  }
  await writeAudit(actor, {
    action: id ? "UPDATE" : "CREATE", entityType: "SALES_PERSON", entityId: person.id, entityName: person.name,
    summary: id ? "Sotuv rejasi: sotuvchini tahrirladi" : "Sotuv rejasi: sotuvchi qo‘shdi",
    before: previous ? { name: previous.name, kind: previous.kind, branchHead: previous.branchHead, isActive: previous.isActive } : undefined,
    after: { ...data, plan: input.plan || undefined, periodId: input.periodId },
  });
  return person;
}

/** Deletes the seller with all plans and monthly records (admin action, confirmed in the UI). The audit keeps a copy. */
export async function deleteSalesPerson(id: string, actor: Actor) {
  const db = getDb();
  const person = await db.salesPerson.findUnique({ where: { id }, include: { monthly: { select: { year: true, month: true, amountUsd: true } }, plans: { select: { periodId: true, planUsd: true } } } });
  if (!person) throw new SalesPlanError("Sotuvchi topilmadi.");
  await db.$transaction([db.salesMonthly.deleteMany({ where: { personId: id } }), db.salesPlan.deleteMany({ where: { personId: id } }), db.salesPerson.delete({ where: { id } })]);
  await writeAudit(actor, {
    action: "DELETE", entityType: "SALES_PERSON", entityId: id, entityName: person.name,
    summary: `Sotuv rejasi: ${person.name} va uning ${person.monthly.length} ta oylik yozuvi o‘chirildi`,
    before: { name: person.name, kind: person.kind, branchHead: person.branchHead, plans: person.plans.map(plan => ({ periodId: plan.periodId, planUsd: plan.planUsd.toString() })), monthly: person.monthly.map(row => ({ year: row.year, month: row.month, amountUsd: row.amountUsd.toString() })) },
  });
}

export const periodSchema = z.object({
  name: z.string().trim().min(3, "Davr nomini kiriting.").max(80),
  startYear: z.number().int().min(2020).max(2100),
  startMonth: z.number().int().min(1).max(12),
  monthCount: z.number().int().min(1, "Oylar soni 1–24.").max(24, "Oylar soni 1–24."),
});
export async function createSalesPeriod(raw: z.input<typeof periodSchema>, actor: Actor) {
  const input = periodSchema.parse(raw);
  const exists = await getDb().salesPeriod.findUnique({ where: { startYear_startMonth: { startYear: input.startYear, startMonth: input.startMonth } } });
  if (exists) throw new SalesPlanError(`Bu oydan boshlanadigan davr bor: ${exists.name}.`);
  const period = await getDb().salesPeriod.create({ data: input });
  await writeAudit(actor, { action: "CREATE", entityType: "SALES_PERIOD", entityId: period.id, entityName: period.name, summary: `Sotuv rejasi: yangi davr — ${period.name}`, after: input });
  return period;
}

const plansSchema = z.object({ periodId: z.string().trim().min(1).max(40), plans: z.array(z.object({ personId: z.string().trim().min(1).max(40), plan: money("Reja summasini to‘g‘ri kiriting.") })).max(500) });
/** Bulk plan entry for a period: blank = unchanged, a positive amount = upsert. */
export async function saveSalesPlans(raw: z.input<typeof plansSchema>, actor: Actor) {
  const input = plansSchema.parse(raw);
  const db = getDb();
  const period = await db.salesPeriod.findUnique({ where: { id: input.periodId } });
  if (!period) throw new SalesPlanError("Davr topilmadi.");
  const entries = input.plans.filter(entry => Number(entry.plan) > 0);
  await db.$transaction(entries.map(entry => db.salesPlan.upsert({ where: { periodId_personId: { periodId: period.id, personId: entry.personId } }, create: { periodId: period.id, personId: entry.personId, planUsd: entry.plan }, update: { planUsd: entry.plan } })));
  await writeAudit(actor, { action: "UPDATE", entityType: "SALES_PLAN", entityId: period.id, entityName: period.name, summary: `Sotuv rejasi: ${period.name} rejalari saqlandi (${entries.length} ta)`, after: { plans: entries } });
  return entries.length;
}

/** Copies plans from another period for sellers that have no plan in this one yet (existing plans are kept). */
export async function copySalesPlans(periodId: string, fromPeriodId: string, actor: Actor) {
  const db = getDb();
  const [period, source] = await Promise.all([db.salesPeriod.findUnique({ where: { id: periodId } }), db.salesPeriod.findUnique({ where: { id: fromPeriodId }, include: { plans: { select: { personId: true, planUsd: true } } } })]);
  if (!period || !source || period.id === source.id) throw new SalesPlanError("Davr topilmadi.");
  const result = await db.salesPlan.createMany({ data: source.plans.map(plan => ({ periodId: period.id, personId: plan.personId, planUsd: plan.planUsd })), skipDuplicates: true });
  await writeAudit(actor, { action: "CREATE", entityType: "SALES_PLAN", entityId: period.id, entityName: period.name, summary: `Sotuv rejasi: ${source.name} rejalaridan nusxa olindi (${result.count} ta)`, metadata: { fromPeriodId: source.id } });
  return result.count;
}

const monthlySchema = z.object({
  year: z.number().int().min(2020).max(2100), month: z.number().int().min(1).max(12),
  entries: z.array(z.object({ personId: z.string().trim().min(1).max(40), amount: money("Summani to‘g‘ri kiriting.") })).max(500),
  clear: z.array(z.string().trim().min(1).max(40)).max(500),
});
/** Monthly entry for all sellers: amounts are upserted, blank stays "not entered"; `clear` removes records the admin confirmed to delete. */
export async function saveSalesMonthly(raw: z.input<typeof monthlySchema>, actor: Actor) {
  const input = monthlySchema.parse(raw);
  const db = getDb();
  const inPeriod = (await db.salesPeriod.findMany({ select: { startYear: true, startMonth: true, monthCount: true } })).some(period => periodMonths(period).some(item => item.year === input.year && item.month === input.month));
  if (!inPeriod) throw new SalesPlanError("Bu oy hech qaysi davrga kirmaydi.");
  const entries = input.entries.filter(entry => entry.amount !== "");
  const key = (personId: string) => ({ personId_year_month: { personId, year: input.year, month: input.month } });
  const previous = await db.salesMonthly.findMany({ where: { year: input.year, month: input.month, personId: { in: [...entries.map(entry => entry.personId), ...input.clear] } }, select: { personId: true, amountUsd: true } });
  await db.$transaction([
    ...entries.map(entry => db.salesMonthly.upsert({ where: key(entry.personId), create: { personId: entry.personId, year: input.year, month: input.month, amountUsd: entry.amount }, update: { amountUsd: entry.amount } })),
    db.salesMonthly.deleteMany({ where: { year: input.year, month: input.month, personId: { in: input.clear } } }),
  ]);
  await writeAudit(actor, {
    action: "UPDATE", entityType: "SALES_MONTHLY", entityId: `${input.year}-${String(input.month).padStart(2, "0")}`, entityName: `${input.year}-yil ${input.month}-oy`,
    summary: `Sotuv rejasi: ${input.year}-yil ${input.month}-oy savdolari saqlandi (${entries.length} ta${input.clear.length ? `, ${input.clear.length} ta o‘chirildi` : ""})`,
    before: { rows: previous.map(row => ({ personId: row.personId, amountUsd: row.amountUsd.toString() })) }, after: { rows: entries, cleared: input.clear },
  });
  return entries.length;
}

/** Sozlamalar: zone thresholds (validated: whole percents 0–200, strictly increasing). */
export async function saveZoneThresholds(raw: unknown, actor: Actor) {
  const error = validateThresholds(raw);
  if (error) throw new SalesPlanError(error);
  const value = raw as ZoneThresholds;
  const thresholds = { record: value.record, excellent: value.excellent, good: value.good, fair: value.fair, warning: value.warning };
  const db = getDb();
  const previous = await db.siteSettings.findUnique({ where: { id: "global" }, select: { salesPlanZones: true } });
  await db.siteSettings.upsert({ where: { id: "global" }, create: { id: "global", salesPlanZones: thresholds }, update: { salesPlanZones: thresholds } });
  await writeAudit(actor, { action: "UPDATE", entityType: "SETTINGS", entityId: "salesPlanZones", entityName: "Sotuv rejasi zonalari", summary: "Sotuv rejasi zona chegaralarini yangiladi", before: parseThresholds(previous?.salesPlanZones), after: thresholds });
}
