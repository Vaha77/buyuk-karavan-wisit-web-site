import "server-only";
import { revalidatePath } from "next/cache";
import { Prisma, type AdminUser } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit/service";
import { getDb } from "@/lib/db";
import { getPraysProducts, getSexParts } from "@/lib/prays/queries";
import { editMessageText, sendMessage, telegramErrorDetails, telegramWorkshopChatId } from "@/lib/telegram/client";
import type { TelegramCallbackQuery } from "@/lib/telegram/types";
import { STATUS_LABEL, checkTransition, orderNumber, parseWorkshopCallback, workshopKeyboard, workshopMessage, type OrderAction, type OrderStatus, type PriceSnapshot } from "./rules";
import { buildZborkaCatalog, quoteZborka, type Assembly } from "./zborka";

type Actor = Pick<AdminUser, "id" | "name" | "role" | "salesPersonId">;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function loadZborkaCatalog() {
  const [products, parts] = await Promise.all([getPraysProducts(), getSexParts()]);
  return buildZborkaCatalog(products, parts);
}

const money = (value: number) => new Prisma.Decimal(value.toFixed(2));
const orderInclude = {
  seller: { select: { name: true } }, acceptedBy: { select: { name: true } }, issuedBy: { select: { name: true } }, receivedBy: { select: { name: true } },
  items: { orderBy: { order: "asc" as const } },
};

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

export type AgregatInput = OrderCommon & { groupKey: string; modelKey: string; assembly: Assembly; liters: string | null; hp: string | null; fn: string | null; qty: number };
export async function createAgregatOrder(actor: Actor, input: AgregatInput): Promise<Result<{ id: string; number: number }>> {
  const catalog = await loadZborkaCatalog();
  const group = catalog.groups.find(item => item.key === input.groupKey), model = group?.models.find(item => item.key === input.modelKey);
  if (!group || !model) return { ok: false, error: "Kompressor praysda topilmadi." };
  const quote = quoteZborka(model, group, catalog.receivers, { assembly: input.assembly, liters: input.liters, hp: input.hp, fn: input.fn });
  if (!quote.ok) return quote;
  const customer = await resolveCustomer(actor, input);
  if (!customer.ok) return customer;
  const snapshot: PriceSnapshot = { unitBaseUsd: quote.base, totalBaseUsd: Math.round(quote.base * input.qty * 100) / 100, standardBaseUsd: quote.standard };
  const order = await getDb().workshopOrder.create({
    data: {
      type: "AGREGAT", purpose: input.purpose, customerId: customer.customerId, customerName: customer.customerName, qty: input.qty, dueDate: dueDateOf(input.dueDate), note: input.note,
      sellerId: actor.id, createdById: actor.id, priceSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      items: { create: [{ kind: "PRODUCT", productId: quote.product.id, title: quote.title, qty: input.qty, baseUsd: money(quote.base), changedFromStandard: quote.changes.length > 0, options: { assembly: input.assembly, ...quote.options, standard: { liters: model.liters, hp: model.hp, fn: model.fn }, changes: quote.telegram, priceList: group.label } as Prisma.InputJsonValue }] },
    },
  });
  await afterCreate(actor, order.id, `${orderNumber(order.number)} zborka zakazini berdi`, { title: quote.title, qty: input.qty, purpose: input.purpose, customer: customer.customerName, changes: quote.changes.length });
  return { ok: true, id: order.id, number: order.number };
}

