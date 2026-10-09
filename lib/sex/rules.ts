// Seh zakazlari rules: who sees which order, who may move it to the next status, what the workshop is shown.
// Pure (no database, no "server-only"), so the tests run them directly.

export type Role = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "SELLER" | "WORKSHOP";
export type OrderStatus = "NEW" | "ACCEPTED" | "STARTED" | "ISSUED" | "RECEIVED" | "CANCELLED";
export type OrderAction = "accept" | "start" | "issue" | "receive";
/** Order of the stages; a transition only ever moves one step forward. */
export const STATUS_ORDER: OrderStatus[] = ["NEW", "ACCEPTED", "STARTED", "ISSUED", "RECEIVED"];
/** Stages a cancelled order may still be stopped from (never after it left the workshop). */
export const CANCELLABLE: OrderStatus[] = ["NEW", "ACCEPTED", "STARTED"];
export type Viewer = { id: string; role: Role | string };

export const STATUS_LABEL: Record<OrderStatus, string> = { NEW: "Yangi", ACCEPTED: "Navbatda", STARTED: "Terilmoqda", ISSUED: "Chiqib ketdi", RECEIVED: "Krimga olindi", CANCELLED: "Bekor qilingan" };
export const STATUS_TONE: Record<OrderStatus, "blue" | "slate" | "yellow" | "red" | "green" | "grey"> = { NEW: "blue", ACCEPTED: "slate", STARTED: "yellow", ISSUED: "red", RECEIVED: "green", CANCELLED: "grey" };
export const PURPOSE_LABEL = { SHOP: "Magazinga (vitrina)", CLIENT: "Mijozga" } as const;
export const TYPE_LABEL = { AGREGAT: "Agregat", ZAPCHAST: "Zapchast" } as const;
/** An order still "Chiqib ketdi" after this long is highlighted in red and counted in the sidebar badge. */
export const RECEIVE_OVERDUE_MS = 24 * 60 * 60 * 1000;

/** The only transitions there are, and the one role that may make each. SUPER_ADMIN only receives; the workshop never does. */
export const TRANSITIONS: Record<OrderAction, { from: OrderStatus; to: OrderStatus; role: Role }> = {
  accept: { from: "NEW", to: "ACCEPTED", role: "WORKSHOP" },
  start: { from: "ACCEPTED", to: "STARTED", role: "WORKSHOP" },
  issue: { from: "STARTED", to: "ISSUED", role: "WORKSHOP" },
  receive: { from: "ISSUED", to: "RECEIVED", role: "SUPER_ADMIN" },
};

/** Second press of the same button (site and bot at once): only the first one goes through. */
export const alreadyText = (status: OrderStatus) => `Bu zakaz allaqachon “${STATUS_LABEL[status]}” holatida.`;

export function checkTransition(role: string, status: OrderStatus, action: OrderAction): { ok: true; to: OrderStatus } | { ok: false; error: string } {
  const rule = TRANSITIONS[action];
  if (!rule) return { ok: false, error: "Noma’lum amal." };
  if (role !== rule.role) return { ok: false, error: action === "receive" ? "Krimga olishni faqat Super Admin tasdiqlaydi." : "Bu tugma faqat seh mas’uli uchun." };
  if (status !== rule.from) return { ok: false, error: alreadyText(status) };
  return { ok: true, to: rule.to };
}

/** The action a viewer can take on an order right now (one button per row), or null. */
export function actionFor(role: string, status: OrderStatus): OrderAction | null {
  return (Object.keys(TRANSITIONS) as OrderAction[]).find(action => TRANSITIONS[action].role === role && TRANSITIONS[action].from === status) ?? null;
}
/** Every action a button can send; taken from TRANSITIONS so validation never falls behind a new stage. */
export const ORDER_ACTIONS = Object.keys(TRANSITIONS) as OrderAction[];
export const ACTION_LABEL: Record<OrderAction, string> = { accept: "Qabul qildim", start: "Terishni boshladim", issue: "Chiqib ketdi", receive: "Krimga oldim" };

export const isStaff = (role: string) => role === "SUPER_ADMIN" || role === "ADMIN" || role === "MANAGER";
export const canCreateOrders = (role: string) => role === "SELLER" || isStaff(role);

/** Prisma `where` for the orders a viewer may list: a seller only their own, the workshop only open tasks, staff everything. */
export function orderScope(viewer: Viewer): { sellerId?: string; status?: { in: OrderStatus[] } } {
  if (viewer.role === "SELLER") return { sellerId: viewer.id };
  if (viewer.role === "WORKSHOP") return { status: { in: ["NEW", "ACCEPTED", "STARTED"] } };
  return {};
}
export function canViewOrder(viewer: Viewer, order: { sellerId: string; status: OrderStatus }) {
  if (viewer.role === "SELLER") return order.sellerId === viewer.id;
  if (viewer.role === "WORKSHOP") return order.status === "NEW" || order.status === "ACCEPTED" || order.status === "STARTED";
  return isStaff(viewer.role);
}

