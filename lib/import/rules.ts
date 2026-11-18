// Import buyurtma: pure rules shared by the pages, server actions, Excel and the tests (no server-only).

export type ImportStatus = "PENDING" | "APPROVED" | "RETURNED" | "REJECTED" | "SENT";
export type Decision = "approve" | "return" | "reject";

export const importNumber = (n: number) => `IMP-${String(n).padStart(4, "0")}`;

export const STATUS_LABEL: Record<ImportStatus, string> = { PENDING: "Tasdiq kutilmoqda", APPROVED: "Tasdiqlandi", RETURNED: "Qaytarildi", REJECTED: "Rad etildi", SENT: "Zavodga yuborildi" };
export const STATUS_TONE: Record<ImportStatus, string> = { PENDING: "p3", APPROVED: "p2", RETURNED: "p4", REJECTED: "p4", SENT: "p5" };
export const TYPE_LABEL: Record<string, string> = { elektr: "⚡ Elektr", gaz: "🔥 Gaz", boshqa: "Boshqa" };

/** Who may open /admin/import (SELLER and above; the workshop and the store keeper do not order imports). */
export const canUseImport = (role: string) => role !== "WORKSHOP" && role !== "STOREKEEPER";
/** Prices and decisions: SUPER_ADMIN and the approver chosen in Sozlamalar. */
export const canApprove = (user: { id: string; role: string }, approverId: string | null | undefined) => user.role === "SUPER_ADMIN" || (!!approverId && user.id === approverId);
export const canSeeFlag = (role: string) => role === "SUPER_ADMIN" || role === "ADMIN";

type ProductRow = { id: string; code: string; groupEn: string; nameEn: string; nameUz: string; model: string; type: string; specs: unknown; imageUrl: string | null; catPage: string | null; flag: string | null; priceAmount: unknown; priceCurrency: string | null; moq: number | null; catalogId: string };
export type ImportSpec = { en: string; value: string; uz: string; value_uz: string };
export type ProductView = Omit<ProductRow, "flag" | "priceAmount" | "priceCurrency" | "specs"> & { specs: ImportSpec[]; flag?: string | null; price?: number | null; priceCurrency?: string | null };

/** What a viewer may receive: price and flag are left out of the object entirely (not nulled) unless allowed. */
export function productView(row: ProductRow, see: { price: boolean; flag: boolean }): ProductView {
  const { flag, priceAmount, priceCurrency, specs, ...rest } = row;
  return {
    ...rest, specs: Array.isArray(specs) ? specs as ImportSpec[] : [],
    ...(see.flag ? { flag } : {}),
    ...(see.price ? { price: priceAmount == null ? null : Number(priceAmount), priceCurrency } : {}),
  };
}

// ── Cart (client, localStorage) ──
export type CartLine = { qty: number; code: string; name: string; model: string };
export type Cart = Record<string, CartLine>;
export const MAX_QTY = 99999;
/** Typed or ± quantity; 0 (or junk) removes the line. */
export function cartSet(cart: Cart, productId: string, qty: unknown, line?: Omit<CartLine, "qty">): Cart {
  const n = Math.min(MAX_QTY, Math.max(0, Math.floor(Number(qty)) || 0));
  const next = { ...cart };
  if (!n) delete next[productId];
  else if (next[productId] || line) next[productId] = { ...(next[productId] ?? line!), qty: n };
  return next;
}
export const cartStep = (cart: Cart, productId: string, delta: number, line?: Omit<CartLine, "qty">) => cartSet(cart, productId, (cart[productId]?.qty ?? 0) + delta, line);
export const cartTotal = (cart: Cart) => Object.values(cart).reduce((sum, line) => sum + line.qty, 0);
export function parseCart(raw: string | null): Cart {
  try {
    const value = JSON.parse(raw ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, CartLine>).filter(([, line]) => line && Number.isInteger(line.qty) && line.qty > 0 && line.qty <= MAX_QTY && typeof line.code === "string"));
  } catch { return {}; }
}

