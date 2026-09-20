"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import Lenis from "lenis";

const one = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const many = <T extends Element = HTMLElement>(selector: string) => gsap.utils.toArray<T>(selector);
const setIfPresent = (selector: string, vars: gsap.TweenVars) => { const targets = many(selector); if (targets.length) gsap.set(targets, vars); };
function addFromTo(timeline: gsap.core.Timeline, selector: string, from: gsap.TweenVars, to: gsap.TweenVars, position?: gsap.Position) {
  const targets = many(selector); if (targets.length) timeline.fromTo(targets, from, to, position);
}
function addFrom(timeline: gsap.core.Timeline, selector: string, vars: gsap.TweenVars, position?: gsap.Position) {
  const targets = many(selector); if (targets.length) timeline.from(targets, vars, position);
}

function contourMotion(mobile: boolean) {
  const prefix = mobile ? ".hero-contour-mobile" : ".hero-contour-desktop";
  const path = document.querySelector<SVGPathElement>(`${prefix} path`);
  const beacon = document.querySelector<SVGGElement>(`${prefix} .hero-contour-beacon`);
  if (!path || !beacon) return;
  gsap.set(beacon, { autoAlpha: 1 });
  gsap.to(beacon, {
    motionPath: { path },
    duration: mobile ? 19 : 24,
    ease: "none",
    repeat: -1,
  });
  gsap.to(beacon, { opacity: 0.68, duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
  if (!mobile) {
    const trail = document.querySelector<SVGGElement>(`${prefix} .hero-contour-trail`);
    if (trail) {
      gsap.set(trail, { autoAlpha: 0.42 });
      gsap.to(trail, { motionPath: { path }, duration: 24, delay: 0.38, ease: "none", repeat: -1 });
    }
  }
}

function mobileMotion() {
  contourMotion(true);
  // Native window scrolling on iOS. Every scrolling item owns its trigger.
  setIfPresent(".header-inner, .hero-eyebrow, .hero-title-line, .hero-subtitle, .hero-actions .button, .hero-temp", { autoAlpha: 0 });
  setIfPresent(".header-inner", { y: -30 });
  setIfPresent(".hero-eyebrow", { y: 26 });
  setIfPresent(".hero-title-line", { y: 48 });
  setIfPresent(".hero-subtitle", { y: 35 });
  setIfPresent(".hero-actions .button", { y: 38 });
  setIfPresent(".hero-temp", { y: 32, scale: 0.94 });

  const hero = gsap.timeline({ defaults: { ease: "power3.out" } });
  addFromTo(hero,".header-inner",{autoAlpha:0,y:-30},{autoAlpha:1,y:0,duration:.75,immediateRender:false});
  addFromTo(hero,".hero-eyebrow",{autoAlpha:0,y:26},{autoAlpha:1,y:0,duration:.68,immediateRender:false},"-=0.2");
  addFromTo(hero,".hero-title-line",{autoAlpha:0,y:48},{autoAlpha:1,y:0,duration:.86,stagger:.15,immediateRender:false},"-=0.08");
  addFromTo(hero,".hero-subtitle",{autoAlpha:0,y:35},{autoAlpha:1,y:0,duration:.72,immediateRender:false},"-=0.12");
  addFromTo(hero,".hero-actions .button:first-child",{autoAlpha:0,y:38},{autoAlpha:1,y:0,duration:.7,immediateRender:false},"-=0.08");
  addFromTo(hero,".hero-actions .button:last-child",{autoAlpha:0,y:38},{autoAlpha:1,y:0,duration:.7,immediateRender:false},"-=0.48");
  addFromTo(hero,".hero-temp",{autoAlpha:0,y:32,scale:.94},{autoAlpha:1,y:0,scale:1,duration:.78,immediateRender:false},"-=0.18");
  const roomFront=one(".room-front"),heroSection=one(".hero");if(roomFront&&heroSection)gsap.to(roomFront,{y:24,ease:"none",scrollTrigger:{trigger:heroSection,start:"top top",end:"bottom top",scrub:.8}});

  const selectorTitle = document.querySelector<HTMLElement>(".selector-intro h2");
  if (selectorTitle) {
    gsap.set(selectorTitle, { autoAlpha: 0, y: 45 });
    gsap.fromTo(selectorTitle, { autoAlpha: 0, y: 45 }, { autoAlpha: 1, y: 0, duration: 0.82, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: selectorTitle, start: "top 82%", once: true } });
  }
  const selectorText = document.querySelector<HTMLElement>(".selector-intro > p:last-child");
  if (selectorText) {
    gsap.set(selectorText, { autoAlpha: 0, y: 36 });
    gsap.fromTo(selectorText, { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: 0.75, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: selectorText, start: "top 83%", once: true } });
  }
  gsap.utils.toArray<HTMLElement>(".type-card").forEach((card, index) => {
    gsap.set(card, { autoAlpha: 0, y: 42, scale: 0.94 });
    gsap.fromTo(card, { autoAlpha: 0, y: 42, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.7, delay: (index % 3) * 0.1, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: card, start: "top 84%", once: true } });
  });
  const selectorSteps = document.querySelector<HTMLElement>(".selector-steps");
  if (selectorSteps) {
    gsap.set(selectorSteps, { autoAlpha: 0, y: 40 });
    gsap.fromTo(selectorSteps, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.78, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: selectorSteps, start: "top 84%", once: true } });
  }

  const solutionsHeading = document.querySelector<HTMLElement>(".solutions-section .section-heading");
  if (solutionsHeading) {
    gsap.set(solutionsHeading, { autoAlpha: 0, y: 60 });
    gsap.fromTo(solutionsHeading, { autoAlpha: 0, y: 60 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: solutionsHeading, start: "top 80%", once: true } });
  }
  gsap.utils.toArray<HTMLElement>(".solution-row").forEach((card, index) => {
    const image = card.querySelector<HTMLElement>(".solution-image");
    const copy = card.querySelector<HTMLElement>(".solution-copy");
    const direction = index % 2 === 0 ? -1 : 1;
    gsap.set(card, { autoAlpha: 0, y: 40, scale: 0.97 });
    if (image) gsap.set(image, { autoAlpha: 0, x: direction * 35, scale: 0.94 });
    if (copy) gsap.set(copy, { autoAlpha: 0, x: -direction * 30, y: 16 });
    const timeline = gsap.timeline({ scrollTrigger: { trigger: card, start: "top 82%", once: true } });
    timeline.fromTo(card, { autoAlpha: 0, y: 40, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.68, ease: "power3.out", immediateRender: false });
    if (image) timeline.fromTo(image, { autoAlpha: 0, x: direction * 35, scale: 0.94 }, { autoAlpha: 1, x: 0, scale: 1, duration: 0.72, ease: "power3.out", immediateRender: false }, "-=0.32");
    if (copy) timeline.fromTo(copy, { autoAlpha: 0, x: -direction * 30, y: 16 }, { autoAlpha: 1, x: 0, y: 0, duration: 0.72, ease: "power3.out", immediateRender: false }, "-=0.36");
  });

  const equipmentHeading = document.querySelector<HTMLElement>(".equipment-section .section-heading");
  if (equipmentHeading) {
    gsap.set(equipmentHeading, { autoAlpha: 0, y: 45 });
    gsap.fromTo(equipmentHeading, { autoAlpha: 0, y: 45 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: equipmentHeading, start: "top 82%", once: true } });
  }
  gsap.utils.toArray<HTMLElement>(".equipment-card").forEach((card, index) => {
    gsap.set(card, { autoAlpha: 0, y: 40, scale: 0.94 });
    gsap.fromTo(card, { autoAlpha: 0, y: 40, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.72, delay: (index % 2) * 0.12, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: card, start: "top 84%", once: true } });
  });
  const equipmentAction = document.querySelector<HTMLElement>(".equipment-all");
  if (equipmentAction) {
    gsap.set(equipmentAction, { autoAlpha: 0, y: 35 });
    gsap.fromTo(equipmentAction, { autoAlpha: 0, y: 35 }, { autoAlpha: 1, y: 0, duration: 0.68, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: equipmentAction, start: "top 86%", once: true } });
  }

  gsap.utils.toArray<HTMLElement>(".temperature-values span, .temperature-values i").forEach((value, index) => {
    gsap.set(value, { autoAlpha: 0, y: 50 });
    gsap.fromTo(value, { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: 0.8, delay: index * 0.12, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: value, start: "top 82%", once: true } });
  });
  const scaleLine = document.querySelector<HTMLElement>(".scale-line");
  if (scaleLine) {
    gsap.set(scaleLine, { scaleX: 0, transformOrigin: "left center" });
    gsap.fromTo(scaleLine, { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: scaleLine, start: "top 82%", once: true } });
  }
  gsap.utils.toArray<HTMLElement>(".range-grid > div").forEach((item, index) => {
    gsap.set(item, { autoAlpha: 0, y: 35 });
    gsap.fromTo(item, { autoAlpha: 0, y: 35 }, { autoAlpha: 1, y: 0, duration: 0.7, delay: (index % 2) * 0.1, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: item, start: "top 85%", once: true } });
  });

  const projectsHeading = document.querySelector<HTMLElement>(".projects-section .section-heading");
  if (projectsHeading) {
    gsap.set(projectsHeading, { autoAlpha: 0, y: 45 });
    gsap.fromTo(projectsHeading, { autoAlpha: 0, y: 45 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: projectsHeading, start: "top 82%", once: true } });
  }
  gsap.utils.toArray<HTMLElement>(".project-card").forEach((card) => {
    gsap.set(card, { autoAlpha: 0, y: 50, scale: 0.94 });
    gsap.fromTo(card, { autoAlpha: 0, y: 50, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.86, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: card, start: "top 82%", once: true } });
  });
  const projectsAction = document.querySelector<HTMLElement>(".projects-all");
  if (projectsAction) {
    gsap.set(projectsAction, { autoAlpha: 0, y: 35 });
    gsap.fromTo(projectsAction, { autoAlpha: 0, y: 35 }, { autoAlpha: 1, y: 0, duration: 0.68, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: projectsAction, start: "top 86%", once: true } });
  }

  const reasonsHeading = document.querySelector<HTMLElement>(".reasons-section .section-heading");
  if (reasonsHeading) {
    gsap.set(reasonsHeading, { autoAlpha: 0, y: 50 });
    gsap.fromTo(reasonsHeading, { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: 0.82, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: reasonsHeading, start: "top 82%", once: true } });
  }
  gsap.utils.toArray<HTMLElement>(".reason-row").forEach((row, index) => {
    gsap.set(row, { autoAlpha: 0, y: 40 });
    gsap.fromTo(row, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.75, delay: index * 0.08, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: row, start: "top 84%", once: true } });
  });

  const ctaHeading = document.querySelector<HTMLElement>(".consultation-content h2");
  if (ctaHeading) {
    gsap.set(ctaHeading, { autoAlpha: 0, y: 50 });
    gsap.fromTo(ctaHeading, { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: 0.84, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: ctaHeading, start: "top 82%", once: true } });
  }
  const ctaCopy = document.querySelector<HTMLElement>(".consultation-content p");
  if (ctaCopy) {
    gsap.set(ctaCopy, { autoAlpha: 0, y: 35 });
    gsap.fromTo(ctaCopy, { autoAlpha: 0, y: 35 }, { autoAlpha: 1, y: 0, duration: 0.72, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: ctaCopy, start: "top 84%", once: true } });
  }
  gsap.utils.toArray<HTMLElement>(".consultation-actions .button").forEach((button, index) => {
    gsap.set(button, { autoAlpha: 0, y: 36 });
    gsap.fromTo(button, { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: 0.68, delay: index * 0.12, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: button, start: "top 85%", once: true } });
  });

  const footerBrand = document.querySelector<HTMLElement>(".footer-about");
  if (footerBrand) {
    gsap.set(footerBrand, { autoAlpha: 0, y: 45 });
    gsap.fromTo(footerBrand, { autoAlpha: 0, y: 45 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: footerBrand, start: "top 84%", once: true } });
  }
  gsap.utils.toArray<HTMLElement>(".footer-column").forEach((column) => {
    gsap.set(column, { autoAlpha: 0, y: 38 });
    gsap.fromTo(column, { autoAlpha: 0, y: 38 }, { autoAlpha: 1, y: 0, duration: 0.75, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: column, start: "top 85%", once: true } });
  });
  const footerBottom = document.querySelector<HTMLElement>(".footer-bottom");
  if (footerBottom) {
    gsap.set(footerBottom, { autoAlpha: 0, y: 30 });
    gsap.fromTo(footerBottom, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.68, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: footerBottom, start: "top 87%", once: true } });
  }
}

