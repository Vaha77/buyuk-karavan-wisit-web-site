"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function ProductDetailMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".detail-page");
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        const mobile = window.matchMedia("(max-width: 700px)").matches;
        const distance = mobile ? 34 : 26;
        const entrance = gsap.timeline({ defaults: { ease: "power3.out" } });
        entrance
          .fromTo(".detail-breadcrumb", { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: .55, immediateRender: false })
          .fromTo(".detail-gallery", { autoAlpha: 0, y: distance, scale: .98 }, { autoAlpha: 1, y: 0, scale: 1, duration: .8, immediateRender: false }, "-=.2")
          .fromTo(".detail-info > *", { autoAlpha: 0, y: distance }, { autoAlpha: 1, y: 0, duration: .62, stagger: .085, immediateRender: false }, "-=.47");
        const reveal = (selector: string, options: { stagger?: number; scale?: number } = {}) => {
          gsap.utils.toArray<HTMLElement>(selector, root).forEach((element, index) => {
            gsap.set(element, { autoAlpha: 0, y: distance, scale: options.scale || 1 });
            gsap.fromTo(element,
              { autoAlpha: 0, y: distance, scale: options.scale || 1 },
              { autoAlpha: 1, y: 0, scale: 1, duration: mobile ? .65 : .75, delay: (index % (mobile ? 2 : 4)) * (options.stagger || .09), ease: "power3.out", immediateRender: false,
                scrollTrigger: { trigger: element, start: "top 87%", once: true } });
          });
        };
        reveal(mobile ? ".detail-spec-section h2, .detail-spec-mobile, .detail-spec-note" : ".detail-spec-section h2, .detail-spec-column, .detail-spec-full, .detail-spec-note");
        reveal(".detail-description h2, .detail-description-copy");
        reveal(".detail-applications h2, .detail-application-card", { stagger: .09, scale: .97 });
        reveal(".detail-consultation-content > *");
        reveal(".detail-related h2, .detail-related .catalog-card", { stagger: .09, scale: .97 });
      }, root);
      let active = true;
      const refresh = () => { if (active) ScrollTrigger.refresh(); };
      requestAnimationFrame(refresh);
      void document.fonts.ready.then(refresh);
      window.addEventListener("load", refresh);
      window.addEventListener("orientationchange", refresh);
      return () => { active = false; window.removeEventListener("load", refresh); window.removeEventListener("orientationchange", refresh); context.revert(); };
    });
    return () => media.revert();
  }, []);
  return null;
}
