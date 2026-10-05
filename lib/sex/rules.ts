// Sex zakazlari rules: who sees which order, who may move it to the next status, what the workshop is shown.
// Pure (no database, no "server-only"), so the tests run them directly.

export type Role = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "SELLER" | "WORKSHOP";
export type OrderStatus = "NEW" | "ACCEPTED" | "ISSUED" | "RECEIVED";
export type OrderAction = "accept" | "issue" | "receive";
export type Viewer = { id: string; role: Role | string };

export const STATUS_LABEL: Record<OrderStatus, string> = { NEW: "Yangi", ACCEPTED: "Qabul qilindi", ISSUED: "Chiqib ketdi", RECEIVED: "Krimga olindi" };
export const STATUS_TONE: Record<OrderStatus, "blue" | "yellow" | "red" | "green"> = { NEW: "blue", ACCEPTED: "yellow", ISSUED: "red", RECEIVED: "green" };
export const PURPOSE_LABEL = { SHOP: "Magazinga (vitrina)", CLIENT: "Mijozga" } as const;
export const TYPE_LABEL = { AGREGAT: "Agregat", ZAPCHAST: "Zapchast" } as const;
/** An order still "Chiqib ketdi" after this long is highlighted in red and counted in the sidebar badge. */
export const RECEIVE_OVERDUE_MS = 24 * 60 * 60 * 1000;

/** The only transitions there are, and the one role that may make each. SUPER_ADMIN only receives; the workshop never does. */
export const TRANSITIONS: Record<OrderAction, { from: OrderStatus; to: OrderStatus; role: Role }> = {
  accept: { from: "NEW", to: "ACCEPTED", role: "WORKSHOP" },
  issue: { from: "ACCEPTED", to: "ISSUED", role: "WORKSHOP" },
  receive: { from: "ISSUED", to: "RECEIVED", role: "SUPER_ADMIN" },
};

export function checkTransition(role: string, status: OrderStatus, action: OrderAction): { ok: true; to: OrderStatus } | { ok: false; error: string } {
  const rule = TRANSITIONS[action];
  if (!rule) return { ok: false, error: "Noma’lum amal." };
  if (role !== rule.role) return { ok: false, error: action === "receive" ? "Krimga olishni faqat Super Admin tasdiqlaydi." : "Bu tugma faqat sex mas’uli uchun." };
  if (status !== rule.from) return { ok: false, error: `Zakaz holati “${STATUS_LABEL[status]}” — bu amal bajarilmaydi.` };
  return { ok: true, to: rule.to };
}

/** The action a viewer can take on an order right now (one button per row), or null. */
export function actionFor(role: string, status: OrderStatus): OrderAction | null {
  return (Object.keys(TRANSITIONS) as OrderAction[]).find(action => TRANSITIONS[action].role === role && TRANSITIONS[action].from === status) ?? null;
}
export const ACTION_LABEL: Record<OrderAction, string> = { accept: "Qabul qildim", issue: "Chiqib ketdi", receive: "Krimga oldim" };

export const isStaff = (role: string) => role === "SUPER_ADMIN" || role === "ADMIN" || role === "MANAGER";
export const canCreateOrders = (role: string) => role === "SELLER" || isStaff(role);

/** Prisma `where` for the orders a viewer may list: a seller only their own, the workshop only open tasks, staff everything. */
export function orderScope(viewer: Viewer): { sellerId?: string; status?: { in: OrderStatus[] } } {
  if (viewer.role === "SELLER") return { sellerId: viewer.id };
  if (viewer.role === "WORKSHOP") return { status: { in: ["NEW", "ACCEPTED"] } };
  return {};
}
export function canViewOrder(viewer: Viewer, order: { sellerId: string; status: OrderStatus }) {
  if (viewer.role === "SELLER") return order.sellerId === viewer.id;
  if (viewer.role === "WORKSHOP") return order.status === "NEW" || order.status === "ACCEPTED";
  return isStaff(viewer.role);
}

