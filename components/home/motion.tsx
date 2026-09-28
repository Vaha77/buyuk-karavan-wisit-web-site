"use client";
import { useEffect } from "react";

export function HomeMotion() {
  useEffect(() => {
    const scrollToHash = (hash: string, behavior: ScrollBehavior = "smooth") => {
      if (hash === "#top") {
        window.scrollTo({ top: 0, left: 0, behavior });
        return;
      }
      const target = document.getElementById(decodeURIComponent(hash.replace(/^#/, "")));
      if (target) target.scrollIntoView({ behavior, block: "start" });
    };
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!anchor || !anchor.hash) return;
      const target = document.getElementById(decodeURIComponent(anchor.hash.slice(1)));
      if (!target) return;
      event.preventDefault();
      history.pushState(null, "", anchor.hash);
      scrollToHash(anchor.hash, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
    };
    document.addEventListener("click", onClick);
    if (location.hash) requestAnimationFrame(() => scrollToHash(location.hash, "auto"));
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