// ── Decisions ──
const TARGET: Record<Decision, ImportStatus> = { approve: "APPROVED", return: "RETURNED", reject: "REJECTED" };
/** Same decision twice is a no-op ("already"); any decision on a non-PENDING order is refused. */
export function decisionStep(current: ImportStatus, decision: Decision): { ok: true; to: ImportStatus; already: boolean } | { ok: false; error: string } {
  const to = TARGET[decision];
  if (current === to) return { ok: true, to, already: true };
  if (current !== "PENDING") return { ok: false, error: `Zayavka allaqachon: ${STATUS_LABEL[current].toLowerCase()}.` };
  return { ok: true, to, already: false };
}
export const effectiveQty = (item: { qty: number; approvedQty: number | null }) => item.approvedQty ?? item.qty;

/** "2026-12-20" → Date (UTC midnight) or null; anything else → undefined (invalid). */
export function parseNeededBy(text: string | null | undefined): Date | null | undefined {
  const value = (text ?? "").trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date;
}

// ── Boss summary: APPROVED orders → agent → catalog ──
export type SummaryItem = { qty: number; approvedQty: number | null; product: { code: string; model: string; nameEn: string; nameUz: string; priceAmount: unknown; priceCurrency: string | null; catalog: { id: string; title: string; code: string; agent: { name: string; country: string; currency: string } } } };
export type SummaryOrder = { id: string; number: number; client: string | null; seller: { name: string }; items: SummaryItem[] };
export type CatalogLine = { code: string; model: string; nameEn: string; nameUz: string; qty: number; price: number | null; amount: number | null; seller: string; client: string; order: string };
export type CatalogGroup = { catalogId: string; title: string; code: string; agent: string; country: string; currency: string; lines: CatalogLine[]; orders: number; positions: number; qty: number; amount: number; unpriced: number };

export function summarize(orders: SummaryOrder[]): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup & { orderIds: Set<string>; codes: Set<string> }>();
  for (const order of orders) for (const item of order.items) {
    const { product } = item, { catalog } = product;
    let group = groups.get(catalog.id);
    if (!group) groups.set(catalog.id, group = { catalogId: catalog.id, title: catalog.title, code: catalog.code, agent: catalog.agent.name, country: catalog.agent.country, currency: catalog.agent.currency, lines: [], orders: 0, positions: 0, qty: 0, amount: 0, unpriced: 0, orderIds: new Set(), codes: new Set() });
    // A price in another currency than the catalog's is not added into its total (counted as "narxsiz").
    const qty = effectiveQty(item), price = product.priceAmount == null || (product.priceCurrency && product.priceCurrency !== group.currency) ? null : Number(product.priceAmount);
    const amount = price == null ? null : Math.round(price * qty * 100) / 100;
    group.lines.push({ code: product.code, model: product.model, nameEn: product.nameEn, nameUz: product.nameUz, qty, price, amount, seller: order.seller.name, client: order.client ?? "", order: importNumber(order.number) });
    group.orderIds.add(order.id); group.codes.add(product.code);
    group.qty += qty;
    if (amount == null) group.unpriced++; else group.amount = Math.round((group.amount + amount) * 100) / 100;
  }
  return [...groups.values()].sort((a, b) => a.agent.localeCompare(b.agent) || a.title.localeCompare(b.title))
    .map(({ orderIds, codes, ...group }) => ({ ...group, orders: orderIds.size, positions: codes.size }));
}

/** Factory sheet: one line per product (sellers / clients merged away). */
export function factoryLines(group: CatalogGroup) {
  const byCode = new Map<string, { code: string; model: string; nameEn: string; qty: number; price: number | null }>();
  for (const line of group.lines) {
    const row = byCode.get(line.code);
    if (row) row.qty += line.qty; else byCode.set(line.code, { code: line.code, model: line.model, nameEn: line.nameEn, qty: line.qty, price: line.price });
  }
  return [...byCode.values()];
}
