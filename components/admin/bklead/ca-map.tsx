"use client";

import { useEffect, useRef, useState } from "react";
import caView from "@/lib/dashboard/maps/ca.json";
import { COUNTRY_NAMES, type CustomerCountry } from "@/lib/dashboard/regions";
import { calloutBox } from "./region-map";

type MapView = { viewBox: string; regions: Array<{ code: string; d: string; x: number; y: number; small: boolean; point?: boolean }>; countries: Array<{ code: string; d: string; x: number; y: number }> };
/** UZ, KZ, KG, TJ, TM on one Natural Earth admin-1 map (scripts/build-region-maps.mjs, view "ca"). */
export const CA_MAP: MapView = caView;
export const [CA_WIDTH, CA_HEIGHT] = CA_MAP.viewBox.split(" ").slice(2).map(Number);
export const countryOf = (code: string) => code.split("-")[0] as CustomerCountry;

type Box = { x: number; y: number; w: number; h: number };
// Opening view: Uzbekistan with Tajikistan, Kyrgyzstan and Turkmenistan; northern Kazakhstan may be cut off.
const START: Box = { x: 170, y: CA_HEIGHT - 549, w: 720, h: 549 };
const clamp = (box: Box): Box => {
  const w = Math.min(CA_WIDTH, Math.max(CA_WIDTH / 8, box.w)), h = w * CA_HEIGHT / CA_WIDTH;
  return { w, h, x: Math.min(CA_WIDTH - w, Math.max(0, box.x)), y: Math.min(CA_HEIGHT - h, Math.max(0, box.y)) };
};

/**
 * Zoom/pan for the map: wheel, drag, two-finger pinch, +/−/Hammasi buttons.
 * `s` = viewBox units per screen pixel; labels multiply their sizes by it, so they keep one on-screen size.
 */
export function useMapZoom() {
  const ref = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState(START);
  const [px, setPx] = useState(CA_WIDTH);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const zoomAt = (factor: number, fx = 0.5, fy = 0.5) => setBox(v => { const w = v.w * factor, h = v.h * factor; return clamp({ w, h, x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy }); });

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => setPx(entry.contentRect.width || CA_WIDTH));
    observer.observe(svg);
    // Native listener: React's wheel handler is passive and cannot stop the page from scrolling.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAt(event.deltaY > 0 ? 1.2 : 1 / 1.2, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => { observer.disconnect(); svg.removeEventListener("wheel", onWheel); };
  }, []);

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const rect = event.currentTarget.getBoundingClientRect(), next = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)![1];
      const before = Math.hypot(last.x - other.x, last.y - other.y), after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 0 && after > 0) zoomAt(before / after, ((next.x + other.x) / 2 - rect.left) / rect.width, ((next.y + other.y) / 2 - rect.top) / rect.height);
    } else {
      setBox(v => clamp({ ...v, x: v.x - (next.x - last.x) * v.w / rect.width, y: v.y - (next.y - last.y) * v.w / rect.width }));
    }
    moved.current += Math.abs(next.x - last.x) + Math.abs(next.y - last.y);
    pointers.current.set(event.pointerId, next);
  };
  const release = (event: React.PointerEvent) => { pointers.current.delete(event.pointerId); };

  return {
    box, s: box.w / px,
    svgProps: {
      ref, viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`, style: { touchAction: "none", "--s": box.w / px } as React.CSSProperties,
      onPointerDown: (event: React.PointerEvent) => { if (!pointers.current.size) moved.current = 0; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); },
      onPointerMove, onPointerUp: release, onPointerCancel: release, onPointerLeave: release,
      // A drag is not a click on the region under the pointer.
      onClickCapture: (event: React.MouseEvent) => { if (moved.current > 6) event.stopPropagation(); },
    },
    controls: <div className="bk-zoom">
      <button type="button" aria-label="Yaqinlashtirish" onClick={() => zoomAt(1 / 1.5)}>+</button>
      <button type="button" aria-label="Uzoqlashtirish" onClick={() => zoomAt(1.5)}>−</button>
      <button type="button" onClick={() => setBox({ x: 0, y: 0, w: CA_WIDTH, h: CA_HEIGHT })}>Hammasi</button>
    </div>,
  };
}

/** Country fill under the regions (no holes, e.g. Baikonur), drawn first. */
export function CountryBackground() {
  return <g aria-hidden="true" style={{ pointerEvents: "none" }}>{CA_MAP.countries.map(country => <path key={country.code} d={country.d} fill="#E6EBF2"/>)}</g>;
}

/** Country borders (thicker than region borders) and faint country names; a name moves off any callout in `avoid`. */
export function CountryLayer({ s, avoid }: { s: number; avoid: Array<{ x: number; y: number; w: number; h: number }> }) {
  const size = 14 * s;
  return <g aria-hidden="true" style={{ pointerEvents: "none" }}>
    {CA_MAP.countries.map(country => <path key={country.code} d={country.d} fill="none" stroke="#5B6B82" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>)}
    {CA_MAP.countries.map(country => {
      const name = COUNTRY_NAMES[country.code as CustomerCountry], w = name.length * size * 0.75;
      const hits = (y: number) => avoid.some(box => country.x - w / 2 < box.x + box.w && country.x + w / 2 > box.x && y - size < box.y + box.h && y > box.y);
      const y = [0, 1.6, -1.6, 3.2, -3.2].map(step => country.y - 18 * s + step * size).find(value => !hits(value)) ?? country.y;
      return <text key={country.code} x={country.x} y={y} textAnchor="middle" style={{ fill: "#5B6B82", opacity: 0.45, fontSize: size, fontWeight: 700, letterSpacing: 2 * s, textTransform: "uppercase" }}>{name}</text>;
    })}
  </g>;
}

/** Visible callout boxes, for CountryLayer to avoid. */
export const calloutBoxes = (items: Array<{ x: number; y: number; text: string }>, s: number, view: Box) => items.map(item => calloutBox(item.x, item.y, item.text, s, view));

/** Tooltip position (percent of the map box) for a pointer event or a focused area. */
export function tipAt(code: string, box: Box, event?: React.MouseEvent<SVGPathElement>, area?: { x: number; y: number }) {
  if (event) { const rect = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); return { code, x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 }; }
  return { code, x: (((area?.x ?? 0) - box.x) / box.w) * 100, y: (((area?.y ?? 0) - box.y) / box.h) * 100 };
}
