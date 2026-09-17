"use client";
import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

export function HomeMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const desktop = window.matchMedia("(min-width: 701px)").matches;
    const lenis = new Lenis({ duration: desktop ? 1.05 : .8, smoothWheel: desktop });
    let frame = 0;
    function raf(time: number) { lenis.raf(time); frame = requestAnimationFrame(raf); }
    frame = requestAnimationFrame(raf);
    lenis.on("scroll", ScrollTrigger.update);
    const ctx = gsap.context(() => {
      gsap.from(".hero-copy > *", { opacity: 0, y: desktop ? 28 : 12, duration: .85, stagger: .12, ease: "power2.out", delay: .12 });
      gsap.from(".hero-temp", { opacity: 0, y: 20, duration: .8, delay: .55, ease: "power2.out" });
      if (desktop) gsap.to(".room-front", { y: 55, scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 } });
      gsap.utils.toArray<HTMLElement>(".solution-row, .equipment-card, .reason-row").forEach((el) => gsap.from(el, { opacity: 0, y: desktop ? 24 : 12, duration: .7, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 90%", once: true } }));
      gsap.utils.toArray<HTMLElement>(".project-card").forEach((el, index) => gsap.from(el, { opacity: 0, y: desktop ? 30 : 14, duration: .85, delay: desktop ? index * .08 : 0, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } }));
    });
    ScrollTrigger.refresh();
    return () => { ctx.revert(); cancelAnimationFrame(frame); lenis.destroy(); };
  }, []);
  return null;
}
