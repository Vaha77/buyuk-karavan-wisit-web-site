import "server-only";
import { revalidatePath } from "next/cache";
import { Prisma, type AdminUser } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit/service";
import { getDb } from "@/lib/db";
import { getPraysCategories, getPraysProducts, getSexParts, getStandardCondenserCategoryId } from "@/lib/prays/queries";
import { isIssueCategory } from "./categories";
import { CLOSED_TEXT, DUPLICATE_WINDOW_MS, RECEIVE_OVERDUE_MS, STATUS_LABEL, receiveReminderText, storeDiffText, storeExtra, type StoreInput, alreadyText, canEditOrder, canMarkTest, checkCorrection, checkCancel, checkTransition, duplicateWarning, findDuplicate, orderNumber, type FingerprintInput, type OrderAction, type OrderStatus, type PriceSnapshot } from "./rules";
import { notifyCancelled, notifyChanged, notifyCreated, notifyStore } from "./bot";
import { createOnce } from "./idempotency";
import { closeMonths, createNumbered } from "./month";
import type { DeliveryStatus } from "./bot-text";
import { buildZborkaCatalog, frameAlertText, frameChange, quoteZborka, type Assembly } from "./zborka";
import { sendMessage } from "@/lib/telegram/client";
import { orderIssuedText } from "@/lib/customers/seller-rules";
import { tellSeller } from "@/lib/customers/seller-telegram";
import { orderTitle } from "./bot-text";

type Actor = Pick<AdminUser, "id" | "name" | "role" | "salesPersonId">;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Compressors and condensers come from the categories flagged in Prays → Kategoriyalar; receivers from the old part list. */
export async function loadZborkaCatalog() {
  const [products, parts, categories, standardCondenserCategoryId] = await Promise.all([getPraysProducts(), getSexParts(), getPraysCategories(), getStandardCondenserCategoryId()]);
  return buildZborkaCatalog(products, parts, { categories, standardCondenserCategoryId });
}

const money = (value: number) => new Prisma.Decimal(value.toFixed(2));

export type OrderCommon = { purpose: "SHOP" | "CLIENT"; customerId: string | null; customerName: string | null; dueDate: string | null; note: string | null };
/** CLIENT orders need a customer: a regular customer the actor may see, or a typed name. */
async function resolveCustomer(actor: Actor, input: OrderCommon): Promise<Result<{ customerId: string | null; customerName: string | null }>> {
  if (input.purpose === "SHOP") return { ok: true, customerId: null, customerName: null };
  if (input.customerId) {
    const customer = await getDb().regularCustomer.findFirst({ where: { id: input.customerId, isActive: true, ...(actor.role === "SELLER" ? { ownerId: actor.salesPersonId ?? "__none__" } : {}) }, select: { id: true, name: true } });
    if (customer) return { ok: true, customerId: customer.id, customerName: customer.name };
  }
  const name = input.customerName?.trim();
  return name ? { ok: true, customerId: null, customerName: name } : { ok: false, error: "“Mijozga” uchun mijozni tanlang yoki ismini yozing." };
}
const dueDateOf = (value: string | null) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

/** requestId: one id per form submit; confirmDuplicate: the seller answered "Ha" to "Baribir yana yuborasizmi?". */
export type SubmitMeta = { requestId: string | null; confirmDuplicate: boolean };
export type CreateResult = { ok: true; id: string; number: string; telegram: DeliveryStatus; repeated?: boolean } | { ok: false; error: string; duplicate?: { number: string } };

/** The same submit again (double click, retry): the order it already created. */
async function sameRequest(requestId: string | null): Promise<CreateResult | null> {
  const order = requestId ? await findByRequest(requestId) : null;
  return order ? { ok: true, id: order.id, number: orderNumber(order), telegram: "sent", repeated: true } : null;
}
const numbered = { id: true, monthKey: true, monthNo: true } as const;
const findByRequest = (requestId: string) => getDb().workshopOrder.findUnique({ where: { requestId }, select: numbered });
/** Same seller, goods, recipient and quantity within 10 minutes → ask before creating another one. */
async function recentDuplicate(candidate: FingerprintInput) {
  const recent = await getDb().workshopOrder.findMany({
    where: { sellerId: candidate.sellerId, createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) }, status: { not: "CANCELLED" } },
    select: { monthKey: true, monthNo: true, createdAt: true, status: true, sellerId: true, type: true, purpose: true, customerId: true, customerName: true, qty: true, items: { select: { productId: true, partId: true, title: true, qty: true } } },
  });
  return findDuplicate(candidate, recent.map(order => ({ ...order, number: orderNumber(order), items: order.items.map(item => ({ ref: item.productId ?? item.partId, title: item.title, qty: item.qty })) })));
}
const isUniqueViolation = (error: unknown) => !!error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002";

