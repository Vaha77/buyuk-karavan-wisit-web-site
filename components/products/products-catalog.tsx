"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { productCategories, type Product, type ProductCategory } from "@/lib/products/types";
import { ProductCard } from "./product-card";

export function ProductsCatalog({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const gridRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => products
    .filter(product => product.isVisible && (category === "all" || product.category === category))
    .filter(product => `${product.name} ${product.brand} ${product.model}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => a.order - b.order), [products, query, category]);
  const visibleIds = visible.map(product => product.id).join(",");

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const grid = gridRef.current;
    if (!grid) return;
    const context = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>(".catalog-card", grid);
      cards.forEach((card, index) => {
        gsap.set(card, { autoAlpha: 0, y: 28, scale: 0.97 });
        gsap.fromTo(card,
          { autoAlpha: 0, y: 28, scale: 0.97 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.65, delay: (index % (window.innerWidth <= 700 ? 2 : 4)) * 0.08, ease: "power3.out", immediateRender: false,
            scrollTrigger: { trigger: card, start: "top 88%", once: true } });
      });
    }, grid);
    const refresh = () => ScrollTrigger.refresh();
    requestAnimationFrame(refresh);
    void document.fonts.ready.then(refresh);
    window.addEventListener("orientationchange", refresh);
    return () => { window.removeEventListener("orientationchange", refresh); context.revert(); };
  }, [visibleIds]);

  return <section className="catalog-section" aria-labelledby="catalog-title">
    <div className="container catalog-container">
      <div className="catalog-intro"><div><h1 id="catalog-title">Mahsulotlar</h1><p>Profesional sovutish uskunalari va komponentlari</p></div><span className="catalog-count" aria-live="polite">{visible.length} mahsulot ko‘rsatilmoqda</span></div>
      <label className="catalog-search"><Search size={20} strokeWidth={1.6} aria-hidden="true"/><span className="sr-only">Mahsulotlarni qidirish</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Mahsulot yoki modelni qidiring..." /></label>
      <div className="catalog-filters" role="group" aria-label="Mahsulot toifalari">{productCategories.map(item => <button className={category === item.id ? "is-active" : ""} type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div>
      {visible.length ? <div className="catalog-grid" ref={gridRef}>{visible.map(product => <ProductCard product={product} key={product.id}/>)}</div> : <p className="catalog-empty">Qidiruv bo‘yicha mahsulot topilmadi.</p>}
    </div>
  </section>;
}
