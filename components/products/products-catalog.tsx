"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Product } from "@/lib/products/types";
import type { ProductCategoryRecord } from "@/lib/product-categories/types";
import { ProductCard } from "./product-card";

export function ProductsCatalog({ products, categories, exchangeRate }: { products: Product[]; categories: ProductCategoryRecord[]; exchangeRate: string|null }) {
  const PAGE_SIZE = 12;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [shown,setShown]=useState(PAGE_SIZE);
  const visible = useMemo(() => products
    .filter(product => product.isVisible && (category === "all" || product.category === category))
    .filter(product => `${product.name} ${product.brand} ${product.model}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => a.order - b.order), [products, query, category]);
  const displayed=visible.slice(0,shown);
  return <section className="catalog-section" aria-labelledby="catalog-title">
    <div className="container catalog-container">
      <div className="catalog-intro"><div><h1 id="catalog-title">Mahsulotlar</h1><p>Profesional sovutish uskunalari va komponentlari</p></div><span className="catalog-count" aria-live="polite">{displayed.length} / {visible.length} mahsulot ko‘rsatilmoqda</span></div>
      <label className="catalog-search"><Search size={20} strokeWidth={1.6} aria-hidden="true"/><span className="sr-only">Mahsulotlarni qidirish</span><input type="search" value={query} onChange={event => {setQuery(event.target.value);setShown(PAGE_SIZE);}} placeholder="Mahsulot yoki modelni qidiring..." /></label>
      <div className="catalog-filters" role="group" aria-label="Mahsulot toifalari"><button className={category === "all" ? "is-active" : ""} type="button" aria-pressed={category === "all"} onClick={()=>{setCategory("all");setShown(PAGE_SIZE);}}>Barchasi</button>{categories.map(item => <button className={category === item.slug ? "is-active" : ""} type="button" key={item.id} aria-pressed={category === item.slug} onClick={() => {setCategory(item.slug);setShown(PAGE_SIZE);}}>{item.name}</button>)}</div>
      {visible.length ? <><div className="catalog-grid">{displayed.map(product => <ProductCard product={product} exchangeRate={exchangeRate} key={product.id}/>)}</div>{displayed.length<visible.length&&<button className="catalog-load-more" type="button" onClick={()=>setShown(value=>value+PAGE_SIZE)}>Ko‘proq mahsulot ko‘rsatish</button>}</> : <p className="catalog-empty">Qidiruv bo‘yicha mahsulot topilmadi.</p>}
    </div>
  </section>;
}