/** condenserId: vazdushniy agregat condenser (product); composition / manualPrice: chiller (null price = "kelishiladi"). */
export type AgregatInput = OrderCommon & { groupKey: string; modelKey: string; assembly: Assembly; liters: string | null; hp: string | null; condenserId: string | null; composition: string | null; manualPrice: number | null; qty: number };
export async function createAgregatOrder(actor: Actor, input: AgregatInput, meta: SubmitMeta = { requestId: null, confirmDuplicate: false }): Promise<CreateResult> {
  const again = await sameRequest(meta.requestId);
  if (again) return again;
  const catalog = await loadZborkaCatalog();
  const group = catalog.groups.find(item => item.key === input.groupKey), model = group?.models.find(item => item.key === input.modelKey);
  if (!group || !model) return { ok: false, error: "Kompressor praysda topilmadi." };
  const quote = quoteZborka(model, group, catalog, { assembly: input.assembly, liters: input.liters, hp: input.hp, condenserId: input.condenserId, composition: input.composition, manualPrice: input.manualPrice });
  if (!quote.ok) return quote;
  const customer = await resolveCustomer(actor, input);
  if (!customer.ok) return customer;
  if (!meta.confirmDuplicate) {
    const duplicate = await recentDuplicate({ sellerId: actor.id, type: "AGREGAT", purpose: input.purpose, customerId: customer.customerId, customerName: customer.customerName, qty: input.qty, items: [{ ref: quote.product.id, title: quote.title, qty: input.qty }] });
    if (duplicate) return { ok: false, error: duplicateWarning(duplicate), duplicate: { number: duplicate.number } };
  }
  const snapshot: PriceSnapshot = { unitBaseUsd: quote.base, totalBaseUsd: Math.round(quote.base * input.qty * 100) / 100, standardBaseUsd: quote.negotiated ? null : quote.standard, ...(quote.negotiated ? { negotiated: true } : {}) };
  const created = await createOnce(meta.requestId, findByRequest, () => createNumbered((tx, slot) => tx.workshopOrder.create({
    data: {
      ...slot, requestId: meta.requestId, type: "AGREGAT", purpose: input.purpose, customerId: customer.customerId, customerName: customer.customerName, qty: input.qty, dueDate: dueDateOf(input.dueDate), note: input.note,
      sellerId: actor.id, createdById: actor.id, priceSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      items: { create: [{ kind: "PRODUCT", productId: quote.product.id, title: quote.title, qty: input.qty, baseUsd: quote.negotiated ? null : money(quote.base), changedFromStandard: quote.changes.length > 0, options: { assembly: input.assembly, ...quote.options, standard: { liters: model.liters, hp: model.hp, fn: model.fn }, changes: quote.telegram, priceList: group.label, ...(quote.negotiated ? { negotiated: true } : {}) } as Prisma.InputJsonValue }] },
    },
    select: numbered,
  })), isUniqueViolation);
  if (created.repeated) return { ok: true, id: created.value.id, number: orderNumber(created.value), telegram: "sent", repeated: true };
  const order = created.value;
  const telegram = await afterCreate(actor, order.id, `${orderNumber(order)} zborka zakazini berdi`, { title: quote.title, qty: input.qty, purpose: input.purpose, customer: customer.customerName, changes: quote.changes.length });
  const change = frameChange({ assembly: input.assembly, fn: quote.options.fn, standard: { fn: model.fn } });
  if (change) await notifySuperAdmins(frameAlertText(orderNumber(order), actor.name, change));
  return { ok: true, id: order.id, number: orderNumber(order), telegram };
}

