"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Heavy blocks load their code only when they scroll into view, so the first screen comes up first.
const SellerRegionMap = dynamic(() => import("./seller-region-map").then(module => module.SellerRegionMap), { ssr: false });
const RegionLines = dynamic(() => import("./charts").then(module => module.RegionLines), { ssr: false });

function InView({ minHeight, children }: { minHeight: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), [shown, setShown] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setShown(true); observer.disconnect(); } }, { rootMargin: "200px" });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} style={shown ? undefined : { minHeight }}>{shown && children}</div>;
}

export const LazySellerMap = (props: React.ComponentProps<typeof SellerRegionMap>) => <InView minHeight={520}><SellerRegionMap {...props}/></InView>;
export const LazyRegionLines = (props: React.ComponentProps<typeof RegionLines>) => <InView minHeight={240}><RegionLines {...props}/></InView>;
