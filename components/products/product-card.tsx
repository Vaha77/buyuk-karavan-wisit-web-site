import Link from "next/link";
import Image from "next/image";
import { isPublicNeonProductImage } from "@/lib/products/image-delivery";
import { Activity, ArrowRight, CircuitBoard, DoorClosed, PanelsTopLeft, Radio, Snowflake, Waves } from "lucide-react";
import type { Product } from "@/lib/products/types";
import { ProductPrice } from "./product-price";

const iconByCategory = {
  compressors: CircuitBoard,
  evaporators: Activity,
  condensers: PanelsTopLeft,
  chillers: Snowflake,
  panels: PanelsTopLeft,
  doors: DoorClosed,
  pipes: Waves,
  accessories: Radio,
} as const;

export function ProductCard({ product, exchangeRate }: { product: Product; exchangeRate: string|null }) {
  const Icon = iconByCategory[product.category as keyof typeof iconByCategory] ?? Radio;
  return <Link className="catalog-card" href={`/products/${product.slug}`} aria-label={`${product.name} ${product.model} — batafsil`}>
    <div className="catalog-card-image">
      <span className="catalog-card-badge">{product.badge}</span>
      {product.image ? <Image unoptimized={isPublicNeonProductImage(product.image)} className="catalog-card-real-image" src={product.image} alt={`${product.name} ${product.model}`} fill sizes="(max-width: 767px) 50vw, 380px" /> : <span className="catalog-card-placeholder"><Icon className="catalog-card-icon" size={34} strokeWidth={1.5} aria-hidden="true"/><small>Rasm tez orada</small></span>}
    </div>
    <div className="catalog-card-body">
      <div className="catalog-card-identification"><h2>{product.name}</h2><p>{product.model}</p></div>
      <ProductPrice priceUsd={product.priceUsd} exchangeRate={exchangeRate} compact/>
      <div className="catalog-card-specs">{product.specs.map((spec, index) => <span className={index > 0 ? "catalog-card-spec-secondary" : ""} key={spec}>{spec}</span>)}</div>
      <div className="catalog-card-bottom">
        <span className={`catalog-availability catalog-availability-${product.availability}`}><i aria-hidden="true"/>{product.availability === "available" ? "Mavjud" : <><span className="availability-desktop">Buyurtma asosida</span><span className="availability-mobile">Buyurtma</span></>}</span>
        <span className="catalog-card-more">Batafsil <ArrowRight size={14} aria-hidden="true"/></span>
      </div>
    </div>
  </Link>;
}
