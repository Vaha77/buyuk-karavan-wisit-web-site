import "server-only";
import { getDb } from "@/lib/db";
import { orderNumber } from "@/lib/sex/rules";
import { offerNumber } from "@/lib/offers/rules";
import { searchPlan, type SearchUser } from "./plan";

export type SearchHit = { group: string; title: string; detail: string; href: string };
const TAKE = 5;

/** One query per group in parallel, each limited by the role's plan; customer names of other sellers never come back. */
export async function globalSearch(user: SearchUser, query: string): Promise<SearchHit[]> {
  if (query.trim().length < 2) return [];
  const db = getDb(), seller = user.role === "SELLER";
  const agentId = seller ? (await db.salesPerson.findUnique({ where: { id: user.salesPersonId ?? "" }, select: { agentId: true } }))?.agentId ?? null : null;
  const plan = searchPlan(user, query, agentId);
  const [customers, leads, orders, products, offers] = await Promise.all([
    plan.customers ? db.regularCustomer.findMany({ where: plan.customers, take: TAKE, orderBy: { name: "asc" }, select: { id: true, name: true, phoneNormalized: true, phone: true } }) : [],
    plan.leads ? db.lead.findMany({ where: plan.leads, take: TAKE, orderBy: { createdAt: "desc" }, select: { id: true, customerName: true, phone: true } }) : [],
    plan.orders ? db.workshopOrder.findMany({ where: plan.orders, take: TAKE, orderBy: { createdAt: "desc" }, select: { id: true, monthKey: true, monthNo: true, items: { take: 1, orderBy: { order: "asc" }, select: { title: true } } } }) : [],
    plan.products ? db.product.findMany({ where: plan.products, take: TAKE, orderBy: { model: "asc" }, select: { id: true, model: true, name: true } }) : [],
    plan.offers ? db.commercialOffer.findMany({ where: plan.offers, take: TAKE, orderBy: { createdAt: "desc" }, select: { id: true, number: true, customerName: true } }) : [],
  ]);
  return [
    ...customers.map(row => ({ group: "Mijozlar", title: row.name, detail: row.phoneNormalized ?? row.phone ?? "", href: seller ? `/admin/my/customers/${row.id}` : "/admin/customers" })),
    ...leads.map(row => ({ group: "Lidlar", title: row.customerName ?? "Ismsiz lid", detail: row.phone ?? "", href: `/admin/leads?lead=${row.id}` })),
    ...orders.map(row => ({ group: "Seh zakazlari", title: orderNumber(row), detail: row.items[0]?.title ?? "", href: `/admin/seh#order-${row.id}` })),
    ...products.map(row => ({ group: "Mahsulotlar", title: row.model, detail: row.name, href: `/admin/products/${row.id}` })),
    ...offers.map(row => ({ group: "Tijorat takliflari", title: offerNumber(row.number), detail: row.customerName, href: `/admin/my/offers/${row.id}/pdf?inline=1` })),
  ];
}