/** Price visibility: everyone who orders sees the price-list price; the workshop sees no price at all. */
export function priceAccess(role: string): "base" | "none" {
  return role === "WORKSHOP" ? "none" : "base";
}

/** Workshop orders carry only price-list prices: the workshop hands goods to the seller at prays price, the seller adds their own markup. */
export type PriceSnapshot = { unitBaseUsd: number; totalBaseUsd: number; standardBaseUsd: number | null };
const baseOnly = (snapshot: PriceSnapshot): PriceSnapshot => ({ unitBaseUsd: snapshot.unitBaseUsd, totalBaseUsd: snapshot.totalBaseUsd, standardBaseUsd: snapshot.standardBaseUsd ?? null });
type WithPrices = { priceSnapshot?: unknown; items?: Array<{ baseUsd?: unknown } & Record<string, unknown>> } & Record<string, unknown>;
/** What is sent to the browser: price-list prices only (no selling price / markup), and no price fields at all for WORKSHOP. */
export function stripPrices<T extends WithPrices>(order: T, role: string) {
  const { priceSnapshot, items, ...rest } = order;
  const snapshot = priceSnapshot as PriceSnapshot | null | undefined;
  if (priceAccess(role) === "none") return { ...rest, ...(items ? { items: items.map(item => { const { baseUsd, ...itemRest } = item; void baseUsd; return itemRest; }) } : {}) };
  return { ...rest, ...(items ? { items } : {}), ...(snapshot ? { prices: baseOnly(snapshot) } : {}) };
}

