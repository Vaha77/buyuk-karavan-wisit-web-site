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
      if (!target) return;
      // Land the section's content (not its padded box) ~12px under the header, i.e. ~90–100px from the viewport top.
      const header = document.querySelector<HTMLElement>(".site-header");
      const headerBottom = header && getComputedStyle(header).position === "fixed" ? header.getBoundingClientRect().bottom : 0;
      const offset = Math.max(headerBottom + 12, 16);
      const paddingTop = parseFloat(getComputedStyle(target).paddingTop) || 0;
      const top = target.getBoundingClientRect().top + window.scrollY + paddingTop - offset;
      window.scrollTo({ top: Math.max(0, top), left: 0, behavior });
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