/** productId: goods of a "Sehdan alohida chiqadi" category (Prays → Kategoriyalar); the old part list is not used any more. */
export type ZapchastInput = OrderCommon & { items: Array<{ productId: string; qty: number }> };
/** Spare-part request; `noRequestFor` = "Zayavkasiz chiqim" by the workshop for that seller (already handed out → ISSUED). */
export async function createZapchastOrder(actor: Actor, input: ZapchastInput, noRequestFor?: string, meta: SubmitMeta = { requestId: null, confirmDuplicate: false }): Promise<CreateResult> {
  const again = await sameRequest(meta.requestId);
  if (again) return again;
  const ids = [...new Set(input.items.map(item => item.productId))];
  const products = await getDb().product.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true, name: true, model: true, basePriceUsd: true, category: { select: { workshopIssue: true } } } });
  const byId = new Map(products.filter(product => isIssueCategory(product.category)).map(product => [product.id, product]));
  if (!input.items.length || input.items.some(item => !byId.has(item.productId))) return { ok: false, error: "Seh mahsulotini tanlang." };
  const customer = await resolveCustomer(actor, input);
  if (!customer.ok) return customer;
  let sellerId = actor.id;
  if (noRequestFor) {
    const seller = await getDb().adminUser.findFirst({ where: { id: noRequestFor, role: "SELLER", isActive: true }, select: { id: true } });
    if (!seller) return { ok: false, error: "Sotuvchini tanlang." };
    sellerId = seller.id;
  }
  if (!meta.confirmDuplicate) {
    const duplicate = await recentDuplicate({ sellerId, type: "ZAPCHAST", purpose: input.purpose, customerId: customer.customerId, customerName: customer.customerName, qty: 1, items: input.items.map(item => ({ ref: item.productId, title: "", qty: item.qty })) });
    if (duplicate) return { ok: false, error: duplicateWarning(duplicate), duplicate: { number: duplicate.number } };
  }
  const known = input.items.filter(item => byId.get(item.productId)!.basePriceUsd !== null);
  const totalBase = Math.round(known.reduce((sum, item) => sum + Number(byId.get(item.productId)!.basePriceUsd) * item.qty, 0) * 100) / 100;
  const snapshot = { unitBaseUsd: totalBase, totalBaseUsd: totalBase, standardBaseUsd: null, missingPrices: input.items.length - known.length };
  const now = new Date();
  const created = await createOnce(meta.requestId, findByRequest, () => createNumbered((tx, slot) => tx.workshopOrder.create({
    data: {
      ...slot, requestId: meta.requestId, type: "ZAPCHAST", purpose: input.purpose, customerId: customer.customerId, customerName: customer.customerName, qty: 1, dueDate: dueDateOf(input.dueDate), note: input.note,
      sellerId, createdById: actor.id, priceSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      ...(noRequestFor ? { noRequest: true, status: "ISSUED" as const, acceptedById: actor.id, acceptedAt: now, startedById: actor.id, startedAt: now, issuedById: actor.id, issuedAt: now } : {}),
      items: { create: input.items.map((item, index) => { const product = byId.get(item.productId)!; return { kind: "PRODUCT" as const, productId: product.id, title: product.model && !product.name.toUpperCase().includes(product.model.toUpperCase()) ? `${product.name} ${product.model}` : product.name, qty: item.qty, baseUsd: product.basePriceUsd, order: index }; }) },
    },
    select: numbered,
  })), isUniqueViolation);
  if (created.repeated) return { ok: true, id: created.value.id, number: orderNumber(created.value), telegram: "sent", repeated: true };
  const order = created.value;
  const telegram = await afterCreate(actor, order.id, noRequestFor ? `${orderNumber(order)} zayavkasiz chiqimni yozdi` : `${orderNumber(order)} zapchast zayavkasini berdi`, { items: input.items.length, purpose: input.purpose, customer: customer.customerName, noRequest: !!noRequestFor });
  return { ok: true, id: order.id, number: orderNumber(order), telegram };
}

/** Best effort: the order is already saved, a failed Telegram message only logs. */
async function notifySuperAdmins(text: string) {
  const admins = await getDb().adminUser.findMany({ where: { role: "SUPER_ADMIN", isActive: true, archivedAt: null, telegramChatId: { not: null } }, select: { telegramChatId: true } });
  await Promise.all(admins.map(admin => sendMessage(admin.telegramChatId!, text).catch(error => console.error("Seh super admin alert failed", { name: error instanceof Error ? error.name : "UnknownError" }))));
}

