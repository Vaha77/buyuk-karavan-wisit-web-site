import "server-only";

import { z } from "zod";
import type { AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit/service";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { isCountryCode, isRegionOf } from "@/lib/dashboard/regions";
import { expireDashboard } from "@/lib/referrals/tracking";

export class CustomerError extends Error {}
type Actor = Pick<AdminUser, "id" | "name">;

export const customerInputSchema = z.object({
  name: z.string().trim().min(2, "Mijoz nomini kiriting.").max(120),
  country: z.string().trim().refine(isCountryCode, "Davlatni tanlang."),
  regionCode: z.string().trim().max(16).transform(value => value || null),
  phone: z.string().trim().max(40).transform(value => value || null),
  note: z.string().trim().max(500).transform(value => value || null),
  isActive: z.boolean().default(true),
}).refine(value => !value.regionCode || isRegionOf(value.regionCode, value.country), { message: "Viloyat tanlangan davlatga tegishli emas.", path: ["regionCode"] });
export type CustomerInput = z.input<typeof customerInputSchema>;

export async function saveRegularCustomer(id: string | null, raw: CustomerInput, actor: Actor) {
  const input = customerInputSchema.parse(raw);
  const previous = id ? await getDb().regularCustomer.findUnique({ where: { id } }) : null;
  if (id && !previous) throw new CustomerError("Mijoz topilmadi.");
  const customer = id ? await getDb().regularCustomer.update({ where: { id }, data: input }) : await getDb().regularCustomer.create({ data: input });
  await writeAudit(actor, { action: id ? "UPDATE" : "CREATE", entityType: "REGULAR_CUSTOMER", entityId: customer.id, entityName: customer.name, summary: id ? "Doimiy mijozni tahrirladi" : "Doimiy mijoz qo‘shdi", before: previous ? { name: previous.name, regionCode: previous.regionCode, isActive: previous.isActive } : undefined, after: { name: customer.name, country: customer.country, regionCode: customer.regionCode, isActive: customer.isActive } });
  expireDashboard();
  return customer;
}

/** Deletes the customer and all monthly sales (admin action, confirmed in the UI). The audit keeps a copy of the sales. */
export async function deleteRegularCustomer(id: string, actor: Actor) {
  const db = getDb();
  const customer = await db.regularCustomer.findUnique({ where: { id }, include: { sales: { select: { year: true, month: true, amount: true, currency: true, amountUsd: true } } } });
  if (!customer) throw new CustomerError("Mijoz topilmadi.");
  await db.$transaction([db.regularCustomerMonthlySale.deleteMany({ where: { customerId: id } }), db.regularCustomer.delete({ where: { id } })]);
  await writeAudit(actor, {
    action: "DELETE", entityType: "REGULAR_CUSTOMER", entityId: id, entityName: customer.name,
    summary: `Doimiy mijoz ${customer.name} va uning ${customer.sales.length} ta oylik savdo yozuvi o‘chirildi`,
    before: { name: customer.name, country: customer.country, regionCode: customer.regionCode, phone: customer.phone, isActive: customer.isActive, sales: customer.sales.map(sale => ({ year: sale.year, month: sale.month, amount: sale.amount.toString(), currency: sale.currency, amountUsd: sale.amountUsd.toString() })) },
  });
  expireDashboard();
}

export const monthlySaleSchema = z.object({
  customerId: z.string().trim().min(1, "Mijozni tanlang.").max(40),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.string().trim().refine(value => /^\d+(?:[.,]\d{1,2})?$/.test(value.replace(/\s/g, "")) && Number(value.replace(/\s/g, "").replace(",", ".")) > 0, "Savdo summasini kiriting.").transform(value => value.replace(/\s/g, "").replace(",", ".")),
  currency: z.enum(["USD", "UZS"]),
  note: z.string().trim().max(500).transform(value => value || null),
});
export type MonthlySaleInput = z.input<typeof monthlySaleSchema>;

/** Unique per customer/year/month: saving again overwrites the month. amountUsd is fixed at save time with the CBU rate. */
export async function saveMonthlySale(raw: MonthlySaleInput, actor: Actor) {
  const input = monthlySaleSchema.parse(raw);
  const customer = await getDb().regularCustomer.findUnique({ where: { id: input.customerId }, select: { id: true, name: true } });
  if (!customer) throw new CustomerError("Mijoz topilmadi.");
  let amountUsd = input.amount;
  if (input.currency === "UZS") {
    const rate = await getUsdUzsRate();
    if (!rate || !(Number(rate.rate) > 0)) throw new CustomerError("Markaziy bank kursi olinmadi. Summani USD da kiriting yoki keyinroq urinib ko‘ring.");
    amountUsd = (Number(input.amount) / Number(rate.rate)).toFixed(2);
  }
  const key = { customerId_year_month: { customerId: input.customerId, year: input.year, month: input.month } };
  const previous = await getDb().regularCustomerMonthlySale.findUnique({ where: key });
  const saved = await getDb().regularCustomerMonthlySale.upsert({
    where: key,
    create: { customerId: input.customerId, year: input.year, month: input.month, amount: input.amount, currency: input.currency, amountUsd, note: input.note, createdByAdminId: actor.id },
    update: { amount: input.amount, currency: input.currency, amountUsd, note: input.note, updatedByAdminId: actor.id },
  });
  await writeAudit(actor, { action: previous ? "UPDATE" : "CREATE", entityType: "REGULAR_CUSTOMER_SALE", entityId: saved.id, entityName: customer.name, summary: `${customer.name}: ${input.year}-yil ${input.month}-oy savdosi ${previous ? "yangilandi" : "kiritildi"}`, before: previous ? { amount: previous.amount.toString(), currency: previous.currency, amountUsd: previous.amountUsd.toString() } : undefined, after: { amount: input.amount, currency: input.currency, amountUsd, year: input.year, month: input.month } });
  expireDashboard();
  return saved;
}

export const prizesSchema = z.object({ year: z.number().int().min(2020).max(2100), prizes: z.array(z.object({ place: z.number().int().min(1).max(3), prizeText: z.string().trim().max(200) })).length(3) });
export async function saveRankingPrizes(raw: z.input<typeof prizesSchema>, actor: Actor) {
  const input = prizesSchema.parse(raw);
  for (const prize of input.prizes) {
    if (prize.prizeText) await getDb().rankingPrize.upsert({ where: { year_place: { year: input.year, place: prize.place } }, create: { year: input.year, place: prize.place, prizeText: prize.prizeText }, update: { prizeText: prize.prizeText } });
    else await getDb().rankingPrize.deleteMany({ where: { year: input.year, place: prize.place } });
  }
  await writeAudit(actor, { action: "UPDATE", entityType: "RANKING_PRIZE", entityId: String(input.year), entityName: `${input.year}-yil sovrinlari`, summary: "Doimiy mijozlar reytingi sovrinlarini yangiladi", after: { prizes: input.prizes } });
  expireDashboard();
}

const TIP_KEYS = ["all", "UZ", "KZ", "KG", "TJ", "TM", "AF"] as const;
export const tipsSchema = z.object(Object.fromEntries(TIP_KEYS.map(key => [key, z.string().trim().max(300)])) as Record<(typeof TIP_KEYS)[number], z.ZodString>);
export async function saveDashboardTips(raw: unknown, actor: Actor) {
  const tips = Object.fromEntries(Object.entries(tipsSchema.parse(raw)).filter(([, text]) => text));
  await getDb().siteSettings.upsert({ where: { id: "global" }, create: { id: "global", dashboardTips: tips }, update: { dashboardTips: tips } });
  await writeAudit(actor, { action: "UPDATE", entityType: "SETTINGS", entityId: "dashboardTips", entityName: "Dashboard maslahatlari", summary: "Xarita maslahatlarini yangiladi", after: tips });
  expireDashboard();
}