export type FormPart = { id: string; name: string; size: string | null; basePriceUsd: number | null };
/** Spare parts offered on /admin/seh/new with their price-list price. Never built for WORKSHOP (it cannot order). */
export function orderFormParts(role: string, parts: FormPart[]) {
  if (priceAccess(role) === "none") return parts.map(part => ({ id: part.id, label: [part.name, part.size].filter(Boolean).join(" ") }));
  return parts.map(part => ({ id: part.id, label: [part.name, part.size].filter(Boolean).join(" "), basePriceUsd: part.basePriceUsd }));
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
/** "bugun 10:05" / "kecha 17:05" / "04-okt 10:05" */
export function when(date: Date | string, now = new Date()) {
  const day = shortDay(date);
  return `${day === shortDay(now) ? "bugun" : day === shortDay(new Date(now.getTime() - 86_400_000)) ? "kecha" : day} ${clock(date)}`;
}
export function fullDate(date: Date | string) { return fullDayFormat.format(new Date(date)).replace(/\//g, "."); }

export type StepView = { label: string; text: string; state: "done" | "wait" | "later" };
type Person = { name: string } | null | undefined;
type StepOrder = { status: OrderStatus; acceptedAt: Date | string | null; startedAt?: Date | string | null; issuedAt: Date | string | null; receivedAt: Date | string | null; acceptedBy?: Person; startedBy?: Person; issuedBy?: Person; receivedBy?: Person };
/** "Jarayon": green = done, red = what is awaited now, grey = not yet its turn. */
export function processSteps(order: StepOrder, now = new Date()): StepView[] {
  const index = STATUS_ORDER.indexOf(order.status);
  const step = (label: string, at: number, by: Person, time: Date | string | null | undefined, waiting: string): StepView =>
    index >= at ? { label, text: `${by?.name ?? "—"} · ${time ? when(time, now) : ""}`.trim(), state: "done" } : index === at - 1 ? { label, text: waiting, state: "wait" } : { label, text: "—", state: "later" };
  return [
    step("Qabul qildi", 1, order.acceptedBy, order.acceptedAt, "kutilmoqda"),
    step("Terishni boshladi", 2, order.startedBy, order.startedAt, "navbatda"),
    step("Chiqarib yubordi", 3, order.issuedBy, order.issuedAt, "kutilmoqda"),
    step("Krimga oldi", 4, order.receivedBy, order.receivedAt, "tasdiqlash kutilmoqda"),
  ];
}

/** Queue numbers of "Navbatda" orders: 1, 2, 3… by acceptance time; starting one renumbers the rest. */
export function queuePositions(orders: Array<{ id: string; status: OrderStatus | string; acceptedAt: Date | string | null }>) {
  const waiting = orders.filter(order => order.status === "ACCEPTED").sort((a, b) => new Date(a.acceptedAt ?? 0).getTime() - new Date(b.acceptedAt ?? 0).getTime() || a.id.localeCompare(b.id));
  return new Map(waiting.map((order, index) => [order.id, index + 1]));
}

export const DEFAULT_WORKSHOP_DAILY_LIMIT = 5;
/** Start of the current Tashkent day (UTC+5, no DST) as an instant: the daily "terish boshlandi" counter resets here. */
export function tashkentDayStart(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(now);
  return new Date(Date.parse(`${day}T00:00:00Z`) - 5 * 3_600_000);
}
export function startedToday(startedAt: Array<Date | string | null>, now = new Date()) {
  const from = tashkentDayStart(now).getTime(), to = from + 86_400_000;
  return startedAt.filter(value => { if (!value) return false; const time = new Date(value).getTime(); return time >= from && time < to; }).length;
}
/** Header counter of the workshop panel: red with "kunlik limit" once the limit is reached (a warning only). */
export function dailyCapView(started: number, limit: number) {
  return started >= limit ? { tone: "red" as const, note: "kunlik limit" } : { tone: "normal" as const, note: `${limit - started} ta joy bor` };
}

/**
 * Cancelling (soft — the order stays, status CANCELLED): the seller only their own order while it is still "Yangi";
 * SUPER_ADMIN any order before it left the workshop, with a reason.
 */
export function checkCancel(role: string, status: OrderStatus, isOwnOrder: boolean, reason: string | null | undefined): { ok: true } | { ok: false; error: string } {
  if (status === "CANCELLED") return { ok: false, error: "Bu zakaz allaqachon bekor qilingan." };
  if (role === "SUPER_ADMIN") {
    if (!CANCELLABLE.includes(status)) return { ok: false, error: `“${STATUS_LABEL[status]}” holatidagi zakazni bekor qilib bo‘lmaydi.` };
    if ((reason ?? "").trim().length < 3) return { ok: false, error: "Bekor qilish sababini yozing." };
    return { ok: true };
  }
  if (role === "SELLER") {
    if (!isOwnOrder) return { ok: false, error: "Faqat o‘z zakazingizni bekor qila olasiz." };
    if (status !== "NEW") return { ok: false, error: "Seh qabul qilgan zakazni bekor qilib bo‘lmaydi — Super Admin’ga murojaat qiling." };
    return { ok: true };
  }
  return { ok: false, error: "Zakazni bekor qilish huquqi yo‘q." };
}
export const canCancel = (role: string, status: OrderStatus, isOwnOrder: boolean) =>
  (role === "SUPER_ADMIN" && CANCELLABLE.includes(status)) || (role === "SELLER" && isOwnOrder && status === "NEW");

/** Same seller sending the same thing again within this window is asked "Baribir yana yuborasizmi?". */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
export type FingerprintInput = { sellerId: string; type: "AGREGAT" | "ZAPCHAST"; purpose: "SHOP" | "CLIENT"; customerId: string | null; customerName: string | null; qty: number; items: Array<{ ref: string | null; title: string; qty: number }> };
/** What makes two orders "the same": seller, goods (product / parts and quantities), recipient, quantity. Not the note or due date. */
export function orderFingerprint(order: FingerprintInput) {
  const customer = order.purpose === "CLIENT" ? (order.customerId ?? (order.customerName ?? "").trim().toLowerCase().replace(/\s+/g, " ")) : "";
  const items = order.items.map(item => `${item.ref ?? item.title.trim().toLowerCase()}×${item.qty}`).sort().join("|");
  return [order.sellerId, order.type, order.purpose, customer, order.qty, items].join("#");
}
/** The most recent identical, not cancelled order within the window, if any. */
export function findDuplicate<T extends FingerprintInput & { number: number; createdAt: Date | string; status: OrderStatus }>(candidate: FingerprintInput, recent: T[], now = new Date()) {
  const key = orderFingerprint(candidate);
  return recent
    .filter(order => order.status !== "CANCELLED" && now.getTime() - new Date(order.createdAt).getTime() <= DUPLICATE_WINDOW_MS && orderFingerprint(order) === key)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}
export function duplicateWarning(order: { number: number; createdAt: Date | string }, now = new Date()) {
  const minutes = Math.max(1, Math.round((now.getTime() - new Date(order.createdAt).getTime()) / 60_000));
  return `⚠️ Bu zakaz ${minutes} daqiqa oldin yuborilgan (${orderNumber(order.number)}). Baribir yana yuborasizmi?`;
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

/** "35 daqiqadan beri", "2 soat 15 daqiqadan beri", "1 kun 3 soatdan beri" — how long an order has been in the workshop. */
export function workingSince(since: Date | string, now = new Date()) {
  const minutes = Math.max(1, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} daqiqadan beri`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} soat ${minutes % 60} daqiqadan beri` : `${hours} soatdan beri`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} kun ${hours % 24} soatdan beri` : `${days} kundan beri`;
}

/** Whole days past the due date (YYYY-MM-DD, Tashkent calendar day); 0 when not overdue or no due date. */
export function daysPastDue(dueDate: string | null, now = new Date()) {
  if (!dueDate) return 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(now);
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000));
}
