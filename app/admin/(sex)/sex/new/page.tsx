import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewOrder } from "@/components/admin/sex/new-order";
import { requireSexUser } from "@/lib/auth/require-admin";
import { getMarkupPercent, getSexParts } from "@/lib/prays/queries";
import { customerOptions } from "@/lib/sex/queries";
import { canCreateOrders, priceAccess } from "@/lib/sex/rules";
import { loadZborkaCatalog } from "@/lib/sex/service";
import type { ZborkaCatalog } from "@/lib/sex/zborka";

export const metadata: Metadata = { title: "Yangi sex zakazi — Admin | BUYUK KARAVAN" };

const scale = (value: number, factor: number) => Math.round(value * factor * 100) / 100;
/** Non-SUPER_ADMIN users never receive price-list (base) prices: every number is turned into a selling price first. */
function toSale(catalog: ZborkaCatalog, factor: number): ZborkaCatalog {
  const table = (values: Record<string, number>) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, scale(value, factor)]));
  const priced = <T extends { base: number } | null>(item: T) => (item ? { ...item, base: scale(item.base, factor) } : item);
  return {
    receivers: table(catalog.receivers),
    groups: catalog.groups.map(group => ({ ...group, hpTable: table(group.hpTable), fnTable: table(group.fnTable), models: group.models.map(model => ({ ...model, k: priced(model.k), rb: priced(model.rb), vd: priced(model.vd), vz: priced(model.vz) })) })),
  };
}

export default async function NewSexOrderPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireSexUser();
  if (!canCreateOrders(user.role)) redirect("/admin/sex");
  const { type } = await searchParams;
  const kind = type === "zapchast" ? "zapchast" : "agregat";
  const access = priceAccess(user.role) === "base" ? "base" : "sale";
  const [catalog, parts, markup, customers] = await Promise.all([kind === "agregat" ? loadZborkaCatalog() : Promise.resolve({ groups: [], receivers: {} }), getSexParts(), getMarkupPercent(), customerOptions(user)]);
  const factor = (100 + markup) / 100;
  return <NewOrder type={kind} userName={user.name} priceMode={access} markup={markup} customers={customers}
    catalog={access === "base" ? catalog : toSale(catalog, factor)}
    parts={parts.map(part => ({ id: part.id, label: [part.name, part.size].filter(Boolean).join(" "), price: part.basePriceUsd === null ? null : access === "base" ? part.basePriceUsd : scale(part.basePriceUsd, factor) }))}/>;
}
