import "server-only";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma, type AdminUser } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit/service";
import { defaultRecommended } from "@/lib/calculations/queries";
import { getDb } from "@/lib/db";
import { getMarkupPercent, getPraysProducts } from "@/lib/prays/queries";
import { sellPrice } from "@/lib/prays/rules";
import { buildKitTemplates, kitClientPrice, kitTotal, type KitSelection, type KitTemplate } from "./configurator";

type Actor = Pick<AdminUser, "id" | "name" | "role">;

/** What the browser gets: price-list prices for every part, plus the site (selling) price of the standard kit. */
export type KitView = KitTemplate & { sitePrice: number };

export async function loadKitTemplates() {
  return buildKitTemplates(await getPraysProducts());
}

export async function kitTemplatesForView(): Promise<KitView[]> {
  const [templates, markup] = await Promise.all([loadKitTemplates(), getMarkupPercent()]);
  return templates.map(template => ({ ...template, sitePrice: sellPrice(template.base, markup) }));
}

export type KitQuoteInput = { templateId: string; selection: KitSelection; markup: number; extras: Array<{ name: string; price: number }> };
export async function quoteKit(input: KitQuoteInput) {
  const template = (await loadKitTemplates()).find(item => item.id === input.templateId);
  if (!template) return null;
  const total = kitTotal(template, input.selection, input.extras.map(extra => extra.price));
  if (!total) return null;
  return { template, total, clientPrice: kitClientPrice(total.base, input.markup) };
}

export type KitCustomer = { kind: "customer" | "lead" | "new"; id: string | null; name: string; phone: string };
/** "Saqlash": a Calculation linked to the customer / lead, with one line for the kit and one per extra (client prices). */
export async function saveKitCalculation(actor: Actor, input: KitQuoteInput & { customer: KitCustomer }) {
  const quote = await quoteKit(input);
  if (!quote) return { ok: false as const, error: "Komplekt praysda topilmadi." };
  const db = getDb();
  let customerId: string | null = null, leadId: string | null = null, customerName = input.customer.name.trim(), phone = input.customer.phone.trim(), region = "";
  if (input.customer.kind === "customer" && input.customer.id) {
    const customer = await db.regularCustomer.findFirst({ where: { id: input.customer.id, isActive: true }, select: { id: true, name: true, phone: true } });
    if (!customer) return { ok: false as const, error: "Mijoz topilmadi." };
    customerId = customer.id; customerName = customer.name; phone = customer.phone ?? phone;
  }
  if (input.customer.kind === "lead" && input.customer.id) {
    const lead = await db.lead.findUnique({ where: { id: input.customer.id }, select: { id: true, customerName: true, phone: true, region: true } });
    if (!lead) return { ok: false as const, error: "Lid topilmadi." };
    leadId = lead.id; customerName = lead.customerName || customerName || "Mijoz"; phone = lead.phone ?? phone; region = lead.region ?? "";
  }
  if (!customerName) return { ok: false as const, error: "Mijozni tanlang yoki ismini yozing." };
  const { template, total, clientPrice } = quote;
  const [comp, cond, evap] = total.parts;
  const factor = (100 + input.markup) / 100;
  const extras = input.extras.filter(extra => extra.name.trim() && extra.price > 0).map(extra => ({ name: extra.name.trim(), price: Math.round(extra.price * factor * 100) / 100 }));
  const kitLine = Math.round((clientPrice - extras.reduce((sum, extra) => sum + extra.price, 0)) * 100) / 100;
  const title = `${comp.name} vazdushniy agregat komplekti ${cond.name} + ${evap.name}`;
  const recommended = { ...defaultRecommended(), compressor: comp.name, compressorNote: comp.spec, condenser: `${cond.name} (resiver + rama bilan)`, evaporator: `${evap.name}${evap.spec ? ` · ${evap.spec}` : ""}`, priceUsd: clientPrice };
  const lineItems = [{ id: crypto.randomUUID(), productId: null, name: title, unit: "komplekt", quantity: 1, unitPrice: kitLine, currency: "USD" as const, order: 0 }, ...extras.map((extra, index) => ({ id: crypto.randomUUID(), productId: null, name: extra.name, unit: "xizmat", quantity: 1, unitPrice: extra.price, currency: "USD" as const, order: index + 1 }))];
  const snapshot = { templateId: template.id, templateTitle: template.title, templateBase: template.base, selection: input.selection, parts: total.parts.map(part => ({ name: part.name, price: part.price, source: part.source })), extras: input.extras, baseTotal: total.base, markupPercent: input.markup, clientPrice, margin: Math.round((clientPrice - total.base) * 100) / 100 };
  const row = await db.calculation.create({
    data: {
      customerName, phone: phone || null, region: region || null, projectName: title, cameraCount: 0, buildingWidth: 1, buildingLength: 1, buildingHeight: 1, status: "DRAFT",
      proposalNumber: `BK-${new Date().getFullYear()}-${randomInt(0, 1_000_000).toString().padStart(6, "0")}`, proposalDate: new Date(new Date().toISOString().slice(0, 10)),
      customerId, leadId, configurator: snapshot as unknown as Prisma.InputJsonValue, createdByAdminId: actor.id,
      configurations: { create: [{ ...recommended, order: 0 }] }, lineItems: { create: lineItems },
    },
  });
  await writeAudit(actor, { action: "CREATE", entityType: "CALCULATION", entityId: row.id, entityName: row.projectName, summary: "Komplekt konfiguratoridan tijorat taklifi yaratdi", after: { proposalNumber: row.proposalNumber, clientPrice, markupPercent: input.markup, customerId, leadId } });
  revalidatePath("/admin/calculations");
  return { ok: true as const, id: row.id };
}
