"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { X } from "lucide-react";

const DISMISSED = "bk-admin-install-dismissed";
type InstallEvent = Event & { prompt: () => Promise<void> };

/** Registers the admin service worker and shows a small "Ilovani o‘rnatish" banner (once dismissed, never again). */
export function AdminPwa() {
  const [install, setInstall] = useState<InstallEvent | null>(null), [ios, setIos] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin" }).catch(() => undefined);
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISSED) === "1"; } catch { /* private mode: show it */ }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (dismissed || standalone) return;
    const onPrompt = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // iOS Safari has no install prompt: a hint instead (after a tick, so it is not a synchronous effect update).
    const timer = /iphone|ipad|ipod/i.test(navigator.userAgent) ? setTimeout(() => setIos(true), 0) : undefined;
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); clearTimeout(timer); };
  }, []);
  const pathname = usePathname();
  const close = () => { setInstall(null); setIos(false); try { localStorage.setItem(DISMISSED, "1"); } catch { /* ignore */ } };
  // Only after signing in: not on the login / register / password pages.
  if ((!install && !ios) || /^\/admin\/(login|register|password)/.test(pathname)) return null;
  return <div className="admin-install" role="dialog" aria-label="Ilovani o‘rnatish">
    <Image src="/admin-icons/icon-192.png" alt="" width={36} height={36}/>
    <div><b>BK Admin ilovasi</b><span>{install ? "Telefon ekraniga o‘rnating" : "••• → Ulashish → Bosh ekranga qo‘shish"}</span></div>
    {install && <button type="button" className="admin-install-go" onClick={() => { void install.prompt(); close(); }}>O‘rnatish</button>}
    <button type="button" className="admin-install-close" aria-label="Yopish" onClick={close}><X size={16}/></button>
  </div>;
}
