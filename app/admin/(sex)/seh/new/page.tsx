import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewOrder } from "@/components/admin/sex/new-order";
import { requireSexUser } from "@/lib/auth/require-admin";
import { getIssueGroups } from "@/lib/prays/queries";
import { customerOptions } from "@/lib/sex/queries";
import { canCreateOrders, priceAccess } from "@/lib/sex/rules";
import { loadZborkaCatalog } from "@/lib/sex/service";

const EMPTY_CATALOG = { groups: [], receivers: {}, condensers: [], standardCondenserCategoryId: null, notice: null };

export const metadata: Metadata = { title: "Yangi seh zakazi — Admin | BUYUK KARAVAN" };

/** Only price-list prices (the seller adds their own markup); WORKSHOP cannot open this page. */
export default async function NewSexOrderPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireSexUser();
  if (!canCreateOrders(user.role)) redirect("/admin/seh");
  const { type } = await searchParams;
  const kind = type === "zapchast" ? "zapchast" : "agregat";
  const [catalog, groups, customers] = await Promise.all([kind === "agregat" ? loadZborkaCatalog() : Promise.resolve(EMPTY_CATALOG), kind === "zapchast" ? getIssueGroups() : Promise.resolve([]), customerOptions(user)]);
  // Prays prices only for roles that may see them.
  const withPrices = priceAccess(user.role) !== "none";
  const parts = groups.flatMap(group => group.items.map(item => ({ id: item.id, label: item.label, group: group.name, ...(withPrices ? { basePriceUsd: item.basePriceUsd } : {}) })));
  return <NewOrder type={kind} userName={user.name} customers={customers} catalog={catalog} parts={parts}/>;
}
