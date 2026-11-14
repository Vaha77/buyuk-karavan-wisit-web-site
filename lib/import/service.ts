import "server-only";
import type { AdminUser, Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { sendMessage } from "@/lib/telegram/client";
import { SITE_URL } from "@/lib/site-url";
import { canApprove, canSeeFlag, decisionStep, effectiveQty, importNumber, productView, type Decision, type ImportStatus } from "./rules";

type Viewer = Pick<AdminUser, "id" | "role" | "name">;
const log = (what: string) => (error: unknown) => console.error(`[import] ${what}`, { name: error instanceof Error ? error.name : "UnknownError" });

export async function importApproverId() {
  return (await getDb().siteSettings.findUnique({ where: { id: "global" }, select: { importApproverId: true } }).catch(() => null))?.importApproverId ?? null;
}
export async function viewerRights(user: Viewer) {
  const approverId = await importApproverId();
  return { approve: canApprove(user, approverId), flag: canSeeFlag(user.role) };
}

// ── Catalog ──
export type Filters = { q?: string; cat?: string; group?: string; type?: string };

/** Category tree with catalogs under their category; `cat` may be a category (all descendants) or a catalog id. */
export async function catalogTree() {
  const db = getDb();
  const [categories, catalogs] = await Promise.all([
    db.importCategory.findMany({ select: { id: true, nameUz: true, parentId: true }, orderBy: [{ sort: "asc" }, { nameUz: "asc" }] }),
    db.importCatalog.findMany({ select: { id: true, title: true, code: true, categoryId: true, agent: { select: { name: true } } }, orderBy: { title: "asc" } }),
  ]);
  return { categories, catalogs };
}
export function catalogIdsFor(tree: Awaited<ReturnType<typeof catalogTree>>, cat: string | undefined) {
  if (!cat) return null;
  if (tree.catalogs.some(catalog => catalog.id === cat)) return [cat];
  const ids = new Set([cat]);
  for (let grew = true; grew;) { grew = false; for (const c of tree.categories) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); grew = true; } }
  return tree.catalogs.filter(catalog => ids.has(catalog.categoryId)).map(catalog => catalog.id);
}

const PRODUCT_SELECT = { id: true, code: true, catalogId: true, groupEn: true, nameEn: true, nameUz: true, model: true, type: true, specs: true, imageUrl: true, catPage: true, flag: true, priceAmount: true, priceCurrency: true, moq: true } satisfies Prisma.ImportProductSelect;

