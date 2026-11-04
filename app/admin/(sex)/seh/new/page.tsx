import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewOrder } from "@/components/admin/sex/new-order";
import { requireSexUser } from "@/lib/auth/require-admin";
import { getIssueGroups } from "@/lib/prays/queries";
import { customerOptions, sellerCustomers, sellerOptions } from "@/lib/sex/queries";
import { canCreateOrders, priceAccess } from "@/lib/sex/rules";
import { loadZborkaCatalog } from "@/lib/sex/service";
import { withoutPrices } from "@/lib/sex/zborka";

const EMPTY_CATALOG = { groups: [], receivers: {}, condensers: [], standardCondenserCategoryId: null, notice: null };

export const metadata: Metadata = { title: "Yangi seh zakazi — Admin | BUYUK KARAVAN" };

/** Only price-list prices (the seller adds their own markup); WORKSHOP opens it only "Sotuvchi nomidan" (?for=seller), without any price. */
export default async function NewSexOrderPage({ searchParams }: { searchParams: Promise<{ type?: string; seller?: string }> }) {
  const user = await requireSexUser();
  const forSeller = user.role === "WORKSHOP";
  if (!canCreateOrders(user.role) && !forSeller) redirect("/admin/seh");
  const { type, seller } = await searchParams;
  const kind = type === "zapchast" ? "zapchast" : "agregat";
  const [catalog, groups, customers, sellers] = await Promise.all([kind === "agregat" ? loadZborkaCatalog() : Promise.resolve(EMPTY_CATALOG), kind === "zapchast" ? getIssueGroups() : Promise.resolve([]), forSeller ? sellerCustomers() : customerOptions(user), forSeller ? sellerOptions() : Promise.resolve(undefined)]);
  // Prays prices only for roles that may see them.
  const withPrices = priceAccess(user.role) !== "none";
  const parts = groups.flatMap(group => group.items.map(item => ({ id: item.id, label: item.label, group: group.name, ...(withPrices ? { basePriceUsd: item.basePriceUsd } : {}) })));
  return <NewOrder type={kind} userName={user.name} customers={customers} catalog={withPrices ? catalog : withoutPrices(catalog)} parts={parts} sellers={sellers} initialSeller={seller ?? null} hidePrices={!withPrices}/>;
}
