// Every regular-customer read or write that a SELLER can trigger goes through this module, and every query here is
// AND-ed with customerScope(viewer): a seller only ever matches rows with ownerId = their SalesPerson. Staff
// (SUPER_ADMIN / ADMIN / MANAGER) get an empty scope. `db` is passed in so tests can run it on an in-memory store.
import type { PrismaClient } from "../../generated/prisma/client";
import { normalizeUzPhone } from "../auth/phone";
import { CALL_INTERVALS, CONTACT_RESULTS, daysWithoutPurchase, defaultNextContact, isDue, purchaseUsd, type ContactResult } from "./seller-rules";
import type { MapCustomer } from "./seller-map";

export type Viewer = { role: string; salesPersonId: string | null };
type Db = Pick<PrismaClient, "regularCustomer" | "customerContact" | "customerPurchase" | "regularCustomerMonthlySale">;

export class SellerError extends Error {}
/** Thrown for a customer outside the viewer's scope: the page turns it into 404, never "belongs to someone else". */
export class CustomerNotFound extends Error {}

/** No SalesPerson link → an id no row can have, so an unlinked seller sees nothing. */
const NO_OWNER = "__no-sales-person__";
export function customerScope(viewer: Viewer): { ownerId?: string } {
  if (viewer.role !== "SELLER") return {};
  return { ownerId: viewer.salesPersonId ?? NO_OWNER };
}
export const isSeller = (viewer: Viewer) => viewer.role === "SELLER";

const listSelect = { id: true, name: true, phone: true, phoneNormalized: true, country: true, regionCode: true, note: true, isActive: true, ownerId: true, callIntervalDays: true, lastPurchaseAt: true, nextContactAt: true, createdAt: true } as const;

export async function listCustomers(db: Db, viewer: Viewer, options: { search?: string } = {}) {
  const search = options.search?.trim();
  const digits = search?.replace(/\D/g, "");
  return db.regularCustomer.findMany({
    where: { AND: [customerScope(viewer), search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, ...(digits && digits.length >= 3 ? [{ phoneNormalized: { contains: digits } }] : [])] } : {}] },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: listSelect,
  });
}

/** One customer, or null when it does not exist or is not the viewer's. */
export async function getCustomer(db: Db, viewer: Viewer, id: string) {
  return db.regularCustomer.findFirst({ where: { AND: [{ id }, customerScope(viewer)] }, select: listSelect });
}
async function requireCustomer(db: Db, viewer: Viewer, id: string) {
  const customer = await getCustomer(db, viewer, id);
  if (!customer) throw new CustomerNotFound();
  return customer;
}

export async function customerHistory(db: Db, viewer: Viewer, id: string) {
  await requireCustomer(db, viewer, id);
  const [contacts, purchases] = await Promise.all([
    db.customerContact.findMany({ where: { customerId: id }, orderBy: { at: "desc" }, take: 50, select: { id: true, at: true, result: true, note: true, nextContactAt: true } }),
    db.customerPurchase.findMany({ where: { customerId: id }, orderBy: { date: "desc" }, take: 50, select: { id: true, date: true, amount: true, currency: true, amountUsd: true, status: true, rejectReason: true, note: true } }),
  ]);
  return { contacts, purchases };
}

export type NewCustomerInput = { name: string; phone: string; country: string; regionCode: string | null; note: string | null; callIntervalDays: number };
export type AddCustomerResult =
  | { ok: true; id: string }
  | { ok: false; reason: "invalid"; message: string }
  | { ok: false; reason: "own-duplicate"; message: string }
  | { ok: false; reason: "taken"; message: string; existing: { id: string; name: string; ownerId: string | null } };
export const TAKEN_MESSAGE = "Bu raqam boshqa sotuvchiga biriktirilgan. Admin bilan bog‘laning.";

/** A seller adds a customer for themselves. A phone that already exists is never saved; the owner is not revealed. */
export async function addSellerCustomer(db: Db, viewer: Viewer, input: NewCustomerInput): Promise<AddCustomerResult> {
  if (!isSeller(viewer) || !viewer.salesPersonId) return { ok: false, reason: "invalid", message: "Hisobingiz sotuvchiga bog‘lanmagan. Admin bilan bog‘laning." };
  const name = input.name.trim(), phone = normalizeUzPhone(input.phone);
  if (name.length < 2 || name.length > 120) return { ok: false, reason: "invalid", message: "Mijoz ismini kiriting." };
  if (!phone) return { ok: false, reason: "invalid", message: "Telefon raqamini +998 XX XXX XX XX ko‘rinishida kiriting." };
  if (!(CALL_INTERVALS as readonly number[]).includes(input.callIntervalDays)) return { ok: false, reason: "invalid", message: "Qo‘ng‘iroq oralig‘ini tanlang." };
  // Unscoped on purpose: the duplicate check must see every customer, but only the fact is returned to the seller.
  const existing = await db.regularCustomer.findFirst({ where: { phoneNormalized: phone }, select: { id: true, name: true, ownerId: true } });
  if (existing && existing.ownerId === viewer.salesPersonId) return { ok: false, reason: "own-duplicate", message: `Bu raqam sizning mijozingizda bor: ${existing.name}.` };
  if (existing) return { ok: false, reason: "taken", message: TAKEN_MESSAGE, existing };
  const created = await db.regularCustomer.create({ data: { name, phone, phoneNormalized: phone, country: input.country, regionCode: input.regionCode, note: input.note, callIntervalDays: input.callIntervalDays, ownerId: viewer.salesPersonId }, select: { id: true } });
  return { ok: true, id: created.id };
}

