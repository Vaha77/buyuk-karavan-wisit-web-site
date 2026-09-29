import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getUsdUzsRate } from "@/lib/currency/cbu";
import { getCustomerYear, getRegularCustomers } from "@/lib/customers/queries";
import { tashkentYearMonth } from "@/lib/dashboard/period";
import { CustomerRanking } from "@/components/admin/bklead/customer-ranking";
import { CustomersManager } from "@/components/admin/bklead/customer-forms";

export const metadata: Metadata = { title: "Doimiy mijozlar — Admin | BUYUK KARAVAN" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ new?: string; year?: string }> }) {
  const user = await requireAdmin();
  const search = await searchParams;
  const today = tashkentYearMonth();
  const year = /^20\d{2}$/.test(search.year ?? "") && Number(search.year) <= today.year ? Number(search.year) : today.year;
  const [customers, data, rate] = await Promise.all([getRegularCustomers(), getCustomerYear(year), getUsdUzsRate()]);
  const canEdit = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  return <div className="bk">
    <div className="bk-head"><div><h1>Doimiy mijozlar</h1><p className="bk-muted">Oylik savdolar, yillik reyting va sovrinlar</p></div></div>
    <CustomerRanking data={data} now={today} canEdit={canEdit} uzsPerUsd={rate ? Number(rate.rate) : null} yearHref={value => value === today.year ? "/admin/customers" : `/admin/customers?year=${value}`}/>
    <CustomersManager canEdit={canEdit} startNew={search.new === "1"} customers={customers.map(customer => ({ id: customer.id, name: customer.name, country: customer.country, regionCode: customer.regionCode, phone: customer.phone, note: customer.note, isActive: customer.isActive, salesCount: customer._count.sales }))}/>
  </div>;
}
