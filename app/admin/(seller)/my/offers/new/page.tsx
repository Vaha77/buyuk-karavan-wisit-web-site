import type { Metadata } from "next";
import { requireSeller } from "@/lib/auth/require-admin";
import { myCustomers } from "@/lib/customers/seller-queries";
import { getOffer, offerProducts } from "@/lib/offers/service";
import { OfferForm } from "@/components/admin/bklead/offer-form";

export const metadata: Metadata = { title: "Tijorat taklifi | BUYUK KARAVAN" };

/** New offer; `?copy=<id>` starts from one of the seller's own offers. */
export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ copy?: string }> }) {
  const { user } = await requireSeller();
  const { copy } = await searchParams;
  const [products, customers, source] = await Promise.all([offerProducts(), myCustomers(user), copy ? getOffer(user, copy) : null]);
  const initial = source ? { customerId: source.customerId, customerName: source.customerName, customerPhone: source.customerPhone ?? "", markupPercent: source.markupPercent, lines: source.items.map(item => ({ productId: item.productId, qty: item.qty, markupPercent: item.markupPercent === source.markupPercent ? null : item.markupPercent })) } : undefined;
  return <div className="bk">
    <div className="bk-head"><div><h1>Tijorat taklifi</h1><p className="bk-muted">Mijoz narxi = Prays narxi + ustama · PDF’da faqat mijoz narxi chiqadi</p></div></div>
    <OfferForm products={products} customers={customers.filter(customer => customer.isActive).map(customer => ({ id: customer.id, name: customer.name, phone: customer.phoneNormalized ?? customer.phone }))} initial={initial}/>
  </div>;
}