export type ZapchastInput = OrderCommon & { items: Array<{ partId: string; qty: number }> };
/** Spare-part request; `noRequestFor` = "Zayavkasiz chiqim" by the workshop for that seller (already handed out → ISSUED). */
export async function createZapchastOrder(actor: Actor, input: ZapchastInput, noRequestFor?: string): Promise<Result<{ id: string; number: number }>> {
  const ids = [...new Set(input.items.map(item => item.partId))];
  const parts = await getDb().sexPart.findMany({ where: { id: { in: ids }, active: true } });
  const byId = new Map(parts.map(part => [part.id, part]));
  if (!input.items.length || input.items.some(item => !byId.has(item.partId))) return { ok: false, error: "Sex mahsulotini tanlang." };
  const customer = await resolveCustomer(actor, input);
  if (!customer.ok) return customer;
  let sellerId = actor.id;
  if (noRequestFor) {
    const seller = await getDb().adminUser.findFirst({ where: { id: noRequestFor, role: "SELLER", isActive: true }, select: { id: true } });
    if (!seller) return { ok: false, error: "Sotuvchini tanlang." };
    sellerId = seller.id;
  }
  const known = input.items.filter(item => byId.get(item.partId)!.basePriceUsd !== null);
  const totalBase = Math.round(known.reduce((sum, item) => sum + Number(byId.get(item.partId)!.basePriceUsd) * item.qty, 0) * 100) / 100;
  const snapshot = { unitBaseUsd: totalBase, totalBaseUsd: totalBase, standardBaseUsd: null, missingPrices: input.items.length - known.length };
  const now = new Date();
  const order = await getDb().workshopOrder.create({
    data: {
      type: "ZAPCHAST", purpose: input.purpose, customerId: customer.customerId, customerName: customer.customerName, qty: 1, dueDate: dueDateOf(input.dueDate), note: input.note,
      sellerId, createdById: actor.id, priceSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      ...(noRequestFor ? { noRequest: true, status: "ISSUED" as const, acceptedById: actor.id, acceptedAt: now, issuedById: actor.id, issuedAt: now } : {}),
      items: { create: input.items.map((item, index) => { const part = byId.get(item.partId)!; return { kind: "PART" as const, partId: part.id, title: [part.name, part.size].filter(Boolean).join(" "), qty: item.qty, baseUsd: part.basePriceUsd, order: index }; }) },
    },
  });
  await afterCreate(actor, order.id, noRequestFor ? `${orderNumber(order.number)} zayavkasiz chiqimni yozdi` : `${orderNumber(order.number)} zapchast zayavkasini berdi`, { items: input.items.length, purpose: input.purpose, customer: customer.customerName, noRequest: !!noRequestFor });
  return { ok: true, id: order.id, number: order.number };
}

async function afterCreate(actor: Actor, id: string, summary: string, after: Record<string, unknown>) {
  await writeAudit(actor, { action: "CREATE", entityType: "WORKSHOP_ORDER", entityId: id, summary, after });
  await postToWorkshop(id);
  revalidatePath("/admin/sex");
}

async function loadMessageOrder(id: string) {
  const order = await getDb().workshopOrder.findUnique({ where: { id }, include: orderInclude });
  if (!order) return null;
  const message = workshopMessage({
    number: order.number, type: order.type, purpose: order.purpose, customerName: order.customerName, qty: order.qty, dueDate: order.dueDate, note: order.note, sellerName: order.seller.name, noRequest: order.noRequest, status: order.status,
    acceptedByName: order.acceptedBy?.name, acceptedAt: order.acceptedAt, issuedByName: order.issuedBy?.name, issuedAt: order.issuedAt, receivedAt: order.receivedAt,
    items: order.items.map(item => ({ title: item.title, qty: item.qty, issuedQty: item.issuedQty, changes: Array.isArray((item.options as { changes?: unknown } | null)?.changes) ? ((item.options as { changes: string[] }).changes).filter(change => /o‘rniga/.test(change)) : [] })),
  });
  return { order, message };
}

/** New order → workshop group with "Qabul qildim". Failures are logged; the order itself is already saved. */
async function postToWorkshop(id: string) {
  const chatId = telegramWorkshopChatId();
  if (!chatId) return;
  try {
    const loaded = await loadMessageOrder(id);
    if (!loaded) return;
    const sent = await sendMessage(chatId, loaded.message, workshopKeyboard(id, loaded.order.status));
    await getDb().workshopOrder.update({ where: { id }, data: { telegramChatId: String(sent.chat.id), telegramMessageId: sent.message_id } });
  } catch (error) { console.error("Workshop order Telegram post failed", telegramErrorDetails(error)); }
}
/** Status changed (on the site or in Telegram) → the group message shows it and keeps only the next button. */
async function syncWorkshopMessage(id: string) {
  try {
    const loaded = await loadMessageOrder(id);
    if (!loaded?.order.telegramChatId || !loaded.order.telegramMessageId) return;
    await editMessageText(loaded.order.telegramChatId, loaded.order.telegramMessageId, loaded.message, workshopKeyboard(id, loaded.order.status));
  } catch (error) { console.error("Workshop order Telegram edit failed", telegramErrorDetails(error)); }
}