async function afterCreate(actor: Actor, id: string, summary: string, after: Record<string, unknown>) {
  await writeAudit(actor, { action: "CREATE", entityType: "WORKSHOP_ORDER", entityId: id, summary, after });
  const telegram = await notifyCreated(id);
  revalidatePath("/admin/seh");
  return telegram;
}

const ACTOR_FIELDS: Record<OrderAction, "accepted" | "started" | "issued" | "received" | "loaded"> = { accept: "accepted", start: "started", issue: "issued", receive: "received", store: "received", load: "loaded" };
/** The only way an order changes status (site buttons and Telegram buttons both end here). */
/** `via: "telegram"` marks the audit entry "Telegram orqali". */
export async function transitionOrder(actor: Actor, id: string, action: OrderAction, issuedQty?: Record<string, number>, via: "site" | "telegram" = "site", store: StoreInput = {}): Promise<Result<{ status: OrderStatus }>> {
  const db = getDb();
  await closeMonths();
  const order = await db.workshopOrder.findUnique({ where: { id }, select: { id: true, monthKey: true, monthNo: true, status: true, purpose: true, type: true, qty: true, sellerId: true, items: { orderBy: { order: "asc" }, select: { id: true, qty: true, issuedQty: true, title: true } } } });
  if (!order) return { ok: false, error: "Zakaz topilmadi." };
  if (!canEditOrder(actor.role, order.monthKey)) return { ok: false, error: CLOSED_TEXT };
  const check = checkTransition(actor.role, order.status, action, order.purpose);
  if (!check.ok) return check;
  const stored = storeExtra(action, store);
  if (!stored.ok) return stored;
  const extra = stored.data, diff = "receivedNote" in extra ? extra : null;
  const issuedTotal = order.type === "AGREGAT" ? order.qty : order.items.reduce((sum, item) => sum + (item.issuedQty ?? item.qty), 0);
  const field = ACTOR_FIELDS[action], now = new Date();
  const corrections = action === "issue" && issuedQty ? order.items.filter(item => issuedQty[item.id] !== undefined && issuedQty[item.id] !== item.qty) : [];
  if (corrections.some(item => !Number.isInteger(issuedQty![item.id]) || issuedQty![item.id] < 0 || issuedQty![item.id] > 9999)) return { ok: false, error: "Berilgan sonni to‘g‘ri kiriting." };
  const moved = await db.$transaction(async tx => {
    const result = await tx.workshopOrder.updateMany({ where: { id, status: order.status }, data: { status: check.to, [`${field}ById`]: actor.id, [`${field}At`]: now, ...extra } });
    if (result.count !== 1) return false;
    for (const item of corrections) await tx.workshopOrderItem.update({ where: { id: item.id }, data: { issuedQty: issuedQty![item.id] } });
    return true;
  });
  if (!moved) {
    // Pressed in two places at once: the first one went through.
    const current = await db.workshopOrder.findUnique({ where: { id }, select: { status: true } });
    return { ok: false, error: current ? alreadyText(current.status) : "Zakaz topilmadi." };
  }
  await writeAudit(actor, { action: "STATUS_CHANGE", entityType: "WORKSHOP_ORDER", entityId: id, entityName: orderNumber(order), summary: `${orderNumber(order)}: ${STATUS_LABEL[order.status]} → ${STATUS_LABEL[check.to]}${via === "telegram" ? " (Telegram orqali)" : ""}`, metadata: { via }, before: { status: order.status }, after: { status: check.to, ...extra, ...(corrections.length ? { issuedQty: Object.fromEntries(corrections.map(item => [item.id, issuedQty![item.id]])) } : {}) } });
  await notifyChanged(id, action === "start");
  if (check.to === "ISSUED") {
    const issued = await db.workshopOrder.findUnique({ where: { id }, select: { monthKey: true, monthNo: true, sellerId: true, type: true, qty: true, items: { orderBy: { order: "asc" }, select: { title: true, qty: true, issuedQty: true } } } });
    if (issued) await tellSeller({ userId: issued.sellerId }, orderIssuedText(orderNumber(issued), orderTitle(issued)));
  }
  // Omborchi copies: sent on ISSUED, edited after every later step (the first press wins, the rest see who did it).
  if (action !== "accept" && action !== "start") await notifyStore(id);
  if (diff) await notifySuperAdmins(storeDiffText(orderNumber(order), orderTitle(order), issuedTotal, diff.receivedQty, diff.receivedNote, actor.name));
  if (action === "load") await tellSeller({ userId: order.sellerId }, `🚚 ${orderNumber(order)} mijozga yuklandi`);
  revalidatePath("/admin/seh");
  return { ok: true, status: check.to };
}

