"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Product } from "@/lib/products/types";
import type { ProductCategoryRecord } from "@/lib/product-categories/types";
import { ProductCard } from "./product-card";

const CATEGORY_CHIP_LIMIT = 10;
type CatalogPage = { products: Product[]; total: number; nextCursor: string | null; seed: string };

export function ProductsCatalog({ initial, categories, exchangeRate, initialCategory = "all", initialQuery = "" }: { initial: CatalogPage; categories: ProductCategoryRecord[]; exchangeRate: string | null; initialCategory?: string; initialQuery?: string }) {
  const [products, setProducts] = useState(initial.products), [total, setTotal] = useState(initial.total), [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [query, setQuery] = useState(initialQuery), [category, setCategory] = useState(initialCategory), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null), mounted = useRef(false), skipQueryEffect = useRef(false), categoryRef = useRef(initialCategory), queryRef = useRef(initialQuery);

  const requestPage = useCallback(async (nextCategory: string, nextQuery: string, cursor: string | null, replace: boolean) => {
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller; setLoading(true); setError("");
    const params = new URLSearchParams({ seed: initial.seed }); if (nextCategory !== "all") params.set("category", nextCategory); if (nextQuery.trim()) params.set("q", nextQuery.trim()); if (cursor) params.set("cursor", cursor);
    if (replace) window.history.pushState(null, "", `/products?${params}`);
    try {
      const response = await fetch(`/api/products?${params}`, { signal: controller.signal, cache: "no-store" });
      const body = await response.json() as CatalogPage & { error?: string }; if (!response.ok) throw new Error(body.error || "Mahsulotlarni yuklab bo'lmadi.");
      setProducts(current => cursor ? [...current, ...body.products.filter(item => !current.some(existing => existing.id === item.id))] : body.products); setTotal(body.total); setNextCursor(body.nextCursor);
    } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Mahsulotlarni yuklab bo'lmadi."); }
    finally { if (abortRef.current === controller) setLoading(false); }
  }, [initial.seed]);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (skipQueryEffect.current) { skipQueryEffect.current = false; return; }
    const timeout = window.setTimeout(() => void requestPage(categoryRef.current, query, null, true), 300);
    return () => window.clearTimeout(timeout);
  }, [query, requestPage]);
  useEffect(() => {
    const restore = () => { const params = new URLSearchParams(window.location.search), nextCategory = params.get("category") || "all", nextQuery = params.get("q") || ""; categoryRef.current = nextCategory; skipQueryEffect.current = nextQuery !== queryRef.current; queryRef.current = nextQuery; setCategory(nextCategory); setQuery(nextQuery); void requestPage(nextCategory, nextQuery, null, false); };
    window.addEventListener("popstate", restore); return () => { window.removeEventListener("popstate", restore); abortRef.current?.abort(); };
  }, [requestPage]);
  // "Barchasi" + the 10 largest categories (the server sorts by count); the active one stays visible when collapsed.
  const [showAllCategories, setShowAllCategories] = useState(false);
  const collapsed = categories.slice(0, CATEGORY_CHIP_LIMIT);
  const activeHidden = categories.find(item => item.slug === category && !collapsed.includes(item));
  const visibleCategories = showAllCategories ? categories : activeHidden ? [...collapsed, activeHidden] : collapsed;
  const hiddenCount = showAllCategories ? 0 : categories.length - visibleCategories.length;
  const chooseCategory = (value: string) => { if (value === category) return; categoryRef.current = value; setCategory(value); void requestPage(value, query, null, true); };

  return <section className="catalog-section" aria-labelledby="catalog-title" aria-busy={loading}>
    <div className="container catalog-container">
      <div className="catalog-intro"><div><h1 id="catalog-title">Mahsulotlar</h1><p>Profesional sovutish uskunalari va komponentlari</p></div><span className="catalog-count" aria-live="polite">{products.length} / {total} mahsulot ko‘rsatilmoqda</span></div>
      <label className="catalog-search"><Search size={20} strokeWidth={1.6} aria-hidden="true"/><span className="sr-only">Mahsulotlarni qidirish</span><input type="search" value={query} onChange={event => { queryRef.current = event.target.value; setQuery(event.target.value); }} placeholder="Mahsulot yoki modelni qidiring..." /></label>
      <div className="catalog-filters" role="group" aria-label="Mahsulot toifalari"><button className={category === "all" ? "is-active" : ""} type="button" aria-pressed={category === "all"} onClick={() => chooseCategory("all")}>Barchasi</button>{visibleCategories.map(item => <button className={category === item.slug ? "is-active" : ""} type="button" key={item.id} aria-pressed={category === item.slug} onClick={() => chooseCategory(item.slug)}>{item.name} <small>{item.productCount ?? 0}</small></button>)}{hiddenCount > 0 && <button className="catalog-filters-toggle" type="button" aria-expanded={false} onClick={() => setShowAllCategories(true)}>Yana {hiddenCount} ta</button>}{showAllCategories && categories.length > CATEGORY_CHIP_LIMIT && <button className="catalog-filters-toggle" type="button" aria-expanded onClick={() => setShowAllCategories(false)}>Yopish</button>}</div>
      {error && <p className="catalog-empty" role="alert">{error}</p>}
      {products.length ? <><div className="catalog-grid">{products.map(product => <ProductCard product={product} exchangeRate={exchangeRate} key={product.id}/>)}</div>{nextCursor && <button className="catalog-load-more" type="button" disabled={loading} onClick={() => void requestPage(category, query, nextCursor, false)}>{loading ? "Yuklanmoqda..." : "Ko‘proq ko‘rsatish"}</button>}</> : !loading && !error ? <p className="catalog-empty">Qidiruv bo‘yicha mahsulot topilmadi.</p> : null}
    </div>
  </section>;
}
