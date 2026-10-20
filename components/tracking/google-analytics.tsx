"use client";
// GA4 on public pages only (never /admin, /api — staff visits stay out of the statistics). Nothing loads without NEXT_PUBLIC_GA_ID.
// Page views on client navigation come from GA's enhanced measurement (history changes).
import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { contactMethod, pixelAllowed } from "@/lib/meta/pixel-rules";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() ?? "";
declare global { interface Window { gtag?: (...args: unknown[]) => void } }

/** A GA4 event when GA is on and the page is public (no-op otherwise). */
export function trackGa(event: "generate_lead" | "contact_click" | "madina_open", params: Record<string, unknown> = {}) {
  if (GA_ID && pixelAllowed(window.location.pathname)) window.gtag?.("event", event, params);
}

export function GoogleAnalytics() {
  const allowed = pixelAllowed(usePathname());
  useEffect(() => {
    if (!GA_ID) return;
    // Loaded on a public page, then navigated into /admin: GA's own opt-out switch stops every hit.
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = !allowed;
    if (!allowed) return;
    const onClick = (event: MouseEvent) => {
      const method = contactMethod(((event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null)?.href);
      if (method) trackGa("contact_click", { method });
    };
    const onTrack = (event: Event) => { if ((event as CustomEvent<string>).detail === "MADINA_OPEN") trackGa("madina_open"); };
    document.addEventListener("click", onClick, true);
    window.addEventListener("bk:track", onTrack);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("bk:track", onTrack); };
  }, [allowed]);
  if (!GA_ID || !allowed) return null;
  return <>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive"/>
    <Script id="ga-init" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`}</Script>
  </>;
}