/** Seller edits their own customer; owner, active flag and deletion stay with admins. */
export async function updateSellerCustomer(db: Db, viewer: Viewer, id: string, input: Omit<NewCustomerInput, "phone">) {
  await requireCustomer(db, viewer, id);
  if (!(CALL_INTERVALS as readonly number[]).includes(input.callIntervalDays)) throw new SellerError("Qo‘ng‘iroq oralig‘ini tanlang.");
  if (input.name.trim().length < 2) throw new SellerError("Mijoz ismini kiriting.");
  await db.regularCustomer.update({ where: { id }, data: { name: input.name.trim(), country: input.country, regionCode: input.regionCode, note: input.note, callIntervalDays: input.callIntervalDays } });
}

export async function recordContact(db: Db, viewer: Viewer, customerId: string, input: { result: ContactResult; note: string | null; nextContactAt: Date | null }, now = new Date()) {
  const customer = await requireCustomer(db, viewer, customerId);
  if (!(input.result in CONTACT_RESULTS)) throw new SellerError("Natijani tanlang.");
  const next = input.nextContactAt ?? defaultNextContact(input.result, now, customer.callIntervalDays);
  const contact = await db.customerContact.create({ data: { customerId, sellerId: viewer.salesPersonId, at: now, result: input.result, note: input.note, nextContactAt: next }, select: { id: true } });
  await db.regularCustomer.update({ where: { id: customerId }, data: { nextContactAt: next } });
  return { id: contact.id, customer, nextContactAt: next };
}

/** Seller records a purchase; it stays PENDING (and out of every statistic) until an admin approves it. */
export async function createPurchase(db: Db, viewer: Viewer, userId: string, customerId: string, input: { date: Date; amount: number; currency: "USD" | "UZS"; note: string | null }, uzsPerUsd: number | null) {
  const customer = await requireCustomer(db, viewer, customerId);
  if (!(input.amount > 0) || input.amount >= 1e15) throw new SellerError("Summani kiriting.");
  const amountUsd = purchaseUsd(input.amount, input.currency, uzsPerUsd);
  if (amountUsd === null) throw new SellerError("Markaziy bank kursi olinmadi. Summani $ da kiriting yoki keyinroq urinib ko‘ring.");
  const purchase = await db.customerPurchase.create({ data: { customerId, sellerId: viewer.salesPersonId, date: input.date, amount: input.amount, currency: input.currency, amountUzs: input.currency === "UZS" ? input.amount : null, amountUsd, note: input.note, status: "PENDING", createdByUserId: userId }, select: { id: true } });
  return { id: purchase.id, customer, amountUsd };
}

/** The seller's own numbers: approved sales only come from monthly sales, so PENDING purchases are not counted. */
export async function sellerStats(db: Db, viewer: Viewer, year: number, today = new Date()) {
  const scope = customerScope(viewer);
  const [customers, sales, pending] = await Promise.all([
    db.regularCustomer.findMany({ where: { AND: [scope, { isActive: true }] }, select: { id: true, callIntervalDays: true, lastPurchaseAt: true, nextContactAt: true, createdAt: true } }),
    db.regularCustomerMonthlySale.findMany({ where: { year, customer: scope }, select: { amountUsd: true } }),
    db.customerPurchase.findMany({ where: { status: "PENDING", customer: scope }, select: { amountUsd: true } }),
  ]);
  return {
    customers: customers.length,
    approvedUsd: Math.round(sales.reduce((sum, row) => sum + Number(row.amountUsd), 0) * 100) / 100,
    pendingCount: pending.length,
    pendingUsd: Math.round(pending.reduce((sum, row) => sum + Number(row.amountUsd), 0) * 100) / 100,
    due: customers.filter(customer => isDue(customer, today)).length,
  };
}

/** "Bugun qo‘ng‘iroq": the viewer's active customers that are due today. */
export async function dueCustomers(db: Db, viewer: Viewer, today = new Date()) {
  const rows = await db.regularCustomer.findMany({ where: { AND: [customerScope(viewer), { isActive: true }] }, orderBy: { name: "asc" }, select: listSelect });
  return rows.filter(customer => isDue(customer, today));
}

export async function sellerPurchases(db: Db, viewer: Viewer) {
  return db.customerPurchase.findMany({ where: { customer: customerScope(viewer) }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, date: true, amount: true, currency: true, amountUsd: true, status: true, rejectReason: true, customer: { select: { id: true, name: true } } } });
}

/**
 * "Mening hududlarim": the viewer's active customers with this year's approved total (monthly sales) each.
 * Both queries are AND-ed with customerScope, so a seller's map is built from their own customers only.
 */
export async function sellerMapCustomers(db: Db, viewer: Viewer, year: number, today = new Date()): Promise<MapCustomer[]> {
  const scope = customerScope(viewer);
  const [customers, sales] = await Promise.all([
    db.regularCustomer.findMany({ where: { AND: [scope, { isActive: true }] }, select: { id: true, name: true, country: true, regionCode: true, callIntervalDays: true, lastPurchaseAt: true, nextContactAt: true, createdAt: true } }),
    db.regularCustomerMonthlySale.findMany({ where: { year, customer: scope }, select: { customerId: true, amountUsd: true } }),
  ]);
  const totals = new Map<string, number>();
  for (const sale of sales) totals.set(sale.customerId, (totals.get(sale.customerId) ?? 0) + Number(sale.amountUsd));
  return customers.map(customer => ({
    id: customer.id, name: customer.name, country: customer.country, regionCode: customer.regionCode,
    days: daysWithoutPurchase(customer, today), due: isDue(customer, today), total: totals.get(customer.id) ?? 0,
  }));
}
