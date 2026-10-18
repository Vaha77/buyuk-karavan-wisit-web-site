import type { Metadata } from "next";
import { requireSeller } from "@/lib/auth/require-admin";
import { myCustomers, myRegionMap, toRow } from "@/lib/customers/seller-queries";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { NotLinked } from "@/components/admin/bklead/not-linked";
import { NewCustomerButton, SellerCustomerList } from "@/components/admin/bklead/seller";
import { LazySellerMap } from "@/components/admin/bklead/lazy";

export const metadata: Metadata = { title: "Mening mijozlarim | BUYUK KARAVAN" };

export default async function MyCustomersPage() {
  const { user } = await requireSeller();
  if (!user.salesPersonId) return <NotLinked/>;
  const year = tashkentYearMonth().year;
  const [customers, regions] = await Promise.all([myCustomers(user), myRegionMap(user, year)]);
  const rows = customers.map(customer => toRow(customer));
  return <div className="bk">
    <div className="bk-head"><div><h1>Mening mijozlarim</h1><p className="bk-muted">Faqat sizga biriktirilgan mijozlar · {regions.opened} viloyatda</p></div><NewCustomerButton/></div>
    <section className="bk-card" aria-labelledby="sl-list-title" style={{ display: "grid", gap: 12 }}>
      <div className="bk-card-head" style={{ marginBottom: 0 }}><div><h2 id="sl-list-title">Mijozlar</h2><span className="bk-muted">{rows.length} ta · raqam = oxirgi xariddan beri kunlar (qizil — oraliq o‘tgan, sariq — kelishilgan qo‘ng‘iroq)</span></div></div>
      <SellerCustomerList customers={rows}/>
    </section>
    <LazySellerMap data={regions} year={year}/>
  </div>;
}
