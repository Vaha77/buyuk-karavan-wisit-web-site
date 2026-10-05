"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const START_EVENT = "bk:navigation-start";
/** Call before router.push / router.replace so the top bar shows for programmatic navigation too. */
export function startNavigationProgress() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(START_EVENT));
}

export function Spinner({ large = false }: { large?: boolean }) {
  return <span className={`bk-spinner${large ? " is-lg" : ""}`} aria-hidden/>;
}

const SHOW_AFTER_MS = 150, GIVE_UP_MS = 15_000;
function sameDocument(url: URL) { return url.pathname === window.location.pathname && url.search === window.location.search; }

/** 3 px bar at the top of the screen for every page change (links, router.push, GET forms, back/forward); hidden when done under 150 ms. */
function NavigationProgressBar() {
  const pathname = usePathname(), search = useSearchParams().toString();
  const [width, setWidth] = useState(0), [visible, setVisible] = useState(false);
  const active = useRef(false), timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach(id => { window.clearTimeout(id); window.clearInterval(id); }); timers.current = []; };
  const finish = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    clear();
    setWidth(current => (current > 0 ? 100 : 0));
    timers.current.push(window.setTimeout(() => { setVisible(false); timers.current.push(window.setTimeout(() => setWidth(0), 300)); }, 220));
  }, []);
  const start = useCallback(() => {
    if (active.current) return;
    active.current = true;
    clear();
    setWidth(0);
    timers.current.push(window.setTimeout(() => {
      setVisible(true); setWidth(12);
      // Slow fill that never reaches the end on its own.
      timers.current.push(window.setInterval(() => setWidth(current => current + (90 - current) * 0.08), 200));
    }, SHOW_AFTER_MS));
    timers.current.push(window.setTimeout(finish, GIVE_UP_MS));
  }, [finish]);

  // The new page is on screen once the URL the router renders has changed.
  useEffect(() => { finish(); }, [pathname, search, finish]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || sameDocument(url)) return;
      start();
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null;
      // Only forms that navigate (GET search forms); server-action buttons show their own spinner.
      if (form && form.method === "get" && !form.getAttribute("action")?.startsWith("javascript")) start();
    };
    const onPop = () => start();
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("popstate", onPop);
    window.addEventListener(START_EVENT, start);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("submit", onSubmit, true); window.removeEventListener("popstate", onPop); window.removeEventListener(START_EVENT, start); clear(); };
  }, [start]);

  return <div className={`admin-nav-progress${visible ? " is-visible" : ""}`} style={{ width: `${width}%` }} role="progressbar" aria-hidden={!visible} aria-label="Sahifa yuklanmoqda"/>;
}
export function NavigationProgress() {
  return <Suspense fallback={null}><NavigationProgressBar/></Suspense>;
}

function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <Spinner/> : null;
}
/** A Link styled as a button that shows a spinner while its page loads. */
export function LinkButton({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return <Link href={href} className={className}><LinkPending/>{children}</Link>;
}

/** "Excel yuklab olish": fetch → blob → save, with "Tayyorlanmoqda…" + spinner meanwhile. */
export function DownloadButton({ href, className, label = "Excel yuklab olish", fallbackName = "fayl.xlsx" }: { href: string; className: string; label?: string; fallbackName?: string }) {
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const download = async () => {
    setBusy(true); setFailed(false);
    try {
      const response = await fetch(href, { credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <button type="button" className={className} onClick={download} disabled={busy} aria-busy={busy} title={failed ? "Yuklab bo‘lmadi — qayta urinib ko‘ring" : undefined}>
    {busy ? <><Spinner/>Tayyorlanmoqda…</> : failed ? "Qayta urinish" : label}
  </button>;
}

/** Keeps the old content visible (dimmed, with a spinner on top) while a transition loads the new one. */
export function PendingArea({ pending, children }: { pending: boolean; children: ReactNode }) {
  return <div className={`bk-pending${pending ? " is-pending" : ""}`} aria-busy={pending}>
    <div className="bk-pending-body">{children}</div>
    {pending && <div className="bk-pending-spinner"><Spinner large/></div>}
  </div>;
}

/** Content of a button that shows a spinner and "Saqlanmoqda…" while its action runs. */
export function BusyLabel({ busy, children, busyText = "Saqlanmoqda…" }: { busy: boolean; children: ReactNode; busyText?: string }) {
  return busy ? <><Spinner/>{busyText}</> : <>{children}</>;
}
