import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StoreRequest } from "@/components/admin/sex/store-board";
import { requireSexUser } from "@/lib/auth/require-admin";
import { getIssueGroups } from "@/lib/prays/queries";
import { listOrders } from "@/lib/sex/queries";

export const metadata: Metadata = { title: "Sehdan so‘rash — Ombor | BUYUK KARAVAN" };

/** Omborchi only; the part list goes out without prices. */
export default async function StoreRequestPage() {
  const user = await requireSexUser();
  if (user.role !== "STOREKEEPER") redirect("/admin/seh");
  const [groups, { rows }] = await Promise.all([getIssueGroups(), listOrders(user)]);
  return <StoreRequest parts={groups.flatMap(group => group.items.map(item => ({ id: item.id, label: item.label, group: group.name })))} rows={rows}/>;
}