/** Soft cancel: status CANCELLED with who / when / why; the order stays in the list ("Bekor qilingan"). */
export async function cancelOrder(actor: Actor, id: string, reason: string | null): Promise<Result> {
  const db = getDb();
  await closeMonths();
  const order = await db.workshopOrder.findUnique({ where: { id }, select: { id: true, monthKey: true, monthNo: true, status: true, sellerId: true } });
  if (!order) return { ok: false, error: "Zakaz topilmadi." };
  if (!canEditOrder(actor.role, order.monthKey)) return { ok: false, error: CLOSED_TEXT };
  const check = checkCancel(actor.role, order.status, order.sellerId === actor.id, reason);
  if (!check.ok) return check;
  const cleanReason = reason?.trim().slice(0, 300) || null;
  const result = await db.workshopOrder.updateMany({ where: { id, status: order.status }, data: { status: "CANCELLED", cancelledById: actor.id, cancelledAt: new Date(), cancelReason: cleanReason } });
  if (result.count !== 1) {
    const current = await db.workshopOrder.findUnique({ where: { id }, select: { status: true } });
    return { ok: false, error: current ? alreadyText(current.status) : "Zakaz topilmadi." };
  }
  await writeAudit(actor, { action: "CANCEL", entityType: "WORKSHOP_ORDER", entityId: id, entityName: orderNumber(order), summary: `${orderNumber(order)}: ${STATUS_LABEL[order.status]} → Bekor qilingan`, before: { status: order.status }, after: { status: "CANCELLED", reason: cleanReason } });
  await notifyCancelled(id);
  revalidatePath("/admin/seh");
  return { ok: true };
}

/** "Test deb belgilash / olib tashlash" (SUPER_ADMIN): only the flag changes; the order, its status and Telegram messages stay. */
export async function setOrderTest(actor: Actor, id: string, isTest: boolean): Promise<Result> {
  if (!canMarkTest(actor.role)) return { ok: false, error: "Test belgisini faqat Super Admin qo‘yadi." };
  const order = await getDb().workshopOrder.findUnique({ where: { id }, select: { monthKey: true, monthNo: true, isTest: true } });
  if (!order) return { ok: false, error: "Zakaz topilmadi." };
  if (order.isTest === isTest) return { ok: true };
  await getDb().workshopOrder.update({ where: { id }, data: { isTest } });
  await writeAudit(actor, { action: "UPDATE", entityType: "WORKSHOP_ORDER", entityId: id, entityName: orderNumber(order), summary: `${orderNumber(order)}: ${isTest ? "test deb belgilandi" : "test belgisi olib tashlandi"}`, before: { isTest: order.isTest }, after: { isTest } });
  revalidatePath("/admin/seh");
  revalidatePath("/admin");
  return { ok: true };
}

/** A seller confirms a "Zayavkasiz chiqim" written in their name. */
export async function confirmNoRequest(actor: Actor, id: string): Promise<Result> {
  const order = await getDb().workshopOrder.findUnique({ where: { id }, select: { monthKey: true } });
  if (order && !canEditOrder(actor.role, order.monthKey)) return { ok: false, error: CLOSED_TEXT };
  const result = await getDb().workshopOrder.updateMany({ where: { id, sellerId: actor.id, noRequest: true, sellerConfirmedAt: null }, data: { sellerConfirmedAt: new Date() } });
  if (result.count !== 1) return { ok: false, error: "Zakaz topilmadi yoki allaqachon tasdiqlangan." };
  await writeAudit(actor, { action: "CONFIRM", entityType: "WORKSHOP_ORDER", entityId: id, summary: "Zayavkasiz chiqimni tasdiqladi", before: { sellerConfirmed: false }, after: { sellerConfirmed: true } });
  revalidatePath("/admin/seh");
  return { ok: true };
}