function desktopMotion() {
  contourMotion(false);
  const hero = gsap.timeline({ defaults: { ease: "power2.out" } });
  addFrom(hero,".header-inner",{autoAlpha:0,y:-16,duration:.7});
  addFrom(hero,".hero-copy > *",{autoAlpha:0,y:25,duration:.75,stagger:.11},"-=0.3");
  addFrom(hero,".hero-temp",{autoAlpha:0,y:18,duration:.65},"-=0.2");
  const roomFront=one(".room-front"),heroSection=one(".hero");if(roomFront&&heroSection)gsap.to(roomFront,{y:50,ease:"none",scrollTrigger:{trigger:heroSection,start:"top top",end:"bottom top",scrub:1}});
  const entrance = (target: Element | Element[], trigger: Element, extra: gsap.TweenVars = {}) => gsap.from(target, {
    autoAlpha: 0, y: 25, duration: 0.68, ease: "power2.out", ...extra,
    scrollTrigger: { trigger, start: "top 88%", once: true },
  });
  for (const selector of [".selector-intro", ".type-grid", ".selector-steps", ".solutions-section .section-heading", ".equipment-section .section-heading", ".temperature-copy", ".temperature-scale", ".projects-section .section-heading", ".reasons-section .section-heading", ".consultation-content", ".footer-grid"]) { const target=one(selector);if(target)entrance(target,target); }
  gsap.utils.toArray<HTMLElement>(".solution-row").forEach((row, index) => {
    entrance(row.querySelector(".solution-image") ?? row, row, { x: index % 2 ? -28 : 28, y: 0, duration: 0.7 });
    entrance(row.querySelector(".solution-copy") ?? row, row, { x: index % 2 ? 22 : -22, y: 0, delay: 0.1, duration: 0.7 });
  });
  const equipmentCards=many(".equipment-card"),equipmentGrid=one(".equipment-grid");if(equipmentCards.length&&equipmentGrid)entrance(equipmentCards,equipmentGrid,{scale:.97,y:15,stagger:.06});
  const projectCards=many(".project-card"),projectsGrid=one(".projects-grid");if(projectCards.length&&projectsGrid)entrance(projectCards,projectsGrid,{scale:.98,y:22,stagger:.1,duration:.8});
  const reasonRows=many(".reason-row"),reasonsList=one(".reasons-list");if(reasonRows.length&&reasonsList)entrance(reasonRows,reasonsList,{y:15,stagger:.09});
  const footerBottom=one(".footer-bottom");if(footerBottom)entrance(footerBottom,footerBottom,{y:10});
}

