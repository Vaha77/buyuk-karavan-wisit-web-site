"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

// The chat (and its lead flow) is only fetched after the first open.
const ChatContent = dynamic(() => import("./madina-chat").then(module => module.ChatContent), { ssr: false });

type View = "greeting" | "minimized" | "open";
const greetingKey = "buyuk-karavan-madina-greeting-dismissed";

export function MadinaWidget() {
  const pathname = usePathname();
  const [view, setView] = useState<View>("minimized");
  const [hasOpened, setHasOpened] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (sessionStorage.getItem(greetingKey) !== "1") setView("greeting");
    }, 7000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const open = () => { setHasOpened(true); setView("open"); window.dispatchEvent(new CustomEvent("bk:track", { detail: "MADINA_OPEN" })); };
    window.addEventListener("madina:open", open);
    return () => window.removeEventListener("madina:open", open);
  }, []);
  useEffect(() => {
    if (view !== "open" || isAdmin) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setView("minimized"); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [view, isAdmin]);
  useEffect(() => {
    if (!mobile || view !== "open" || isAdmin) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const viewport = window.visualViewport;
    const updateViewport = () => setKeyboardOffset(viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0);
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    return () => { document.body.style.overflow = previous; setKeyboardOffset(0); viewport?.removeEventListener("resize", updateViewport); viewport?.removeEventListener("scroll", updateViewport); };
  }, [mobile, view, isAdmin]);

  if (isAdmin) return null;
  const dismiss = () => { sessionStorage.setItem(greetingKey, "1"); setView("minimized"); };
  const open = () => { setHasOpened(true); setView("open"); window.dispatchEvent(new CustomEvent("bk:track", { detail: "MADINA_OPEN" })); };
  return <div className={`madina-widget madina-view-${view}`} style={{ "--madina-keyboard": `${keyboardOffset}px` } as React.CSSProperties}>
    {hasOpened && <div hidden={view !== "open"}><ChatContent onMinimize={() => setView("minimized")} onClose={dismiss}/></div>}
    {view !== "open" && <>
      {view === "greeting" && <div className="madina-greeting"><button className="madina-greeting-main" type="button" onClick={open} aria-label="Madina bilan suhbatni boshlash"><i className="madina-m" aria-hidden="true">M</i><span><strong>Madina 👋</strong><span>Assalomu alaykum!<br/>Sizga nima yordam bera olaman?</span></span></button><button className="madina-greeting-close" type="button" onClick={dismiss} aria-label="Salomlashuvni yopish"><X size={15}/></button></div>}
      <button className="madina-launcher" type="button" onClick={open} aria-label="Madina AI suhbatini ochish"><i className="madina-m" aria-hidden="true">M</i><span>Madina AI · yozing</span></button>
    </>}
  </div>;
}
