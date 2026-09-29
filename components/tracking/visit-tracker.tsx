"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Keep in sync with lib/referrals/tracking.ts (server-only, so the names are repeated here).
const NOTICE_COOKIE = "bk_notice", VISITOR_COOKIE = "bk_vid", REF_COOKIE = "bk_ref", VISIT_COOKIE = "bk_visit", HANDOFF_PARAM = "_bk";
const YEAR = 365 * 86_400, MONTH = 30 * 86_400, HEARTBEAT_MS = 15_000;
type EventType = "PAGEVIEW" | "PRODUCT_VIEW" | "TEL_CLICK" | "TELEGRAM_CLICK" | "MADINA_OPEN" | "HEARTBEAT";

function readCookie(name: string) { return document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1]; }
function writeCookie(name: string, value: string, maxAge: number) { document.cookie = `${name}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; }
function send(type: EventType, path = location.pathname) {
  if (!readCookie(REF_COOKIE)) return;
  const body = JSON.stringify({ type, path });
  if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) void fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => undefined);
}

/** Other components report an event with: window.dispatchEvent(new CustomEvent("bk:track", { detail: "MADINA_OPEN" })). */
export function VisitTracker() {
  const pathname = usePathname();
  const isPublic = !pathname.startsWith("/admin");
  const [showNotice, setShowNotice] = useState(false);

  // Cookie notice first; tracking cookies only after it has been shown once.
  useEffect(() => {
    if (!isPublic) return;
    const url = new URL(location.href);
    const handoff = url.searchParams.get(HANDOFF_PARAM);
    if (handoff) { url.searchParams.delete(HANDOFF_PARAM); history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`); }
    const applyHandoff = (deferred: boolean) => {
      const [visitId, visitorId, linkId] = handoff?.split("~") ?? [];
      if (![visitId, visitorId, linkId].every(value => value && /^[A-Za-z0-9_-]{8,40}$/.test(value))) return;
      writeCookie(VISITOR_COOKIE, visitorId, YEAR); writeCookie(REF_COOKIE, linkId, MONTH); writeCookie(VISIT_COOKIE, visitId, MONTH);
      // When deferred, the page-view effect already ran before the cookie existed.
      if (deferred) { send("PAGEVIEW", location.pathname); if (/^\/products\/[^/]+/.test(location.pathname)) send("PRODUCT_VIEW", location.pathname); }
    };
    let frame = 0;
    if (readCookie(NOTICE_COOKIE) === "1") applyHandoff(false);
    else {
      writeCookie(NOTICE_COOKIE, "1", YEAR);
      // Show the notice first; tracking cookies are written on the next frame, after it has rendered.
      frame = requestAnimationFrame(() => { setShowNotice(true); frame = requestAnimationFrame(() => applyHandoff(true)); });
    }
    return () => cancelAnimationFrame(frame);
  }, [isPublic]);

  useEffect(() => {
    if (!isPublic) return;
    send("PAGEVIEW", pathname);
    if (/^\/products\/[^/]+/.test(pathname)) send("PRODUCT_VIEW", pathname);
  }, [isPublic, pathname]);

  useEffect(() => {
    if (!isPublic) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      if (link.href.startsWith("tel:")) send("TEL_CLICK");
      else if (/^https?:\/\/(?:t\.me|telegram\.me)\//i.test(link.href)) send("TELEGRAM_CLICK");
    };
    const onCustom = (event: Event) => { const type = (event as CustomEvent<string>).detail; if (type === "MADINA_OPEN" || type === "TEL_CLICK" || type === "TELEGRAM_CLICK") send(type); };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") send("HEARTBEAT"); }, HEARTBEAT_MS);
    document.addEventListener("click", onClick, true);
    window.addEventListener("bk:track", onCustom);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("bk:track", onCustom); window.clearInterval(timer); };
  }, [isPublic]);

  if (!isPublic || !showNotice) return null;
  return <div className="bk-cookie-notice" role="region" aria-label="Cookie haqida">
    <p>Sayt statistikasi uchun cookie fayllardan foydalanamiz.<span lang="ru">Мы используем cookie-файлы для статистики посещений.</span></p>
    <button type="button" onClick={() => setShowNotice(false)}>Tushunarli</button>
  </div>;
}
