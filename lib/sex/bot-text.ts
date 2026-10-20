// Seh bot texts and buttons (personal chats of WORKSHOP users + the Seh group report). Pure; never contains a price.
import { shortDay, clock, type OrderStatus } from "./rules";

export type BotItem = { title: string; qty: number; issuedQty?: number | null };
export type BotOrder = {
  /** Shown "MM-NN" (orderNumber). */
  id: string; number: string; type: "AGREGAT" | "ZAPCHAST"; purpose: "SHOP" | "CLIENT"; customerName: string | null; qty: number;
  dueDate: Date | string | null; note: string | null; sellerName: string; noRequest: boolean; status: OrderStatus;
  startedAt: Date | string | null; issuedAt: Date | string | null; issuedByName: string | null;
  /** Agregat option lines as shown on the order ("Resiver: 20 L", "Kondensator: FNV200 (standart FN160 o‘rniga), rama bilan"). */
  details: string[]; items: BotItem[];
  cancelReason?: string | null;
  /** Store stage (omborchi messages). */
  receivedByName?: string | null; receivedAt?: Date | string | null; receivedQty?: number | null; receivedNote?: string | null; loadedByName?: string | null; loadedAt?: Date | string | null;
};

type Button = { text: string; callback_data: string };
export type Keyboard = { inline_keyboard: Button[][] };

const itemLines = (order: Pick<BotOrder, "type" | "qty" | "items">) => order.type === "AGREGAT"
  ? [`${order.items[0]?.title ?? "—"} ×${order.qty}`]
  : order.items.map(item => `${item.title} ×${item.issuedQty ?? item.qty}`);
const recipient = (order: Pick<BotOrder, "purpose" | "customerName">) => (order.purpose === "CLIENT" ? `Mijoz — ${order.customerName ?? "—"}` : "Vitrina");
const typeLabel = (type: BotOrder["type"]) => (type === "AGREGAT" ? "Agregat" : "Zapchast");

/** Status line under a personal order message. */
export function statusLine(order: Pick<BotOrder, "status" | "startedAt" | "issuedAt">, queue: number | null) {
  if (order.status === "ACCEPTED") return `📋 Navbatda: ${queue ?? "—"}-o‘rin`;
  if (order.status === "STARTED") return `🔧 Terilmoqda · ${order.startedAt ? clock(order.startedAt) : "—"} dan`;
  if (order.status === "ISSUED") return `✅ Chiqib ketdi ${order.issuedAt ? clock(order.issuedAt) : ""}`.trim();
  if (order.status === "RECEIVED") return "📥 Krimga olindi";
  if (order.status === "RECEIVED_STORE") return "📥 Omborga qabul qilindi";
  if (order.status === "CLIENT_LOADED") return "🚚 Mijozga yuklandi";
  return null;
}

/** Personal message to a WORKSHOP user; edited in place on every status change. */
export function personalMessage(order: BotOrder, queue: number | null) {
  const lines = [`${order.type === "AGREGAT" ? "🔧 Yangi zakaz" : "📦 Yangi zayavka"} ${order.number} · ${typeLabel(order.type)}`, ...itemLines(order)];
  if (order.type === "AGREGAT") lines.push(...order.details);
  lines.push([`Kimga: ${recipient(order)}`, `Sotuvchi: ${order.sellerName}`, order.dueDate && `Muddat: ${shortDay(order.dueDate)}`].filter(Boolean).join(" · "));
  if (order.note) lines.push(`Izoh: ${order.note}`);
  const status = order.status === "CANCELLED" ? cancelledText(order) : statusLine(order, queue);
  if (status) lines.push("", status);
  return lines.join("\n");
}

/** "❌ #0003 bekor qilindi" (+ reason): the personal message is edited to this and loses its buttons. */
export function cancelledText(order: Pick<BotOrder, "number" | "cancelReason">) {
  return `❌ ${order.number} bekor qilindi${order.cancelReason ? ` · Sabab: ${order.cancelReason}` : ""}`;
}

