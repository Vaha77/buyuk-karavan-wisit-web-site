import Link from "next/link";
import Image from "next/image";
import { Activity, ArrowRight, CircuitBoard, DoorClosed, PanelsTopLeft, Radio, Snowflake, Waves } from "lucide-react";
import type { Product } from "@/lib/products/types";

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

export function ProductCard({ product }: { product: Product }) {
  const Icon = iconByCategory[product.category];
  return <Link className="catalog-card" href={`/products/${product.slug}`} aria-label={`${product.name} ${product.model} — batafsil`}>
    <div className="catalog-card-image">
      <span className="catalog-card-badge">{product.badge}</span>
      {product.image ? <Image className="catalog-card-real-image" src={product.image} alt={`${product.name} ${product.model}`} fill sizes="(max-width: 700px) 100vw, 380px" /> : <Icon className="catalog-card-icon" size={38} strokeWidth={1.7} aria-hidden="true" />}
    </div>
    <div className="catalog-card-body">
      <div className="catalog-card-identification"><h2>{product.name}</h2><p>{product.model}</p></div>
      <div className="catalog-card-specs">{product.specs.map((spec, index) => <span className={index > 0 ? "catalog-card-spec-secondary" : ""} key={spec}>{spec}</span>)}</div>
      <div className="catalog-card-bottom">
        <span className={`catalog-availability catalog-availability-${product.availability}`}><i aria-hidden="true"/>{product.availability === "available" ? "Mavjud" : <><span className="availability-desktop">Buyurtma asosida</span><span className="availability-mobile">Buyurtma</span></>}</span>
        <span className="catalog-card-more">Batafsil <ArrowRight size={14} aria-hidden="true"/></span>
      </div>
    </div>
  </Link>;
}