const ACTOR_FIELDS: Record<OrderAction, "accepted" | "issued" | "received"> = { accept: "accepted", issue: "issued", receive: "received" };
/** The only way an order changes status (site buttons and Telegram buttons both end here). */
export async function transitionOrder(actor: Actor, id: string, action: OrderAction, issuedQty?: Record<string, number>): Promise<Result<{ status: OrderStatus }>> {
  const db = getDb();
  const order = await db.workshopOrder.findUnique({ where: { id }, select: { id: true, number: true, status: true, items: { select: { id: true, qty: true } } } });
  if (!order) return { ok: false, error: "Zakaz topilmadi." };
  const check = checkTransition(actor.role, order.status, action);
  if (!check.ok) return check;
  const field = ACTOR_FIELDS[action], now = new Date();
  const corrections = action === "issue" && issuedQty ? order.items.filter(item => issuedQty[item.id] !== undefined && issuedQty[item.id] !== item.qty) : [];
  if (corrections.some(item => !Number.isInteger(issuedQty![item.id]) || issuedQty![item.id] < 0 || issuedQty![item.id] > 9999)) return { ok: false, error: "Berilgan sonni to‘g‘ri kiriting." };
  const moved = await db.$transaction(async tx => {
    const result = await tx.workshopOrder.updateMany({ where: { id, status: order.status }, data: { status: check.to, [`${field}ById`]: actor.id, [`${field}At`]: now } });
    if (result.count !== 1) return false;
    for (const item of corrections) await tx.workshopOrderItem.update({ where: { id: item.id }, data: { issuedQty: issuedQty![item.id] } });
    return true;
  });
  if (!moved) return { ok: false, error: "Zakaz holati allaqachon o‘zgargan — sahifani yangilang." };
  await writeAudit(actor, { action: "STATUS_CHANGE", entityType: "WORKSHOP_ORDER", entityId: id, entityName: orderNumber(order.number), summary: `${orderNumber(order.number)}: ${STATUS_LABEL[order.status]} → ${STATUS_LABEL[check.to]}`, before: { status: order.status }, after: { status: check.to, ...(corrections.length ? { issuedQty: Object.fromEntries(corrections.map(item => [item.id, issuedQty![item.id]])) } : {}) } });
  await syncWorkshopMessage(id);
  revalidatePath("/admin/sex");
  return { ok: true, status: check.to };
}

/** A seller confirms a "Zayavkasiz chiqim" written in their name. */
export async function confirmNoRequest(actor: Actor, id: string): Promise<Result> {
  const result = await getDb().workshopOrder.updateMany({ where: { id, sellerId: actor.id, noRequest: true, sellerConfirmedAt: null }, data: { sellerConfirmedAt: new Date() } });
  if (result.count !== 1) return { ok: false, error: "Zakaz topilmadi yoki allaqachon tasdiqlangan." };
  await writeAudit(actor, { action: "CONFIRM", entityType: "WORKSHOP_ORDER", entityId: id, summary: "Zayavkasiz chiqimni tasdiqladi", before: { sellerConfirmed: false }, after: { sellerConfirmed: true } });
  revalidatePath("/admin/sex");
  return { ok: true };
}

/** "Qabul qildim" / "Chiqib ketdi" pressed in the workshop group. Only a WORKSHOP user whose Telegram id is on their account may press. */
export async function handleWorkshopCallback(callback: TelegramCallbackQuery) {
  const parsed = parseWorkshopCallback(callback.data);
  if (!parsed) return false;
  const reply = (text: string) => sendMessage(String(callback.from.id), text).catch(error => console.error("Workshop callback reply failed", telegramErrorDetails(error)));
  const chatId = telegramWorkshopChatId();
  if (!chatId || !callback.message || String(callback.message.chat.id) !== chatId) return true;
  const user = await getDb().adminUser.findUnique({ where: { telegramChatId: String(callback.from.id) } });
  if (!user || user.role !== "WORKSHOP" || !user.isActive || user.approvalStatus !== "APPROVED") { await reply("Bu tugmani faqat admin panelda Telegram ID si kiritilgan sex mas’uli bosa oladi."); return true; }
  const result = await transitionOrder(user, parsed.orderId, parsed.action);
  if (!result.ok) await reply(result.error);
  return true;
}