export async function listProducts(user: Viewer, filters: Filters) {
  const [tree, rights] = await Promise.all([catalogTree(), viewerRights(user)]);
  const ids = catalogIdsFor(tree, filters.cat);
  const q = filters.q?.trim().slice(0, 80);
  const where: Prisma.ImportProductWhereInput = {
    active: true,
    ...(ids ? { catalogId: { in: ids } } : {}),
    ...(filters.group ? { groupEn: filters.group } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(q ? { OR: (["code", "model", "nameEn", "nameUz"] as const).map(field => ({ [field]: { contains: q, mode: "insensitive" as const } })) } : {}),
  };
  const [rows, groups] = await Promise.all([
    getDb().importProduct.findMany({ where, select: PRODUCT_SELECT, orderBy: [{ catPage: "asc" }, { code: "asc" }], take: 1000 }),
    getDb().importProduct.findMany({ where: { active: true, ...(ids ? { catalogId: { in: ids } } : {}) }, distinct: ["groupEn"], select: { groupEn: true }, orderBy: { groupEn: "asc" } }),
  ]);
  return { tree, rights, groups: groups.map(row => row.groupEn), products: rows.map(row => productView(row, { price: rights.approve, flag: rights.flag })) };
}

// ── Orders ──
const ORDER_INCLUDE = { seller: { select: { name: true } }, items: { include: { product: { select: { id: true, code: true, model: true, nameEn: true, nameUz: true, priceAmount: true, priceCurrency: true, catalog: { select: { id: true, title: true, code: true, agent: { select: { name: true, country: true, currency: true } } } } } } } } } satisfies Prisma.ImportOrderInclude;

/** Seller's own orders; product prices removed. */
export async function myOrders(user: Viewer) {
  const product = { select: { ...ORDER_INCLUDE.items.include.product.select, priceAmount: false, priceCurrency: false } };
  return getDb().importOrder.findMany({ where: { sellerId: user.id }, include: { ...ORDER_INCLUDE, items: { include: { product } } }, orderBy: { createdAt: "desc" }, take: 100 });
}
/** `decidedBefore`: the Excel holds exactly the orders the boss saw on the page (a later approval waits for the next batch). */
export const ordersWithStatus = (status: ImportStatus, decidedBefore?: Date) => getDb().importOrder.findMany({ where: { status, ...(decidedBefore ? { decidedAt: { lte: decidedBefore } } : {}) }, include: ORDER_INCLUDE, orderBy: { createdAt: "asc" }, take: 500 });

/** Sidebar: whether "Tasdiqlash" is shown and how many orders wait (errors → hidden, never a broken page). */
export async function importBadge(user: Viewer) {
  if (!canApprove(user, await importApproverId())) return { importApprover: false, importPending: 0 };
  return { importApprover: true, importPending: await getDb().importOrder.count({ where: { status: "PENDING" } }).catch(() => 0) };
}

export type OrderInput = { items: Array<{ productId: string; qty: number }>; client: string | null; neededBy: Date | null; comment: string | null; requestId?: string | null };

async function checkedItems(items: OrderInput["items"]) {
  const merged = new Map<string, number>();
  for (const item of items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.qty);
  const found = await getDb().importProduct.count({ where: { id: { in: [...merged.keys()] }, active: true } });
  return found === merged.size ? [...merged].map(([productId, qty]) => ({ productId, qty })) : null;
}

export async function createOrder(user: Viewer, input: OrderInput): Promise<{ ok: true; number: string } | { ok: false; error: string }> {
  const items = await checkedItems(input.items);
  if (!items) return { ok: false, error: "Ba’zi tovarlar katalogda yo‘q — savatchani yangilang." };
  const repeated = () => input.requestId ? getDb().importOrder.findFirst({ where: { requestId: input.requestId, sellerId: user.id }, select: { number: true } }) : null;
  const before = await repeated();
  if (before) return { ok: true, number: importNumber(before.number) };
  let order;
  try {
    order = await getDb().importOrder.create({ data: { sellerId: user.id, requestId: input.requestId ?? null, client: input.client, neededBy: input.neededBy, comment: input.comment, items: { create: items } }, include: ORDER_INCLUDE });
  } catch (error) {
    // A double press raced past the check above: the unique requestId stops the second order.
    const raced = (error as { code?: string }).code === "P2002" ? await repeated() : null;
    if (raced) return { ok: true, number: importNumber(raced.number) };
    throw error;
  }
  await notifyApprover(order, false).catch(log("approver notice failed"));
  return { ok: true, number: importNumber(order.number) };
}

/** A RETURNED order edited by its seller goes back to PENDING with the new lines. */
export async function resubmitOrder(user: Viewer, orderId: string, input: OrderInput): Promise<{ ok: true; number: string } | { ok: false; error: string }> {
  const items = await checkedItems(input.items);
  if (!items) return { ok: false, error: "Ba’zi tovarlar katalogda yo‘q — savatchani yangilang." };
  const order = await getDb().$transaction(async tx => {
    const claimed = await tx.importOrder.updateMany({ where: { id: orderId, sellerId: user.id, status: "RETURNED" }, data: { status: "PENDING", client: input.client, neededBy: input.neededBy, comment: input.comment, decidedAt: null, approverId: null } });
    if (!claimed.count) return null;
    await tx.importOrderItem.deleteMany({ where: { orderId } });
    await tx.importOrderItem.createMany({ data: items.map(item => ({ ...item, orderId })) });
    return tx.importOrder.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  });
  if (!order) {
    // A double press: the first one already sent it back to PENDING.
    const own = await getDb().importOrder.findFirst({ where: { id: orderId, sellerId: user.id, status: "PENDING" }, select: { number: true } });
    return own ? { ok: true, number: importNumber(own.number) } : { ok: false, error: "Faqat qaytarilgan o‘z zayavkangizni qayta yubora olasiz." };
  }
  await notifyApprover(order, true).catch(log("approver notice failed"));
  return { ok: true, number: importNumber(order.number) };
}

/** Approver's decision; idempotent (a second press of the same button changes nothing and sends nothing). */
export async function decideOrder(user: Viewer, orderId: string, decision: Decision, note: string | null, quantities: Record<string, number> = {}): Promise<{ ok: true; already: boolean } | { ok: false; error: string }> {
  if (!canApprove(user, await importApproverId())) return { ok: false, error: "Faqat tasdiqlovchi yoki Super Admin." };
  if (decision === "return" && !note) return { ok: false, error: "Qaytarish sababini yozing." };
  const db = getDb();
  const current = await db.importOrder.findUnique({ where: { id: orderId }, select: { status: true, items: { select: { id: true } } } });
  if (!current) return { ok: false, error: "Zayavka topilmadi." };
  const step = decisionStep(current.status, decision);
  if (!step.ok) return step;
  if (step.already) return { ok: true, already: true };
  const changed = await db.$transaction(async tx => {
    const claimed = await tx.importOrder.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: step.to, approverId: user.id, decidedAt: new Date(), decisionNote: note } });
    if (!claimed.count) return false;
    if (decision === "approve") for (const item of current.items) {
      const qty = quantities[item.id];
      if (Number.isInteger(qty) && qty >= 0) await tx.importOrderItem.update({ where: { id: item.id }, data: { approvedQty: qty } });
    }
    return true;
  });
  if (!changed) return { ok: true, already: true }; // a parallel press won
  // The decision is saved; a failed notice must not turn it into an error.
  const order = await db.importOrder.findUnique({ where: { id: orderId }, include: { ...ORDER_INCLUDE, seller: { select: { name: true, telegramChatId: true } } } }).catch(() => null);
  if (order?.seller.telegramChatId) {
    const head = { approve: "✅ tasdiqlandi", return: "↩ qaytarildi", reject: "✕ rad etildi" }[decision];
    const changedLines = order.items.filter(item => item.approvedQty != null && item.approvedQty !== item.qty).map(item => `• ${item.product.model}: ${item.qty} → ${item.approvedQty}`);
    const text = [`🌍 ${importNumber(order.number)} ${head}`, note ? `Izoh: ${note}` : "", ...changedLines].filter(Boolean).join("\n");
    await sendMessage(order.seller.telegramChatId, text, { inline_keyboard: [[{ text: "Saytda ochish", url: `${SITE_URL}/admin/import/my` }]] }).catch(log("seller notice failed"));
  }
  return { ok: true, already: false };
}