/** The one next step as a button: Qabul qildim → Terishni boshladim → Chiqib ketdi; nothing after that. */
export function personalKeyboard(orderId: string, status: OrderStatus): Keyboard {
  if (status === "NEW") return { inline_keyboard: [[{ text: "✅ Qabul qildim", callback_data: `seh:accept:${orderId}` }]] };
  if (status === "ACCEPTED") return { inline_keyboard: [[{ text: "🔧 Terishni boshladim", callback_data: `seh:start:${orderId}` }]] };
  if (status === "STARTED") return { inline_keyboard: [[{ text: "📦 Chiqib ketdi", callback_data: `seh:issue:${orderId}` }]] };
  return { inline_keyboard: [] };
}

/** Daily limit reached: "Baribir boshlaysizmi?" with Ha / Yo‘q. */
export function limitQuestion(started: number) { return `Bugun ${started} ta boshlangan. Baribir boshlaysizmi?`; }
export function limitKeyboard(orderId: string): Keyboard {
  return { inline_keyboard: [[{ text: "Ha", callback_data: `seh:startok:${orderId}` }, { text: "Yo‘q", callback_data: `seh:startno:${orderId}` }]] };
}

export type SehCallbackAction = "accept" | "start" | "startok" | "startno" | "issue";
/** "seh:<action>:<orderId>" (the old "ws:" buttons of the group messages are still understood). */
export function parseSehCallback(data: string | undefined): { action: SehCallbackAction; orderId: string } | null {
  const match = data?.match(/^(?:seh|ws):(accept|start|startok|startno|issue):([a-z0-9]{10,40})$/i);
  return match ? { action: match[1].toLowerCase() as SehCallbackAction, orderId: match[2] } : null;
}

/** Seh group gets only this final report, once an order is ISSUED: number, goods, for whom, who ordered, who issued, when. No buttons, no price. */
export function groupIssuedMessage(order: BotOrder) {
  const lines = [`✅ Sehdan chiqdi ${order.number}`, ...itemLines(order),
    `Kimga: ${order.purpose === "CLIENT" ? `Mijoz — ${order.customerName ?? "—"}` : "Magazin (vitrina)"}`,
    `Zayavka bergan: ${order.sellerName}`, `Seh mas’uli: ${order.issuedByName ?? "—"}`];
  if (order.issuedAt) lines.push(`Chiqdi: ${shortDay(order.issuedAt)} ${clock(order.issuedAt)}`);
  if (order.noRequest) lines.push("⚠️ Zayavkasiz chiqim");
  return lines.join("\n");
}

/** Deep-link payload: t.me/<bot>?start=seh_<code>. */
export const LINK_PREFIX = "seh_";
export const LINK_TTL_MS = 15 * 60 * 1000;
export function parseStartPayload(text: string | undefined) {
  const match = text?.trim().match(/^\/start(?:@[a-z0-9_]+)?\s+seh_([a-f0-9]{16,40})$/i);
  return match ? match[1].toLowerCase() : null;
}
export function isBotCommand(text: string | undefined, command: "navbat" | "bugun") {
  return new RegExp(`^/${command}(?:@[a-z0-9_]+)?$`, "i").test(text?.trim() ?? "");
}

/** /navbat: queue in order, then what is being assembled now. */
export function queueText(queued: Array<{ number: string; title: string; recipient: string }>, started: Array<{ number: string; title: string; since: string }>) {
  const lines = ["📋 Navbat"];
  if (!queued.length) lines.push("Navbat bo‘sh.");
  queued.forEach((order, index) => lines.push(`${index + 1}. ${order.number} · ${order.title} — ${order.recipient}`));
  lines.push("", "🔧 Terilmoqda");
  if (!started.length) lines.push("Hozir hech narsa terilmayapti.");
  for (const order of started) lines.push(`${order.number} · ${order.title} · ${order.since}`);
  return lines.join("\n");
}
/** /bugun: today's started counter and issued orders. */
export function todayText(started: number, limit: number, issued: string[]) {
  return [`📅 Bugun`, `Terish boshlandi: ${started} / ${limit}${started >= limit ? " · kunlik limit" : ""}`, `Chiqib ketdi: ${issued.length ? issued.join(", ") : "hali yo‘q"}`].join("\n");
}
export const orderTitle = (order: Pick<BotOrder, "type" | "qty" | "items">) => itemLines(order).join(", ");
export const orderRecipient = recipient;