export function HomeMotion() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);
    const media = gsap.matchMedia();
    let active = true;
    let orientationTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { if (active) ScrollTrigger.refresh(); };
    const onOrientationChange = () => { orientationTimer = setTimeout(refresh, 250); };
    const pendingImages = many<HTMLImageElement>("main img, footer img").filter(image => !image.complete);
    pendingImages.forEach(image => { image.addEventListener("load", refresh, { once: true }); image.addEventListener("error", refresh, { once: true }); });
    window.addEventListener("load", refresh);
    window.addEventListener("orientationchange", onOrientationChange);
    const initialFrame = requestAnimationFrame(refresh);
    void document.fonts.ready.then(refresh);
    media.add("(max-width: 700px) and (prefers-reduced-motion: no-preference)", () => {
      // This branch intentionally has no Lenis or custom scroller.
      mobileMotion();
    });
    media.add("(min-width: 701px) and (prefers-reduced-motion: no-preference)", () => {
      const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
      let frame = 0;
      const raf = (time: number) => { lenis.raf(time); frame = requestAnimationFrame(raf); };
      frame = requestAnimationFrame(raf);
      lenis.on("scroll", ScrollTrigger.update);
      desktopMotion();
      ScrollTrigger.refresh();
      return () => { cancelAnimationFrame(frame); lenis.destroy(); };
    });
    return () => {
      active = false;
      cancelAnimationFrame(initialFrame);
      if (orientationTimer) clearTimeout(orientationTimer);
      window.removeEventListener("load", refresh);
      window.removeEventListener("orientationchange", onOrientationChange);
      pendingImages.forEach(image => { image.removeEventListener("load", refresh); image.removeEventListener("error", refresh); });
      media.revert();
    };
  }, []);
  return null;
}