// ---- Closed month: "Tuzatish so‘rash" and the SUPER_ADMIN edit -------------------------------------
/** Anyone but SUPER_ADMIN asks for a fix of a closed-month order; SUPER_ADMIN gets Telegram and "Tasdiqlash kerak". */
export async function requestCorrection(actor: Actor, id: string, reason: string): Promise<Result> {
  const db = getDb();
  const order = await db.workshopOrder.findUnique({ where: { id }, select: { monthKey: true, monthNo: true, sellerId: true } });
  if (!order) return { ok: false, error: "Zakaz topilmadi." };
  const check = checkCorrection(actor, order, reason);
  if (!check.ok) return check;
  if (await db.workshopCorrectionRequest.findFirst({ where: { orderId: id, requesterId: actor.id, status: "PENDING" }, select: { id: true } })) return { ok: false, error: "So‘rovingiz allaqachon yuborilgan — Super Admin ko‘rib chiqadi." };
  const text = reason.trim().slice(0, 500), number = orderNumber(order);
  await db.workshopCorrectionRequest.create({ data: { orderId: id, requesterId: actor.id, reason: text } });
  await writeAudit(actor, { action: "CREATE", entityType: "WORKSHOP_ORDER", entityId: id, entityName: number, summary: `${number}: tuzatish so‘raldi`, after: { reason: text } });
  await notifySuperAdmins(`🔔 Tuzatish so‘rovi · ${number}\n${actor.name}: “${text}”\nAdmin → Tasdiqlash kerak`);
  revalidatePath("/admin/customers/purchases");
  return { ok: true };
}

export async function rejectCorrection(actor: Actor, requestId: string, reason: string): Promise<Result> {
  if (actor.role !== "SUPER_ADMIN") return { ok: false, error: "Faqat Super Admin rad etadi." };
  if (reason.trim().length < 3) return { ok: false, error: "Rad etish sababini yozing." };
  const db = getDb();
  const request = await db.workshopCorrectionRequest.findUnique({ where: { id: requestId }, select: { orderId: true, requesterId: true, order: { select: { monthKey: true, monthNo: true } } } });
  if (!request) return { ok: false, error: "So‘rov topilmadi." };
  const text = reason.trim().slice(0, 300), number = orderNumber(request.order);
  const result = await db.workshopCorrectionRequest.updateMany({ where: { id: requestId, status: "PENDING" }, data: { status: "REJECTED", rejectReason: text, resolvedAt: new Date(), resolvedById: actor.id } });
  if (result.count !== 1) return { ok: false, error: "So‘rov allaqachon ko‘rib chiqilgan." };
  await writeAudit(actor, { action: "REJECT", entityType: "WORKSHOP_ORDER", entityId: request.orderId, entityName: number, summary: `${number}: tuzatish so‘rovi rad etildi`, after: { reason: text } });
  await tellSeller({ userId: request.requesterId }, `❌ ${number} bo‘yicha tuzatish so‘rovingiz rad etildi · Sabab: ${text}`);
  revalidatePath("/admin/customers/purchases");
  return { ok: true };
}

