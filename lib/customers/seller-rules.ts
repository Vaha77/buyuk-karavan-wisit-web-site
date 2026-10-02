// Regular customers owned by sellers: call reminders, contact results and approved purchases. Pure (no DB), tested.

export const CALL_INTERVALS = [30, 60, 90] as const;
export type CallInterval = (typeof CALL_INTERVALS)[number];

export const CONTACT_RESULTS = {
  CALLED: "Qo‘ng‘iroq qildim",
  NO_ANSWER: "Javob bermadi",
  LATER: "Keyinroq",
  AWAITING_PURCHASE: "Xarid kutilmoqda",
} as const;
export type ContactResult = keyof typeof CONTACT_RESULTS;

export const PURCHASE_STATUS = { PENDING: "Tasdiqlash kutilmoqda", APPROVED: "Tasdiqlangan", REJECTED: "Rad etilgan" } as const;

const DAY = 86_400_000;
const TZ = 5 * 3_600_000; // Asia/Tashkent, no DST

/** Tashkent calendar day number, so "today" and "due" do not depend on the server time zone. */
export function dayNumber(date: Date) { return Math.floor((date.getTime() + TZ) / DAY); }
/** Start of the Tashkent day `days` after `date`, as a UTC instant. */
export function addDays(date: Date, days: number) { return new Date((dayNumber(date) + days) * DAY - TZ); }

type ReminderShape = { callIntervalDays: number; lastPurchaseAt: Date | null; nextContactAt: Date | null; createdAt: Date };

/** Whole days since the last purchase (or since the customer was added, when there is none yet). */
export function daysWithoutPurchase(customer: ReminderShape, today: Date) {
  return Math.max(0, dayNumber(today) - dayNumber(customer.lastPurchaseAt ?? customer.createdAt));
}

/** Due when the call interval since the last purchase has passed, or the agreed next contact date has come. */
export function isDue(customer: ReminderShape, today: Date) {
  const intervalDone = daysWithoutPurchase(customer, today) >= customer.callIntervalDays;
  const contactDue = customer.nextContactAt !== null && dayNumber(customer.nextContactAt) <= dayNumber(today);
  // A future next-contact date postpones the interval reminder ("Keyinroq", "Javob bermadi").
  const postponed = customer.nextContactAt !== null && dayNumber(customer.nextContactAt) > dayNumber(today);
  return contactDue || (intervalDone && !postponed);
}

/** Red: the interval has passed with no purchase; yellow: due only because of an agreed call date. */
export function dueTone(customer: ReminderShape, today: Date): "red" | "yellow" {
  return daysWithoutPurchase(customer, today) >= customer.callIntervalDays ? "red" : "yellow";
}

/** Next contact when the seller does not pick a date. */
export function defaultNextContact(result: ContactResult, today: Date, callIntervalDays: number) {
  const days = result === "NO_ANSWER" ? 1 : result === "LATER" ? 3 : result === "AWAITING_PURCHASE" ? 7 : callIntervalDays;
  return addDays(today, days);
}

type MonthlySale = { amount: number; currency: "USD" | "UZS"; amountUsd: number };
/**
 * An approved purchase is added to the customer's monthly sale of the same month. Same currency: amounts add up;
 * different currencies: the month is kept in USD (amountUsd is always the sum, fixed with the CBU rate at entry).
 */
export function mergeMonthlySale(existing: MonthlySale | null, purchase: MonthlySale): MonthlySale {
  if (!existing) return { ...purchase };
  const amountUsd = round2(existing.amountUsd + purchase.amountUsd);
  if (existing.currency === purchase.currency) return { amount: round2(existing.amount + purchase.amount), currency: existing.currency, amountUsd };
  return { amount: amountUsd, currency: "USD", amountUsd };
}
const round2 = (value: number) => Math.round(value * 100) / 100;

/** USD at the CBU rate (UZS per 1 USD), rounded to cents; null when a UZS amount cannot be converted. */
export function purchaseUsd(amount: number, currency: "USD" | "UZS", uzsPerUsd: number | null) {
  if (currency === "USD") return round2(amount);
  return uzsPerUsd && uzsPerUsd > 0 ? round2(amount / uzsPerUsd) : null;
}

/** Telegram text of the daily reminder; at most 20 names, the rest as a count. */
export function reminderText(customers: Array<{ name: string; phone: string | null; days: number }>) {
  const list = [...customers].sort((a, b) => b.days - a.days);
  const lines = list.slice(0, 20).map((customer, index) => `${index + 1}. ${customer.name}${customer.phone ? ` — ${customer.phone}` : ""} (${customer.days} kun xarid yo‘q)`);
  if (list.length > 20) lines.push(`… va yana ${list.length - 20} ta`);
  return [`📞 Bugun ${list.length} ta mijozingizga qo‘ng‘iroq qiling:`, "", ...lines, "", "Natijani admin panelda “Bugun qo‘ng‘iroq” bo‘limida belgilang."].join("\n");
}
