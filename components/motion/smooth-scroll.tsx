"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import "./smooth-scroll.css";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/motion/gsap";
import { setLenis } from "@/lib/motion/scroll";

/** Lenis smooth scrolling driven by GSAP's ticker, kept in sync with ScrollTrigger. Public pages only. */
export function SmoothScroll() {
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      // Touch keeps native scrolling (syncTouch off); nested scrollers like the Madina chat keep their own wheel.
      const lenis = new Lenis({ autoRaf: false, allowNestedScroll: true });
      const tick = (time: number) => lenis.raf(time * 1000);
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      setLenis(lenis);
      return () => {
        gsap.ticker.remove(tick);
        gsap.ticker.lagSmoothing(500, 33);
        setLenis(null);
        lenis.destroy();
      };
    });

    // Late images, video frames and webfonts change section heights — re-measure every trigger after them.
    let timer = 0;
    const refresh = () => { window.clearTimeout(timer); timer = window.setTimeout(() => ScrollTrigger.refresh(), 120); };
    const onMediaLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement || event.target instanceof HTMLVideoElement) refresh();
    };
    document.addEventListener("load", onMediaLoad, true);
    document.addEventListener("loadedmetadata", onMediaLoad, true);
    window.addEventListener("load", refresh);
    void document.fonts.ready.then(refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("load", onMediaLoad, true);
      document.removeEventListener("loadedmetadata", onMediaLoad, true);
      window.removeEventListener("load", refresh);
      media.revert();
    };
  });
  return null;
}
