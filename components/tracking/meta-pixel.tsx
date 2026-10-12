"use client";
// Meta Pixel on public pages only (never /admin). Nothing loads when NEXT_PUBLIC_META_PIXEL_ID is empty.
// PageView on every route change; ViewContent and Lead come from the product pages and the lead forms.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pixelAllowed } from "@/lib/meta/pixel-rules";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ?? "";
type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[]; push: Fbq; loaded: boolean; version: string };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

function loadPixel(id: string) {
  if (window.fbq) return;
  const fbq = function (...args: unknown[]) { if (fbq.callMethod) fbq.callMethod(...args); else fbq.queue.push(args); } as Fbq;
  fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
  window.fbq = fbq; window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true; script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  fbq("init", id);
}

/** A Pixel event when the Pixel is on (no-op otherwise); `eventId` lets Meta match it with the server event. */
export function trackMeta(event: "ViewContent" | "Lead", params: Record<string, unknown> = {}, eventId?: string) {
  if (typeof window === "undefined" || !window.fbq || !PIXEL_ID || !pixelAllowed(window.location.pathname)) return;
  window.fbq("track", event, params, eventId ? { eventID: eventId } : undefined);
}

/** A fresh event id for one Lead (Pixel + Conversions API). */
export function newMetaEventId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(36).slice(2, 12)}`;
}

export function MetaPixel() {
  const pathname = usePathname();
  useEffect(() => {
    if (!PIXEL_ID || !pixelAllowed(pathname)) return;
    loadPixel(PIXEL_ID);
    window.fbq?.("track", "PageView");
  }, [pathname]);
  return null;
}

/** ViewContent once per product page view. */
export function MetaViewContent({ id, name, value, currency = "UZS" }: { id: string; name: string; value?: number | null; currency?: string }) {
  useEffect(() => {
    // After MetaPixel's effect (parent effects run later), so fbq exists by the next tick.
    const timer = window.setTimeout(() => trackMeta("ViewContent", { content_ids: [id], content_name: name, content_type: "product", ...(value ? { value, currency } : {}) }), 0);
    return () => window.clearTimeout(timer);
  }, [id, name, value, currency]);
  return null;
}
