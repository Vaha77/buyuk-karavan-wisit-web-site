// The only place GSAP plugins are registered — every animated component imports from here.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/** gsap.matchMedia() conditions shared by the public site: full motion, lighter motion, none. */
export const motionQueries = {
  desktop: "(min-width: 701px) and (prefers-reduced-motion: no-preference)",
  mobile: "(max-width: 700px) and (prefers-reduced-motion: no-preference)",
  reduced: "(prefers-reduced-motion: reduce)",
} as const;

export { gsap, ScrollTrigger, SplitText, useGSAP };
