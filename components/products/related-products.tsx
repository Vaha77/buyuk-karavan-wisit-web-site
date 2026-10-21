"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/products/types";
import { ProductCard } from "./product-card";

/** The page is ISR-cached, so the random order is drawn per visitor here (same category first, as the query does). */
export function RelatedProducts({ products, category, exchangeRate }: { products: Product[]; category: string; exchangeRate: string | null }) {
  const [items, setItems] = useState(products);
  useEffect(() => {
    const shuffled = products.map(item => [Math.random() + (item.category === category ? 0 : 1), item] as const).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
    const frame = requestAnimationFrame(() => setItems(shuffled));
    return () => cancelAnimationFrame(frame);
  }, [products, category]);
  return <div className="detail-related-grid">{items.map(item => <ProductCard product={item} exchangeRate={exchangeRate} key={item.id}/>)}</div>;
}