/** "Zavodga yuborildi": exactly the APPROVED orders the boss saw (a later approval is not swept along). */
export async function markSent(orderIds: string[]) {
  const result = await getDb().importOrder.updateMany({ where: { id: { in: orderIds }, status: "APPROVED" }, data: { status: "SENT", sentAt: new Date() } });
  return result.count;
}

type NotifyOrder = { number: number; client: string | null; neededBy: Date | null; comment: string | null; seller: { name: string }; items: Array<{ qty: number; approvedQty: number | null; product: { model: string; nameUz: string } }> };
async function notifyApprover(order: NotifyOrder, again: boolean) {
  const approverId = await importApproverId();
  const to = approverId ? await getDb().adminUser.findFirst({ where: { id: approverId, isActive: true, archivedAt: null }, select: { telegramChatId: true } }) : null;
  if (!to?.telegramChatId) return;
  const lines = order.items.slice(0, 20).map(item => `• ${item.product.model} — ${item.product.nameUz} × ${effectiveQty(item)}`);
  if (order.items.length > 20) lines.push(`… yana ${order.items.length - 20} ta`);
  const text = [`🌍 ${again ? "Qayta yuborildi" : "Yangi import zayavka"}: ${importNumber(order.number)}`, `Sotuvchi: ${order.seller.name} · ${order.items.length} pozitsiya`, ...lines,
    order.client ? `Mijoz: ${order.client}` : "", order.neededBy ? `Muddat: ${order.neededBy.toISOString().slice(0, 10)}` : "", order.comment ? `Izoh: ${order.comment}` : ""].filter(Boolean).join("\n");
  await sendMessage(to.telegramChatId, text.slice(0, 4000), { inline_keyboard: [[{ text: "Tasdiqlash sahifasi", url: `${SITE_URL}/admin/import/tasdiq` }]] }).catch(log("approver notice failed"));
}
