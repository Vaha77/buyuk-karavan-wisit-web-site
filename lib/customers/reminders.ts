import "server-only";

import { getDb } from "@/lib/db";
import { sendMessage, telegramErrorDetails } from "@/lib/telegram/client";
import { dueCustomers } from "./seller-repo";
import { daysWithoutPurchase, reminderText } from "./seller-rules";

/** Daily 09:00 (Tashkent) reminder: each seller with a Telegram chat gets their own due customers; others are skipped. */
export async function sendSellerReminders(today = new Date()) {
  const db = getDb();
  const sellers = await db.salesPerson.findMany({ where: { isActive: true, telegramChatId: { not: null } }, select: { id: true, name: true, telegramChatId: true } });
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
