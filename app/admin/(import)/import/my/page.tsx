import type { Metadata } from "next";
import Link from "next/link";
import { requireImportUser } from "@/lib/auth/require-admin";
import { myOrders } from "@/lib/import/service";
import { MyOrders } from "@/components/admin/import/my-orders";

export const metadata: Metadata = { title: "Mening zayavkalarim — Import | BUYUK KARAVAN" };

export default async function MyImportOrdersPage() {
  const user = await requireImportUser();
  const orders = await myOrders(user);
  return <div className="bk">
    <div className="bk-head"><div><h1>Mening zayavkalarim</h1><p className="bk-muted">Import buyurtmalaringiz va ularning holati</p></div><Link className="imp-link" href="/admin/import">← Katalog</Link></div>
    <MyOrders orders={orders}/>
  </div>;
}
