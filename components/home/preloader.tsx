"use client";

import { useRef } from "react";
import { gsap, motionQueries, SplitText, useGSAP } from "@/lib/motion/gsap";
import { releaseIntro } from "@/lib/motion/intro";
import { lockScroll } from "@/lib/motion/scroll";
import { InlineScript } from "@/components/motion/inline-script";
import "./preloader.css";

const SESSION_KEY = "bk-intro";
/** Whole intro, first byte to open doors, must stay inside this many seconds. */
const BUDGET = 1.5;
// data-mode: "play" = run the preloader, "direct" = hero animates in by itself, "none" = reduced motion, "done" = finished.
// Decided before first paint so returning visitors never see the overlay flash.
const decideMode = `(function(){var p=document.getElementById("bk-preloader");if(!p)return;var m="direct";try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)m="none";else if(!location.hash&&!sessionStorage.getItem("${SESSION_KEY}"))m="play"}catch(e){m="none"}p.setAttribute("data-mode",m)})()`;

const arms = [0, 60, 120, 180, 240, 300];

function Crystal() {
  return <svg className="bk-pre-crystal" viewBox="-60 -60 120 120" aria-hidden="true">
    {arms.map(angle => <g key={angle} transform={`rotate(${angle})`}>
      <line x1="0" y1="-9" x2="0" y2="-54"/>
      <path className="bk-pre-branch" d="M-12 -34 L0 -22 L12 -34"/>
      <path className="bk-pre-branch" d="M-8 -46 L0 -38 L8 -46"/>
    </g>)}
    <polygon points="0,-9 7.8,-4.5 7.8,4.5 0,9 -7.8,4.5 -7.8,-4.5"/>
  </svg>;
}

export function Preloader() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const el = root.current;
    if (!el) return;
    // Client-side navigations never get the inline script: animate the hero directly.
    if (!el.dataset.mode) el.dataset.mode = window.matchMedia(motionQueries.reduced).matches ? "none" : "direct";
    // Hydrated so late that the CSS failsafe already removed the overlay — don't bring it back.
    if (el.dataset.mode === "play" && performance.now() > 3800) el.dataset.mode = "direct";
    if (el.dataset.mode !== "play") { releaseIntro(); return; }

    const unlock = lockScroll();
    const finish = () => {
      releaseIntro();
      el.dataset.mode = "done";
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
      unlock();
    };
    const media = gsap.matchMedia();
    media.add({ desktop: motionQueries.desktop, mobile: motionQueries.mobile }, (context) => {
      const { desktop } = context.conditions as { desktop: boolean };
      const q = gsap.utils.selector(el);
      const fogs = q(".bk-pre-fog");
      const tl = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: finish });

      tl.fromTo(fogs, { autoAlpha: 0, scale: .7 }, { autoAlpha: 1, scale: 1, duration: .6, stagger: .08 }, 0)
        .fromTo(".bk-pre-crystal", { rotate: -30, scale: .85, autoAlpha: .45 }, { rotate: 30, scale: 1.06, autoAlpha: 1, duration: .6, ease: "power2.out" }, 0)
        .fromTo(".bk-pre-branch", { scale: .2, autoAlpha: 0, transformOrigin: "50% 100%" }, { scale: 1, autoAlpha: 1, duration: .38, stagger: .025 }, .04)
        .fromTo(".bk-pre-line i", { scaleX: 0 }, { scaleX: 1, duration: .9, ease: "power1.inOut" }, 0)
        // the crystal condenses into the brand mark
        .to(".bk-pre-crystal", { scale: .3, rotate: 90, autoAlpha: 0, duration: .3, ease: "power3.in" }, .45)
        .fromTo(".bk-pre-mark", { scale: .4, rotate: -90, autoAlpha: 0 }, { scale: 1, rotate: 0, autoAlpha: 1, duration: .4, ease: "back.out(1.7)" }, .62)
        .call(releaseIntro, [], 1)
        .to(".bk-pre-core", { y: -24, autoAlpha: 0, duration: .22, ease: "power2.in" }, 1)
        .to(fogs, { scale: 1.5, autoAlpha: 0, duration: .45, ease: "power2.in" }, 1)
        .to(".bk-pre-door-top", { yPercent: -100, duration: .5, ease: "power4.inOut" }, 1)
        .to(".bk-pre-door-bottom", { yPercent: 100, duration: .5, ease: "power4.inOut" }, 1);

      if (desktop) {
        const word = SplitText.create(".bk-pre-word", { type: "chars" });
        tl.set(".bk-pre-word", { autoAlpha: 1 }, .64)
          .from(word.chars, { yPercent: 110, duration: .3, stagger: .01, ease: "power4.out" }, .64)
          .to(fogs, { xPercent: (index: number) => [-9, 11, -6][index] ?? 0, duration: 1.5, ease: "none" }, 0);
      } else {
        tl.fromTo(".bk-pre-word", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .3 }, .64);
      }
      // Hydration time counts against the budget: play faster rather than run long.
      const elapsed = performance.now() / 1000;
      tl.timeScale(tl.duration() / Math.max(.75, BUDGET - elapsed));
    });
    return () => {
      media.revert();
      unlock();
    };
  }, { scope: root });

  return <div ref={root} id="bk-preloader" className="bk-preloader" aria-hidden="true" suppressHydrationWarning>
    <InlineScript html={decideMode}/>
    <div className="bk-pre-door bk-pre-door-top"/>
    <div className="bk-pre-door bk-pre-door-bottom"/>
    <div className="bk-pre-fog bk-pre-fog-1"/>
    <div className="bk-pre-fog bk-pre-fog-2"/>
    <div className="bk-pre-fog bk-pre-fog-3"/>
    <div className="bk-pre-core">
      <span className="bk-pre-emblem"><Crystal/><span className="bk-pre-mark">✳</span></span>
      <span className="bk-pre-word">BUYUK KARAVAN</span>
      <div className="bk-pre-line"><i/></div>
    </div>
  </div>;
}
