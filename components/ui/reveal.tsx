"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { formatCount } from "./aurora";

const STAGGER = 110;

function count(el: HTMLElement) {
  const to = Number(el.dataset.count), pre = el.dataset.pre ?? "", suf = el.dataset.suf ?? "", start = performance.now();
  if (!Number.isFinite(to)) return;
  const frame = (now: number) => {
    const k = Math.min(1, (now - start) / 1600);
    el.textContent = pre + formatCount(to * (1 - (1 - k) ** 4)) + suf;
    if (k < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/**
 * The one IntersectionObserver of the site: every `.rv` element fades up when it enters the viewport
 * (siblings entering together are staggered), then its counters ([data-count]) run and bars/sparklines fill via `.in`.
 */
export function useReveal() {
  const pathname = usePathname();
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll(".rv").forEach(el => el.classList.add("in"));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach((entry, index) => {
        const el = entry.target as HTMLElement;
        observer.unobserve(el);
        el.style.setProperty("--d", `${Math.min(index, 6) * STAGGER}ms`);
        el.classList.add("in");
        (el.matches("[data-count]") ? [el] : []).concat([...el.querySelectorAll<HTMLElement>("[data-count]")]).forEach(count);
      });
    }, { threshold: 0.12 });
    const scan = () => document.querySelectorAll(".rv:not(.in)").forEach(el => observer.observe(el));
    scan();
    // Rows added later (filters, client navigation inside a page) are picked up once per frame.
    let frame = 0;
    // Counters only swap text nodes; skip those so a count-up doesn't rescan the page every frame.
    const mutations = new MutationObserver(records => {
      if (!records.some(record => [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE))) return;
      cancelAnimationFrame(frame); frame = requestAnimationFrame(scan);
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame); };
  }, [pathname]);
}

export function Reveal() {
  useReveal();
  return null;
}
