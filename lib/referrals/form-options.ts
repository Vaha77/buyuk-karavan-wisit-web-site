import "server-only";

import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

/** Choices for the referral link form: approved sellers and visible products (for "Aniq mahsulot"). */
export async function getLinkFormOptions() {
  const [agents, products] = await Promise.all([
    getDb().salesAgent.findMany({ where: { isApproved: true, isActive: true }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    getDb().product.findMany({ where: { isVisible: true, category: { isActive: true } }, orderBy: [{ name: "asc" }], select: { slug: true, name: true, model: true } }),
  ]);
  return {
    siteHost: SITE_URL.replace(/^https?:\/\//, ""),
    agents: agents.map(agent => ({ id: agent.id, name: [agent.firstName, agent.lastName].filter(Boolean).join(" ") })),
    products: products.map(product => ({ slug: product.slug, label: product.name.includes(product.model) ? product.name : `${product.name} · ${product.model}` })),
  };
}
