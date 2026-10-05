import type { Metadata } from "next";
import { KitConfigurator } from "@/components/admin/sex/kit-configurator";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { getDb } from "@/lib/db";
import { kitTemplatesForView } from "@/lib/sex/kit-service";
import "@/components/admin/sex/sex.css";

export const metadata: Metadata = { title: "Komplekt konfiguratori — Admin | BUYUK KARAVAN" };

export default async function KitConfiguratorPage() {
  const user = await requireAdmin();
  const [templates, customers, leads, rate] = await Promise.all([
    kitTemplatesForView(),
    getDb().regularCustomer.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 1000 }),
    getDb().lead.findMany({ where: { customerName: { not: null } }, select: { id: true, customerName: true, region: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    getUsdUzsRate().catch(() => null),
  ]);
  return <KitConfigurator templates={templates} showMargin={user.role === "SUPER_ADMIN"} usdToUzs={rate ? Number(rate.rate) : null}
    customers={customers} leads={leads.map(lead => ({ id: lead.id, name: [lead.customerName, lead.region].filter(Boolean).join(" · ") }))}/>;
}
