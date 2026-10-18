// Admin "Qidirish": what each role may find, as Prisma filters. Pure, tested; the server runs it (lib/search/service.ts).
import { customerScope } from "../customers/seller-repo";
import { normalizeUzPhone } from "../auth/phone";

export type SearchUser = { id: string; role: string; salesPersonId: string | null };
const STAFF = ["SUPER_ADMIN", "ADMIN", "MANAGER"];

/** Phone part to look for in stored "+998…" numbers: spaces, dashes and +998 do not matter. Null = not a phone query. */
export function phoneDigits(query: string) {
  const full = normalizeUzPhone(query);
  if (full) return full.slice(1);
  const digits = query.replace(/\D/g, "");
  return digits.length >= 3 && digits.length >= query.replace(/[\s()+\-.]/g, "").length ? digits.replace(/^998(?=\d{3})/, "") : null;
}

/** null = this group is not searched for the role. Sellers only see their own rows; the workshop only orders and goods. */
export function searchPlan(user: SearchUser, query: string, agentId: string | null) {
  const text = query.trim(), digits = phoneDigits(text), staff = STAFF.includes(user.role), seller = user.role === "SELLER", workshop = user.role === "WORKSHOP";
  const contains = (field: string) => ({ [field]: { contains: text, mode: "insensitive" as const } });
  const number = Number(text.replace(/^#|^kp-?/i, "")), byNumber = Number.isInteger(number) && number > 0 && number < 1e9 ? [{ number }] : [];
  return {
    customers: staff || seller ? { AND: [customerScope({ role: user.role, salesPersonId: user.salesPersonId }), { OR: [contains("name"), ...(digits ? [{ phoneNormalized: { contains: digits } }] : [])] }] } : null,
    leads: staff || (seller && agentId) ? { AND: [seller ? { assignedAgentId: agentId } : {}, { OR: [contains("customerName"), ...(digits ? [{ phone: { contains: digits } }] : [])] }] } : null,
    orders: staff || seller || workshop ? { AND: [seller ? { sellerId: user.id } : {}, { OR: [...byNumber, { items: { some: contains("title") } }, contains("customerName")] }] } : null,
    products: staff || workshop ? { archivedAt: null, OR: [contains("model"), contains("name")] } : null,
    // Offers have pages only in the seller cabinet.
    offers: seller ? { AND: [{ sellerId: user.id }, { OR: [...byNumber, contains("customerName")] }] } : null,
  };
}
