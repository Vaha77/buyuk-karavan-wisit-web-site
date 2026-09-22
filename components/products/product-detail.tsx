import Link from "next/link";
import { CircleHelp, Droplet, House, PanelsTopLeft, Refrigerator } from "lucide-react";
import type { Product } from "@/lib/products/types";
import { ProductCard } from "./product-card";
import { ProductGallery } from "./product-gallery";
import { ProductDetailMotion } from "./product-detail-motion";
import { MadinaPlaceholder } from "./madina-placeholder";
import { ProductPrice } from "./product-price";
import { ProductConsultation } from "./product-consultation";

const applicationIcons = { rooms: House, produce: Droplet, meat: Refrigerator, industrial: PanelsTopLeft } as const;
const categoryName = (product: Product) => product.categoryName;
type Spec = { id: string; name: string; value: string; mobileOrder?: number };
function detailSpecs(product: Product) {
  const given = product.specifications || product.specs.map((value,index):Spec=>({ id:`feature-${index}`, name:`Xususiyat ${index+1}`, value }));
  const dims = given.find(item=>item.id==="dimensions");
  const withoutDims = given.filter(item=>item.id!=="dimensions");
  const split = withoutDims.length > 5 ? 3 : Math.ceil(withoutDims.length/2);
  const left: Spec[] = [{id:"brand",name:"Brend",value:product.brand,mobileOrder:0},{id:"model",name:"Model",value:product.model,mobileOrder:1},...withoutDims.slice(0,split)];
  const right: Spec[] = [{id:"status",name:"Holati",value:product.availability==="available"?"Mavjud":"Buyurtma asosida",mobileOrder:4},...withoutDims.slice(split)];
  const mobile = [...left,...right,...(dims?[dims]:[])];
  if (given.some(item=>item.mobileOrder!==undefined)) mobile.sort((a,b)=>(a.mobileOrder??100)-(b.mobileOrder??100));
  return { left, right, full: dims, mobile };
}
function SpecRows({ rows }: { rows: Spec[] }) { return <div className="detail-spec-column">{rows.map(item=><div className="detail-spec-row" key={item.id}><span>{item.name}</span><strong className={item.id==="status"&&item.value==="Mavjud"?"is-available":""}>{item.value || "—"}</strong></div>)}</div>; }

export function ProductDetail({ product, related, exchangeRate }: { product: Product; related: Product[]; exchangeRate: string|null }) {
  const specs = detailSpecs(product);
  return <main className="products-page detail-page">
    <div className="container detail-container">
      <nav className="detail-breadcrumb" aria-label="Breadcrumb"><Link href="/">Bosh sahifa</Link><span>›</span><Link href="/products">Mahsulotlar</Link><span>›</span><Link href="/products">{categoryName(product)}</Link><span>›</span><strong>{product.name} {product.model}</strong></nav>
      <div className="detail-hero">
        <ProductGallery product={product}/>
        <div className="detail-info">
          <span className="detail-category">{product.badge}</span>
          <h1>{product.name}</h1>
          <p className="detail-model">{product.model}</p>
          <span className={`detail-availability ${product.availability==="available"?"is-available":"is-order"}`}><i/>{product.availability==="available"?"Mavjud":"Buyurtma asosida"}</span>
          <ProductPrice priceUsd={product.priceUsd} exchangeRate={exchangeRate}/>
          <div className="detail-tags">{(product.tags?.length?product.tags:product.specs).map(tag=><span key={tag}>{tag}</span>)}</div>
          {product.shortDescription&&<p className="detail-short-description">{product.shortDescription}</p>}
          <div className="detail-hero-actions"><ProductConsultation productId={product.id} productSlug={product.slug} productName={`${product.name} ${product.model}`} className="detail-button detail-button-primary" label="Maslahat olish"/><MadinaPlaceholder className="detail-button detail-button-secondary">Madina AI’dan so‘rash</MadinaPlaceholder></div>
          <p className="detail-help-note"><CircleHelp size={15} aria-hidden="true"/>Mutaxassislarimiz sizga mos konfiguratsiyani tanlashda yordam beradi.</p>
        </div>
      </div>
      <section className="detail-spec-section"><h2>Texnik xususiyatlar</h2><div className="detail-spec-card"><div className="detail-spec-grid"><SpecRows rows={specs.left}/><SpecRows rows={specs.right}/></div>{specs.full&&<div className="detail-spec-full detail-spec-row"><span>{specs.full.name}</span><strong>{specs.full.value || "—"}</strong></div>}<div className="detail-spec-mobile"><SpecRows rows={specs.mobile}/></div></div><p className="detail-spec-note">— belgisi keyinchalik Admin panel orqali to‘ldiriladigan xususiyatlarni bildiradi.</p></section>
      <section className="detail-description"><h2>Mahsulot haqida</h2><div className="detail-description-copy"><p>{product.description || "—"}</p>{Boolean(product.descriptionBullets?.length)&&<ul>{product.descriptionBullets?.map(item=><li key={item}>{item}</li>)}</ul>}</div></section>
      {Boolean(product.applications?.length)&&<section className="detail-applications"><h2>Qayerda ishlatiladi?</h2><div className="detail-application-grid">{product.applications?.map(item=>{const Icon=applicationIcons[item.id as keyof typeof applicationIcons] || PanelsTopLeft;return <article className="detail-application-card" key={item.id}><span><Icon size={21} strokeWidth={1.5} aria-hidden="true"/></span><h3>{item.label}</h3></article>;})}</div></section>}
      <section className="detail-consultation"><div className="detail-consultation-content"><h2>Qaysi uskuna sizga mosligini<br className="detail-consultation-break"/> bilmayapsizmi?</h2><p>Mutaxassislarimiz loyiha va harorat talablariga qarab to‘g‘ri uskunani tanlashda yordam beradi.</p><div className="detail-consultation-actions"><ProductConsultation productId={product.id} productSlug={product.slug} productName={`${product.name} ${product.model}`} className="detail-button detail-button-light" label="Bepul maslahat olish"/><MadinaPlaceholder className="detail-button detail-button-dark-outline">Madina AI bilan gaplashish</MadinaPlaceholder></div></div></section>
      <section className="detail-related"><h2>O‘xshash mahsulotlar</h2><div className="detail-related-grid">{related.map(item=><ProductCard product={item} exchangeRate={exchangeRate} key={item.id}/>)}</div></section>
    </div>
    <ProductDetailMotion/>
  </main>;
}
