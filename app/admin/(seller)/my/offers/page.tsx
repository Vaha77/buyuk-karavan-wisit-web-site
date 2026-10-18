import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/require-admin";
import { listOffers } from "@/lib/offers/service";
import { formatUsd } from "@/lib/dashboard/format";
import { OfferActions } from "@/components/admin/bklead/offer-form";

export const metadata: Metadata = { title: "Mening takliflarim | BUYUK KARAVAN" };

export default async function MyOffersPage() {
  const { user } = await requireSeller();
  const offers = await listOffers(user);
  return <div className="bk">
    <div className="bk-head"><div><h1>Mening takliflarim</h1><p className="bk-muted">Tijorat takliflari · 7 kun amal qiladi</p></div><Link className="bk-btn is-primary" href="/admin/my/offers/new">+ Yangi taklif</Link></div>
    <section className="bk-card">
      {offers.length ? <div className="bk-list">{offers.map(offer => <div key={offer.id} style={{ flexWrap: "wrap" }}>
        <div className="bk-grow"><b>{offer.number} · {offer.customerName}</b><span>{offer.date} · {offer.validUntil} gacha · {formatUsd(offer.totalUsd)}</span></div>
        <OfferActions id={offer.id}/>
      </div>)}</div> : <div className="bk-empty">Hali taklif yo‘q. “+ Yangi taklif” ni bosing.</div>}
    </section>
  </div>;
}