/**
 * Who gets what for an order right now: personal messages to linked WORKSHOP chats that have none yet (new orders, or a
 * resend of an open one) and the group report only once it is ISSUED. A new order never goes to the group.
 */
export function deliveryPlan(order: Pick<BotOrder, "status" | "noRequest">, linkedChatIds: string[], alreadySent: string[], resend = false) {
  const open = order.status === "NEW" || (resend && (order.status === "ACCEPTED" || order.status === "STARTED"));
  const personal = !order.noRequest && open ? linkedChatIds.filter(chatId => !alreadySent.includes(chatId)) : [];
  return { personal, group: order.status === "ISSUED" };
}
export type DeliveryStatus = "sent" | "no-recipients" | "failed";

// ---- Omborchi (STOREKEEPER) personal messages: "Sehdan keldi — qabul qiling"; the first press wins, every copy is edited. ----
/** One text for every omborchi copy of an order; after a press it names who did it ("✓ Jasur qabul qildi"). */
export function storeMessage(order: BotOrder) {
  const lines = [`📦 ${order.number} sehdan chiqdi — qabul qiling`, ...itemLines(order), `Kimga: ${recipient(order)} · Sotuvchi: ${order.sellerName}`];
  if (order.issuedAt) lines.push(`Seh: ${order.issuedByName ?? "—"} · ${shortDay(order.issuedAt)} ${clock(order.issuedAt)}`);
  if (order.receivedAt && (order.status === "RECEIVED_STORE" || order.status === "CLIENT_LOADED")) {
    lines.push("", `✓ ${order.receivedByName ?? "—"} qabul qildi · ${clock(order.receivedAt)}`);
    if (order.receivedNote) lines.push(`⚠️ Keldi: ${order.receivedQty ?? "—"} ta · ${order.receivedNote}`);
  }
  if (order.status === "CLIENT_LOADED") lines.push(`🚚 ${order.loadedByName ?? "—"} mijozga yukladi${order.loadedAt ? ` · ${clock(order.loadedAt)}` : ""}`);
  if (order.status === "RECEIVED") lines.push("", "📥 Krimga olindi (Super Admin)");
  if (order.status === "CANCELLED") lines.push("", cancelledText(order));
  return lines.join("\n");
}
/** ISSUED: [✓ Qabul qildim] [Kamchilik bor]; a "Mijozga" order in the store: [🚚 Mijozga yuklandi]; then nothing. */
export function storeKeyboard(order: Pick<BotOrder, "id" | "status" | "purpose">): Keyboard {
  if (order.status === "ISSUED") return { inline_keyboard: [[{ text: "✓ Qabul qildim", callback_data: `omb:store:${order.id}` }, { text: "Kamchilik bor", callback_data: `omb:diff:${order.id}` }]] };
  if (order.status === "RECEIVED_STORE" && order.purpose === "CLIENT") return { inline_keyboard: [[{ text: "🚚 Mijozga yuklandi", callback_data: `omb:load:${order.id}` }]] };
  return { inline_keyboard: [] };
}
export function parseStoreCallback(data: string | undefined): { action: "store" | "diff" | "load"; orderId: string } | null {
  const match = data?.match(/^omb:(store|diff|load):([a-z0-9]{10,40})$/i);
  return match ? { action: match[1].toLowerCase() as "store" | "diff" | "load", orderId: match[2] } : null;
}
