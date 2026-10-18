// "Mening dashboardim" (/admin/my): pure calculations over rows that are already scoped to ONE seller. Tested.
import { WARN_DAYS } from "./seller-map";
import { daysWithoutPurchase } from "./seller-rules";

const round = (value: number) => Math.round(value * 100) / 100;

/** This month's share of the period plan, how far it is done and what is needed per day (today included). */
export function monthPlan(input: { planUsd: number; monthCount: number; doneUsd: number }, today: { year: number; month: number; day: number }) {
  const plan = input.monthCount > 0 ? round(input.planUsd / input.monthCount) : 0;
  const daysInMonth = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate();
  const daysLeft = daysInMonth - today.day + 1, remaining = Math.max(0, round(plan - input.doneUsd));
  return { plan, done: input.doneUsd, percent: plan > 0 ? (input.doneUsd / plan) * 100 : 0, remaining, daysLeft, dailyNeeded: daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining };
}

type Customer = { id: string; name: string; phone: string | null; callIntervalDays: number; lastPurchaseAt: Date | null; nextContactAt: Date | null; createdAt: Date };
/** Active customers without a purchase for 60+ days (never bought = days since added), longest first. */
export function staleCustomers(customers: Customer[], today = new Date()) {
  return customers.map(customer => ({ id: customer.id, name: customer.name, phone: customer.phone, lastPurchaseAt: customer.lastPurchaseAt, days: daysWithoutPurchase(customer, today) }))
    .filter(customer => customer.days >= WARN_DAYS).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
}

/** Approved purchases of this year: average check, biggest purchase, best customer; buyers of this month. */
export function purchaseStats(purchases: Array<{ customerId: string; customerName: string; date: Date; amountUsd: number }>, now: { year: number; month: number }) {
  const year = purchases.filter(row => row.date.getUTCFullYear() === now.year);
  const byCustomer = new Map<string, { name: string; total: number }>();
  for (const row of year) { const item = byCustomer.get(row.customerId) ?? { name: row.customerName, total: 0 }; item.total = round(item.total + row.amountUsd); byCustomer.set(row.customerId, item); }
  const top = [...byCustomer.values()].sort((a, b) => b.total - a.total)[0] ?? null;
  return {
    average: year.length ? round(year.reduce((sum, row) => sum + row.amountUsd, 0) / year.length) : 0,
    biggest: year.length ? Math.max(...year.map(row => row.amountUsd)) : 0,
    top, boughtThisMonth: new Set(year.filter(row => row.date.getUTCMonth() + 1 === now.month).map(row => row.customerId)).size,
  };
}

/** Leads of this month: count, converted (WON or has a sale), sources Instagram / referral link / site. */
export function leadStats(leads: Array<{ source: string; status: string; referralLinkId: string | null; hasSale: boolean }>) {
  const won = leads.filter(lead => lead.status === "WON" || lead.hasSale).length;
  const instagram = leads.filter(lead => lead.source === "INSTAGRAM" || lead.source === "INSTAGRAM_DM").length;
  const referral = leads.filter(lead => lead.referralLinkId && !lead.source.startsWith("INSTAGRAM")).length;
  return { count: leads.length, won, conversion: leads.length ? (won / leads.length) * 100 : 0, sources: { instagram, referral, site: leads.length - instagram - referral } };
}