export type OrderEdit = { customerName: string | null; note: string | null; qty: number; items: Array<{ id: string; qty: number; issuedQty: number | null }> };
/** SUPER_ADMIN edit (any month); `requestId` closes that "Tuzatish so‘rash" as approved. Changed fields go to Faoliyat tarixi as before / after. */
export async function editOrder(actor: Actor, id: string, input: OrderEdit, requestId: string | null): Promise<Result> {
  if (actor.role !== "SUPER_ADMIN") return { ok: false, error: "Zakazni faqat Super Admin tahrirlaydi." };
  const db = getDb();
  const order = await db.workshopOrder.findUnique({ where: { id }, select: { monthKey: true, monthNo: true, customerName: true, note: true, qty: true, items: { select: { id: true, title: true, qty: true, issuedQty: true } } } });
  if (!order) return { ok: false, error: "Zakaz topilmadi." };
  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  for (const key of ["customerName", "note", "qty"] as const) if (order[key] !== input[key]) { before[key] = order[key]; after[key] = input[key]; }
  const items = input.items.flatMap(change => { const item = order.items.find(row => row.id === change.id); return item && (item.qty !== change.qty || item.issuedQty !== change.issuedQty) ? [{ item, change }] : []; });
  for (const { item, change } of items) { before[item.title] = { qty: item.qty, issuedQty: item.issuedQty }; after[item.title] = { qty: change.qty, issuedQty: change.issuedQty }; }
  if (!Object.keys(after).length && !requestId) return { ok: true };
  const requests = await db.$transaction(async tx => {
    await tx.workshopOrder.update({ where: { id }, data: { customerName: input.customerName, note: input.note, qty: input.qty } });
    for (const { item, change } of items) await tx.workshopOrderItem.update({ where: { id: item.id }, data: { qty: change.qty, issuedQty: change.issuedQty } });
    if (!requestId) return [];
    const pending = await tx.workshopCorrectionRequest.findMany({ where: { id: requestId, orderId: id, status: "PENDING" }, select: { requesterId: true } });
    await tx.workshopCorrectionRequest.updateMany({ where: { id: requestId, orderId: id, status: "PENDING" }, data: { status: "APPROVED", resolvedAt: new Date(), resolvedById: actor.id } });
    return pending;
  });
  const number = orderNumber(order);
  await writeAudit(actor, { action: "UPDATE", entityType: "WORKSHOP_ORDER", entityId: id, entityName: number, summary: `${number}: Super Admin tahrirladi${requestId ? " (tuzatish so‘rovi bo‘yicha)" : ""}`, before, after, metadata: requestId ? { correctionRequestId: requestId } : null });
  for (const request of requests) await tellSeller({ userId: request.requesterId }, `✅ ${number} bo‘yicha tuzatish so‘rovingiz bajarildi`);
  revalidatePath("/admin/seh");
  revalidatePath("/admin/customers/purchases");
  return { ok: true };
}

/** "Tasdiqlash kerak" → "Ko‘rdim" on an omborchi "Kamchilik bor / Soni boshqa" report (SUPER_ADMIN). */
export async function checkStoreDiff(actor: Actor, id: string): Promise<Result> {
  if (actor.role !== "SUPER_ADMIN") return { ok: false, error: "Faqat Super Admin tasdiqlaydi." };
  const order = await getDb().workshopOrder.findUnique({ where: { id }, select: { monthKey: true, monthNo: true, receivedQty: true, receivedNote: true } });
  const result = await getDb().workshopOrder.updateMany({ where: { id, receivedNote: { not: null }, receivedCheckedAt: null }, data: { receivedCheckedAt: new Date() } });
  if (!order || result.count !== 1) return { ok: false, error: "Allaqachon tasdiqlangan." };
  await writeAudit(actor, { action: "CONFIRM", entityType: "WORKSHOP_ORDER", entityId: id, entityName: orderNumber(order), summary: `${orderNumber(order)}: ombordagi kamchilikni tasdiqladi`, after: { receivedQty: order.receivedQty, receivedNote: order.receivedNote } });
  revalidatePath("/admin/customers/purchases");
  return { ok: true };
}

/** Cron: orders issued over 24 h ago and still not taken into the store → one Telegram to Super Admin, once per order. */
export async function remindUnreceived(now = new Date()) {
  const db = getDb();
  const orders = await db.workshopOrder.findMany({ where: { status: "ISSUED", noRequest: false, isTest: false, issuedAt: { lt: new Date(now.getTime() - RECEIVE_OVERDUE_MS) }, receiveRemindedAt: null }, orderBy: [{ monthKey: "asc" }, { monthNo: "asc" }], select: { id: true, monthKey: true, monthNo: true, type: true, qty: true, items: { orderBy: { order: "asc" }, select: { title: true, qty: true, issuedQty: true } } } });
  if (!orders.length) return 0;
  await notifySuperAdmins(receiveReminderText(orders.map(order => `${orderNumber(order)} ${orderTitle(order)}`)));
  await db.workshopOrder.updateMany({ where: { id: { in: orders.map(order => order.id) } }, data: { receiveRemindedAt: now } });
  return orders.length;
}
