import "server-only";

import type { AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit/service";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { expireDashboard } from "@/lib/referrals/tracking";
import { sendMessage, telegramErrorDetails } from "@/lib/telegram/client";
import { addSellerCustomer, createPurchase, recordContact, updateSellerCustomer, type NewCustomerInput, type Viewer } from "./seller-repo";
import { mergeMonthlySale, type ContactResult } from "./seller-rules";

type Actor = Pick<AdminUser, "id" | "name" | "role" | "salesPersonId">;
export const viewerOf = (user: Pick<AdminUser, "role" | "salesPersonId">): Viewer => ({ role: user.role, salesPersonId: user.salesPersonId });

/** Private admin chat (TELEGRAM_ADMIN_CHAT_ID). Not the sellers' group: these messages name other sellers. Missing = skipped. */
export async function notifyAdmins(text: string) {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!chatId) return false;
  try { await sendMessage(chatId, text); return true; } catch (error) { console.error("[AdminNotify]", telegramErrorDetails(error)); return false; }
}

export async function addCustomerAsSeller(actor: Actor, input: NewCustomerInput) {
  const db = getDb();
  const result = await addSellerCustomer(db, viewerOf(actor), input);
  if (result.ok) {
    await writeAudit(actor, { action: "CREATE", entityType: "REGULAR_CUSTOMER", entityId: result.id, entityName: input.name, summary: "Sotuvchi doimiy mijoz qo‘shdi", after: { name: input.name, phone: input.phone, ownerId: actor.salesPersonId, callIntervalDays: input.callIntervalDays } });
    expireDashboard();
  }
  if (!result.ok && result.reason === "taken") {
    const owner = result.existing.ownerId ? await db.salesPerson.findUnique({ where: { id: result.existing.ownerId }, select: { name: true } }) : null;
    const ownerLabel = owner?.name ?? "hech kimga biriktirilmagan (admin)";
    const seller = actor.salesPersonId ? (await db.salesPerson.findUnique({ where: { id: actor.salesPersonId }, select: { name: true } }))?.name ?? actor.name : actor.name;
    await writeAudit(actor, { action: "DUPLICATE_ATTEMPT", entityType: "REGULAR_CUSTOMER", entityId: result.existing.id, entityName: result.existing.name, summary: `${seller} ${input.phone} raqamini qo‘shmoqchi bo‘ldi, u ${ownerLabel}da`, metadata: { phone: input.phone, attemptedName: input.name, ownerId: result.existing.ownerId } });
    await notifyAdmins(`⚠️ ${seller} ${input.phone} ni qo‘shmoqchi bo‘ldi, u ${ownerLabel}da (mijoz: ${result.existing.name}).`);
  }
  return result;
}

export async function updateCustomerAsSeller(actor: Actor, id: string, input: Omit<NewCustomerInput, "phone">) {
  await updateSellerCustomer(getDb(), viewerOf(actor), id, input);
  await writeAudit(actor, { action: "UPDATE", entityType: "REGULAR_CUSTOMER", entityId: id, entityName: input.name, summary: "Sotuvchi o‘z mijozini tahrirladi", after: input });
  expireDashboard();
}

export async function recordContactAsSeller(actor: Actor, customerId: string, input: { result: ContactResult; note: string | null; nextContactAt: Date | null }) {
  const saved = await recordContact(getDb(), viewerOf(actor), customerId, input);
  await writeAudit(actor, { action: "CREATE", entityType: "CUSTOMER_CONTACT", entityId: saved.id, entityName: saved.customer.name, summary: `Qo‘ng‘iroq natijasi: ${input.result}`, after: { result: input.result, note: input.note, nextContactAt: saved.nextContactAt.toISOString() } });
  return saved;
}

