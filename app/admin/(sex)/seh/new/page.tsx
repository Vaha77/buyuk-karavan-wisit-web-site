import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewOrder } from "@/components/admin/sex/new-order";
import { requireSexUser } from "@/lib/auth/require-admin";
import { getSexParts } from "@/lib/prays/queries";
import { customerOptions } from "@/lib/sex/queries";
import { canCreateOrders, orderFormParts } from "@/lib/sex/rules";
import { loadZborkaCatalog } from "@/lib/sex/service";

export const metadata: Metadata = { title: "Yangi seh zakazi — Admin | BUYUK KARAVAN" };

/** Only price-list prices (the seller adds their own markup); WORKSHOP cannot open this page. */
export default async function NewSexOrderPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireSexUser();
  if (!canCreateOrders(user.role)) redirect("/admin/seh");
  const { type } = await searchParams;
  const kind = type === "zapchast" ? "zapchast" : "agregat";
  const [catalog, parts, customers] = await Promise.all([kind === "agregat" ? loadZborkaCatalog() : Promise.resolve({ groups: [], receivers: {} }), getSexParts(), customerOptions(user)]);
  return <NewOrder type={kind} userName={user.name} customers={customers} catalog={catalog} parts={orderFormParts(user.role, parts)}/>;
}
