"use client";

import { useState } from "react";
import Image from "next/image";
import { Activity, CircuitBoard, DoorClosed, House, PanelsTopLeft, Radio, Snowflake, Waves } from "lucide-react";
import type { Product } from "@/lib/products/types";

const icons = { compressors: CircuitBoard, evaporators: Activity, condensers: PanelsTopLeft, chillers: Snowflake, panels: PanelsTopLeft, doors: DoorClosed, pipes: Waves, accessories: Radio } as const;

export function ProductGallery({ product }: { product: Product }) {
  const CategoryIcon = icons[product.category as keyof typeof icons] ?? Radio;
  const realImages = [...new Set([product.image, ...(product.images || [])].filter((value): value is string => Boolean(value)))];
  const slides = realImages.length ? realImages.map((src, index) => ({ key: src, src, icon: index === 0 ? CategoryIcon : PanelsTopLeft })) : [
    { key: "front", src: null, icon: CategoryIcon },
    { key: "details", src: null, icon: PanelsTopLeft },
    { key: "installation", src: null, icon: House },
  ];
  const [selected, setSelected] = useState(0);
  const slide = slides[Math.min(selected, slides.length - 1)];
  const Icon = slide.icon;
  return <div className="detail-gallery">
    <div className="detail-main-media" aria-live="polite">
      <span className="detail-media-badge">{product.badge}</span>
      <div className="detail-main-media-content" key={slide.key}>{slide.src ? <Image src={slide.src} alt={`${product.name} ${product.model} — ${selected + 1}-rasm`} fill sizes="(max-width: 700px) 100vw, 524px" className="detail-real-image"/> : <Icon size={96} strokeWidth={1.4} aria-label={`${product.name} tasviri o‘rni`}/>}</div>
    </div>
    <div className="detail-thumbnails" aria-label="Mahsulot rasmlari">{slides.map((item,index)=>{
      const Thumb = item.icon;
      return <button className={selected===index ? "is-selected" : ""} type="button" aria-label={`${index + 1}-rasmni ko‘rish`} aria-pressed={selected===index} key={item.key} onClick={()=>setSelected(index)}>{item.src ? <Image src={item.src} alt="" fill sizes="160px"/> : <Thumb size={24} strokeWidth={1.4} aria-hidden="true"/>}</button>;
    })}</div>
  </div>;
}