export async function createPurchaseAsSeller(actor: Actor, customerId: string, input: { date: Date; amount: number; currency: "USD" | "UZS"; note: string | null }) {
  const rate = input.currency === "UZS" ? await getUsdUzsRate() : null;
  const saved = await createPurchase(getDb(), viewerOf(actor), actor.id, customerId, input, rate ? Number(rate.rate) : null);
  await writeAudit(actor, { action: "CREATE", entityType: "CUSTOMER_PURCHASE", entityId: saved.id, entityName: saved.customer.name, summary: `Xarid kiritildi (tasdiqlash kutilmoqda): $${saved.amountUsd}`, after: { date: input.date.toISOString().slice(0, 10), amount: input.amount, currency: input.currency, amountUsd: saved.amountUsd } });
  return saved;
}

export class PurchaseReviewError extends Error {}

/** Admin approves: the purchase is added to that month's RegularCustomerMonthlySale and lastPurchaseAt moves forward. */
export async function approvePurchase(actor: Pick<AdminUser, "id" | "name">, id: string) {
  const db = getDb();
  const purchase = await db.customerPurchase.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true, lastPurchaseAt: true } } } });
  if (!purchase) throw new PurchaseReviewError("Xarid topilmadi.");
  if (purchase.status !== "PENDING") throw new PurchaseReviewError("Bu xarid allaqachon ko‘rib chiqilgan.");
  const year = purchase.date.getUTCFullYear(), month = purchase.date.getUTCMonth() + 1;
  const key = { customerId_year_month: { customerId: purchase.customerId, year, month } };
  await db.$transaction(async tx => {
    // Guard against a double click: only a still-PENDING row is flipped.
    const flipped = await tx.customerPurchase.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", reviewedById: actor.id, reviewedAt: new Date() } });
    if (flipped.count !== 1) throw new PurchaseReviewError("Bu xarid allaqachon ko‘rib chiqilgan.");
    const existing = await tx.regularCustomerMonthlySale.findUnique({ where: key });
    const merged = mergeMonthlySale(existing ? { amount: Number(existing.amount), currency: existing.currency, amountUsd: Number(existing.amountUsd) } : null, { amount: Number(purchase.amount), currency: purchase.currency, amountUsd: Number(purchase.amountUsd) });
    const note = [existing?.note, `Xarid ${purchase.date.toISOString().slice(0, 10)}: ${purchase.amount.toString()} ${purchase.currency}`].filter(Boolean).join("; ").slice(0, 500);
    await tx.regularCustomerMonthlySale.upsert({ where: key, create: { customerId: purchase.customerId, year, month, ...merged, note, createdByAdminId: actor.id }, update: { ...merged, note, updatedByAdminId: actor.id } });
    const last = purchase.customer.lastPurchaseAt && purchase.customer.lastPurchaseAt > purchase.date ? purchase.customer.lastPurchaseAt : purchase.date;
    await tx.regularCustomer.update({ where: { id: purchase.customerId }, data: { lastPurchaseAt: last, nextContactAt: null } });
  });
  await writeAudit(actor, { action: "APPROVE", entityType: "CUSTOMER_PURCHASE", entityId: id, entityName: purchase.customer.name, summary: `Xaridni tasdiqladi: ${purchase.customer.name}, ${year}-yil ${month}-oy, $${purchase.amountUsd.toString()}`, after: { amount: purchase.amount.toString(), currency: purchase.currency, amountUsd: purchase.amountUsd.toString(), year, month } });
  expireDashboard();
}

export async function rejectPurchase(actor: Pick<AdminUser, "id" | "name">, id: string, reason: string) {
  const text = reason.trim();
  if (text.length < 3 || text.length > 300) throw new PurchaseReviewError("Rad etish sababini yozing.");
  const db = getDb();
  const purchase = await db.customerPurchase.findUnique({ where: { id }, include: { customer: { select: { name: true } } } });
  if (!purchase) throw new PurchaseReviewError("Xarid topilmadi.");
  const flipped = await db.customerPurchase.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", rejectReason: text, reviewedById: actor.id, reviewedAt: new Date() } });
  if (flipped.count !== 1) throw new PurchaseReviewError("Bu xarid allaqachon ko‘rib chiqilgan.");
  await writeAudit(actor, { action: "REJECT", entityType: "CUSTOMER_PURCHASE", entityId: id, entityName: purchase.customer.name, summary: `Xaridni rad etdi: ${purchase.customer.name} — ${text}`, after: { reason: text } });
}