/** Price visibility: SUPER_ADMIN sees the price-list (base) price, other staff and sellers only the selling price, the workshop nothing. */
export function priceAccess(role: string): "base" | "sale" | "none" {
  if (role === "SUPER_ADMIN") return "base";
  if (role === "WORKSHOP") return "none";
  return "sale";
}

export type PriceSnapshot = { markupPercent: number; unitBaseUsd: number; unitSaleUsd: number; totalBaseUsd: number; totalSaleUsd: number; standardBaseUsd: number | null };
type WithPrices = { priceSnapshot?: unknown; items?: Array<{ baseUsd?: unknown } & Record<string, unknown>> } & Record<string, unknown>;
/** What is sent to the browser: base prices only to SUPER_ADMIN, sale only to staff/sellers, no price fields at all to WORKSHOP. */
export function stripPrices<T extends WithPrices>(order: T, role: string) {
  const access = priceAccess(role);
  const { priceSnapshot, items, ...rest } = order;
  const snapshot = priceSnapshot as PriceSnapshot | null | undefined;
  const cleanItems = items?.map(item => { const { baseUsd, ...itemRest } = item; return access === "base" ? { ...itemRest, baseUsd } : itemRest; });
  const prices = access === "none" || !snapshot ? {} : access === "base" ? { prices: snapshot } : { prices: { unitSaleUsd: snapshot.unitSaleUsd, totalSaleUsd: snapshot.totalSaleUsd } };
  return { ...rest, ...(cleanItems ? { items: cleanItems } : {}), ...prices };
}

export const orderNumber = (number: number) => `#${String(number).padStart(4, "0")}`;
export const isReceiveOverdue = (order: { status: OrderStatus; issuedAt: Date | string | null }, now = new Date()) => order.status === "ISSUED" && !!order.issuedAt && now.getTime() - new Date(order.issuedAt).getTime() > RECEIVE_OVERDUE_MS;

