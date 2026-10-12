// Lead page for ads (/l/<product slug>, opened from a referral link in "Lid sahifasi" mode): on a phone the product
// and the 3-field form fit the first screen; below come the specifications and the category's other products.
import Image from "next/image";
import Link from "next/link";
import { Phone } from "lucide-react";
import type { Product } from "@/lib/products/types";
import { isPublicNeonProductImage } from "@/lib/products/image-delivery";
import { ProductCard } from "@/components/products/product-card";
import { MetaViewContent } from "@/components/tracking/meta-pixel";
import { LandingForm } from "./landing-form";

export type LandingContacts = { phone: { label: string; href: string }; telegram: string | null };
type Props = { product: Product; related: Product[]; exchangeRate: string | null; priceText: string | null; priceUzs: number | null; showPriceFirst: boolean; handoff: string | null; contacts: LandingContacts };

function specRows(product: Product) {
  const given = product.specifications?.length ? product.specifications : product.specs.map((value, index) => ({ id: `feature-${index}`, name: `Xususiyat ${index + 1}`, value }));
  return [{ id: "brand", name: "Brend", value: product.brand }, { id: "model", name: "Model", value: product.model }, { id: "status", name: "Holati", value: product.availability === "available" ? "Mavjud" : "Buyurtma asosida" }, ...given].filter(row => row.value);
}

export function LeadLanding({ product, related, exchangeRate, priceText, priceUzs, showPriceFirst, handoff, contacts }: Props) {
  const title = `${product.name} ${product.model}`.trim();
  const rows = specRows(product);
  return <div className="landing-shell">
    <header className="landing-bar">
      <Link href="/" className="landing-brand" aria-label="BUYUK KARAVAN — bosh sahifa"><span aria-hidden="true">✳</span> BUYUK KARAVAN</Link>
      <a className="landing-call" href={contacts.phone.href} aria-label={`Qo‘ng‘iroq qilish: ${contacts.phone.label}`}><Phone size={15} aria-hidden="true"/><span>{contacts.phone.label}</span></a>
    </header>
    <main className="landing-main">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-product">
          <div className="landing-image">
            {product.image ? <Image unoptimized={isPublicNeonProductImage(product.image)} src={product.image} alt={title} fill priority sizes="(max-width: 760px) 96px, 520px"/> : <span aria-hidden="true">✳</span>}
          </div>
          <div className="landing-name">
            {product.categoryName && <span className="landing-category">{product.categoryName}</span>}
            <h1 id="landing-title">{product.name}</h1>
            {product.model && <p>{product.model}</p>}
            {showPriceFirst && <p className="landing-price-inline">{priceText ? <><strong>{priceText}</strong> <small>CBU kursida</small></> : <strong>Narxni mutaxassis aytadi</strong>}</p>}
          </div>
        </div>
        <LandingForm productSlug={product.slug} productName={title} handoff={handoff} phone={contacts.phone} telegram={contacts.telegram} priceBefore={showPriceFirst ? priceText : null}/>
      </section>

      <section className="landing-section" aria-labelledby="landing-specs">
        <h2 id="landing-specs">Tarkibi va xususiyatlari</h2>
        <dl className="landing-specs">{rows.map(row => <div key={row.id}><dt>{row.name}</dt><dd>{row.value}</dd></div>)}</dl>
        {(product.shortDescription || product.description) && <div className="landing-copy">
          {product.shortDescription && <p>{product.shortDescription}</p>}
          {product.description && product.description !== product.shortDescription && <p>{product.description}</p>}
          {Boolean(product.descriptionBullets?.length) && <ul>{product.descriptionBullets!.map(item => <li key={item}>{item}</li>)}</ul>}
        </div>}
      </section>

      {related.length > 0 && <section className="landing-section" aria-labelledby="landing-related">
        <h2 id="landing-related">{product.categoryName ? `${product.categoryName}: boshqa mahsulotlar` : "Shu turdagi boshqa mahsulotlar"}</h2>
        <div className="landing-related">{related.map(item => <ProductCard key={item.id} product={item} exchangeRate={exchangeRate}/>)}</div>
      </section>}
    </main>
    <MetaViewContent id={product.id} name={title} value={priceUzs}/>
  </div>;
}
