import type Lenis from "lenis";

// Lenis lives in <SmoothScroll/>; the preloader and anchor links reach it through here.
let lenis: Lenis | null = null;
let locks = 0;

export function setLenis(instance: Lenis | null) {
  lenis = instance;
  if (lenis && locks) lenis.stop();
}
export const getLenis = () => lenis;

/** Freeze page scroll (Lenis + native) until every lock is released. */
export function lockScroll() {
  locks += 1;
  document.documentElement.style.overflow = "hidden";
  lenis?.stop();
  return () => {
    locks = Math.max(0, locks - 1);
    if (locks) return;
    document.documentElement.style.overflow = "";
    lenis?.start();
  };
}

/** Scroll through Lenis when it runs, otherwise natively. */
export function scrollToY(top: number, smooth = true) {
  if (lenis) lenis.scrollTo(top, { immediate: !smooth });
  else window.scrollTo({ top, left: 0, behavior: smooth ? "smooth" : "auto" });
}
