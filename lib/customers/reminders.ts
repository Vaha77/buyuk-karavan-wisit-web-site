import "server-only";

import { getDb } from "@/lib/db";
import { sendMessage, telegramErrorDetails } from "@/lib/telegram/client";
import { dueCustomers, sellerPurchasesBetween } from "./seller-repo";
import { daysWithoutPurchase, reminderText, weeklySummaryText } from "./seller-rules";
import { myDashboardCore } from "./seller-queries";
import { getPlanBoardData, getSalesPeriods, pickPeriod } from "@/lib/sales-plan/queries";
import { sellerRanking } from "@/lib/sales-plan/seller-ranking";
import { tashkentYearMonth } from "@/lib/dashboard/period";

/** Daily 09:00 (Tashkent) reminder: each seller with a Telegram chat gets their own due customers; others are skipped. */
export async function sendSellerReminders(today = new Date()) {
  const db = getDb();
  const sellers = await chattableSellers();
  let sent = 0, skipped = 0, failed = 0;
  for (const seller of sellers) {
    // Same scoped query as the seller's "Bugun qo‘ng‘iroq" page.
    const due = await dueCustomers(db, { role: "SELLER", salesPersonId: seller.id }, today);
    if (!due.length) { skipped++; continue; }
    const text = reminderText(due.map(customer => ({ name: customer.name, phone: customer.phoneNormalized ?? customer.phone, days: daysWithoutPurchase(customer, today) })));
    try { await sendMessage(seller.telegramChatId!, text); sent++; }
    catch (error) { failed++; console.error("[SellerReminder]", { seller: seller.id, ...telegramErrorDetails(error) }); }
  }
  return { sellers: sellers.length, sent, skipped, failed };
}

/** Active sellers with a chat: the bot-linked one of the seller's account first, else the one typed on the SalesPerson (see sellerChat). */
async function chattableSellers() {
  const people = await getDb().salesPerson.findMany({ where: { isActive: true, OR: [{ telegramChatId: { not: null } }, { user: { telegramChatId: { not: null } } }] }, select: { id: true, name: true, telegramChatId: true, user: { select: { telegramChatId: true } } } });
  return people.map(person => ({ ...person, telegramChatId: person.user?.telegramChatId ?? person.telegramChatId }));
}

/**
 * Monday 08:00 (Tashkent) summary: last week's approved purchases, this month's plan % and place, this week's calls.
 * Every number comes from that seller's own scoped queries (and their own row of the plan ranking).
 */
export async function sendWeeklySummaries(now = new Date()) {
  const db = getDb(), month = tashkentYearMonth(now), local = new Date(now.getTime() + 5 * 3_600_000);
  const to = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())), from = new Date(to.getTime() - 7 * 86_400_000);
  const weekEnd = new Date(now.getTime() + 6 * 86_400_000), label = (date: Date) => date.toISOString().slice(5, 10).split("-").reverse().join(".");
  const range = `${label(from)}–${label(new Date(to.getTime() - 86_400_000))}.${to.getUTCFullYear()}`;
  const periods = await getSalesPeriods(), period = pickPeriod(periods, undefined, month);
  const board = period ? (await getPlanBoardData(period, periods)).board : null;
  const sellers = await chattableSellers();
  let sent = 0, failed = 0;
  for (const seller of sellers) {
    const viewer = { role: "SELLER" as const, salesPersonId: seller.id };
    const [week, core, calls] = await Promise.all([sellerPurchasesBetween(db, viewer, from, to), myDashboardCore(viewer, month), dueCustomers(db, viewer, weekEnd)]);
    const rank = board ? sellerRanking(board, seller.id).me?.rank ?? null : null;
    const text = weeklySummaryText({ range, ...week, plan: core.plan ? { percent: core.plan.percent, rank } : null, calls: calls.map(customer => customer.name) });
    try { await sendMessage(seller.telegramChatId!, text); sent++; }
    catch (error) { failed++; console.error("[SellerWeekly]", { seller: seller.id, ...telegramErrorDetails(error) }); }
  }
  return { sellers: sellers.length, sent, failed };
}