const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hour12: false });
const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit" });
const fullDayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric" });
const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
export const MONTH_NAMES = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
export function tashkentParts(date: Date | string) {
  const [day, month] = dayFormat.format(new Date(date)).split("/");
  return { day: Number(day), month: Number(month) };
}
/** "05-okt" */
export function shortDay(date: Date | string) { const { day, month } = tashkentParts(date); return `${String(day).padStart(2, "0")}-${MONTHS[month - 1]}`; }
export function clock(date: Date | string) { return timeFormat.format(new Date(date)); }
/** "bugun 10:05" / "04-okt 10:05" */
export function when(date: Date | string, now = new Date()) { return `${shortDay(date) === shortDay(now) ? "bugun" : shortDay(date)} ${clock(date)}`; }
export function fullDate(date: Date | string) { return fullDayFormat.format(new Date(date)).replace(/\//g, "."); }

export type StepView = { label: string; text: string; state: "done" | "wait" | "later" };
type StepOrder = { status: OrderStatus; acceptedAt: Date | string | null; issuedAt: Date | string | null; receivedAt: Date | string | null; acceptedBy?: { name: string } | null; issuedBy?: { name: string } | null; receivedBy?: { name: string } | null };
/** "Jarayon": green = done, red = what is awaited now, grey = not yet its turn. */
export function processSteps(order: StepOrder, now = new Date()): StepView[] {
  const index = ["NEW", "ACCEPTED", "ISSUED", "RECEIVED"].indexOf(order.status);
  const step = (label: string, at: number, by: { name: string } | null | undefined, time: Date | string | null, waiting: string): StepView =>
    index >= at ? { label, text: `${by?.name ?? "—"} · ${time ? when(time, now) : ""}`.trim(), state: "done" } : index === at - 1 ? { label, text: waiting, state: "wait" } : { label, text: "—", state: "later" };
  return [
    step("Qabul qildi", 1, order.acceptedBy, order.acceptedAt, "kutilmoqda"),
    step("Chiqarib yubordi", 2, order.issuedBy, order.issuedAt, "kutilmoqda"),
    step("Krimga oldi", 3, order.receivedBy, order.receivedAt, "tasdiqlash kutilmoqda"),
  ];
}

export type MessageItem = { title: string; qty: number; issuedQty?: number | null; changes?: string[] };
export type MessageOrder = { number: number; type: "AGREGAT" | "ZAPCHAST"; purpose: "SHOP" | "CLIENT"; customerName: string | null; qty: number; dueDate: Date | string | null; note: string | null; sellerName: string; noRequest?: boolean; status: OrderStatus; acceptedByName?: string | null; acceptedAt?: Date | string | null; issuedByName?: string | null; issuedAt?: Date | string | null; receivedAt?: Date | string | null; items: MessageItem[] };
/** Workshop group message. Never contains a price. */
export function workshopMessage(order: MessageOrder) {
  const head = order.noRequest ? `📦 Zayavkasiz chiqim ${orderNumber(order.number)} — ${order.sellerName}` : `${order.type === "AGREGAT" ? "🔧 Yangi zakaz" : "📦 Yangi zayavka"} ${orderNumber(order.number)} — ${order.sellerName}`;
  const lines = [head];
  if (order.type === "AGREGAT") for (const item of order.items) { lines.push(item.title); for (const change of item.changes ?? []) lines.push(`• ${change}`); }
  else for (const item of order.items) lines.push(`• ${item.title} — ${item.issuedQty ?? item.qty}`);
  const amount = [order.type === "AGREGAT" && `Soni: ${order.qty}`, order.dueDate && `Muddat: ${fullDate(order.dueDate)}`].filter(Boolean).join(" · ");
  if (amount) lines.push(amount);
  lines.push(`Kimga: ${order.purpose === "CLIENT" ? `Mijoz — ${order.customerName ?? "—"}` : "Magazinga (vitrina)"}`);
  if (order.note) lines.push(`Izoh: ${order.note}`);
  lines.push("");
  if (order.status === "NEW") lines.push("Holat: 🆕 Yangi — qabul qilinishi kutilmoqda");
  if (order.acceptedAt) lines.push(`✅ Qabul qildi: ${order.acceptedByName ?? "—"} · ${when(order.acceptedAt)}`);
  if (order.issuedAt) lines.push(`🚚 Chiqib ketdi: ${order.issuedByName ?? "—"} · ${when(order.issuedAt)}`);
  if (order.receivedAt) lines.push(`📥 Krimga olindi · ${when(order.receivedAt)}`);
  return lines.join("\n").trim();
}
/** Inline buttons under the group message: only the next workshop step. */
export function workshopKeyboard(orderId: string, status: OrderStatus) {
  if (status === "NEW") return { inline_keyboard: [[{ text: "✅ Qabul qildim", callback_data: `ws:accept:${orderId}` }]] };
  if (status === "ACCEPTED") return { inline_keyboard: [[{ text: "🚚 Chiqib ketdi", callback_data: `ws:issue:${orderId}` }]] };
  return { inline_keyboard: [] as Array<Array<{ text: string; callback_data: string }>> };
}
export function parseWorkshopCallback(data: string | undefined): { action: "accept" | "issue"; orderId: string } | null {
  const match = data?.match(/^ws:(accept|issue):([a-z0-9]{10,40})$/i);
  return match ? { action: match[1] as "accept" | "issue", orderId: match[2] } : null;
}

/** "2026-10" → its first moment and the next month's first moment, Tashkent time (UTC+5). */
export function monthRange(value: string | undefined, now = new Date()) {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  const parts = tashkentParts(now);
  const year = match ? Number(match[1]) : Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", year: "numeric" }).format(now));
  const month = match ? Number(match[2]) : parts.month;
  const valid = month >= 1 && month <= 12;
  const y = valid ? year : now.getUTCFullYear(), m = valid ? month : now.getUTCMonth() + 1;
  return { key: `${y}-${String(m).padStart(2, "0")}`, label: `${MONTH_NAMES[m - 1]} ${y}`, from: new Date(Date.UTC(y, m - 1, 1, -5)), to: new Date(Date.UTC(y, m, 1, -5)) };
}
