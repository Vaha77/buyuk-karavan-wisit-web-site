"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { gsap, motionQueries, SplitText, useGSAP } from "@/lib/motion/gsap";
import { onIntroRelease } from "@/lib/motion/intro";

/** The hero <section>: word-by-word headline reveal after the preloader, depth parallax on scroll. */
export function HeroStage({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(() => {
    const hero = root.current;
    if (!hero) return;
    const media = gsap.matchMedia();
    media.add({ desktop: motionQueries.desktop, mobile: motionQueries.mobile }, (context) => {
      const { desktop } = context.conditions as { desktop: boolean };
      const q = gsap.utils.selector(hero);
      // Only the headline variant on screen — words in the hidden one would just add stagger delay.
      // aria "none" keeps the real words readable to screen readers (no aria-label on a span).
      const split = SplitText.create(q(desktop ? ".hero-title-desktop" : ".hero-title-mobile"), { type: "words", wordsClass: "hero-word", mask: "words", tag: "span", aria: "none" });
      const layers = q(".hero-room, .hero-crates");

      const intro = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
      intro.set(q("h1"), { autoAlpha: 1 })
        .fromTo(layers, { autoAlpha: 0, scale: .94 }, { autoAlpha: 1, scale: 1, duration: 1.2, stagger: .08, ease: "power2.out" }, 0)
        .fromTo(q(".hero-fog"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2, ease: "none" }, 0)
        .fromTo(q(".hero-eyebrow"), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: .6 }, 0)
        .from(split.words, { yPercent: 100, duration: .9, stagger: .05, ease: "power4.out" }, .1)
        .fromTo(q(".hero-subtitle"), { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: .7 }, .45)
        // the buttons' CSS hover transition would smear every GSAP frame — off while they spring in
        .fromTo(q(".hero-actions > *"), { autoAlpha: 0, y: 24, scale: .9, transition: "none" }, { autoAlpha: 1, y: 0, scale: 1, duration: .7, stagger: .08, ease: "back.out(1.7)", clearProps: "transform,transition" }, .6)
        .fromTo(q(".hero-temp"), { autoAlpha: 0, x: 40 }, { autoAlpha: 1, x: 0, duration: .8 }, .7);
      const stopWaiting = onIntroRelease(() => intro.play());

      // Depth parallax: positive depth trails the scroll (far), negative outruns it (near). Halved on phones.
      const strength = desktop ? 1 : .5;
      q("[data-depth]").forEach((layer) => {
        const depth = Number((layer as HTMLElement).dataset.depth) * strength;
        gsap.to(layer, { y: () => hero.offsetHeight * depth, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
      });
      if (desktop) gsap.to(q(".hero-fog-front"), { xPercent: -6, duration: 9, ease: "sine.inOut", yoyo: true, repeat: -1 });
      return stopWaiting;
    });
    return () => media.revert();
  }, { scope: root });

  return <section ref={root} className="hero" style={style}>{children}</section>;
}
