"use client";

import { Moon, Sun } from "lucide-react";

export const THEME_KEY = "bk-theme";
const THEME_COLOR = { light: "#102c47", dark: "#141A24" } as const;

/**
 * Runs in <head> before the first paint: the saved choice, else the device setting — no white flash.
 * Kept as a string so it can be inlined; the toggle itself has no React state (CSS reads [data-theme]).
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;

/** Sun ↔ moon switch: the knob slides (0.4 s); the choice is remembered in localStorage. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const toggle = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: this page only */ }
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute("content", THEME_COLOR[next]));
  };
  return <button type="button" className={`theme-toggle ${className}`} onClick={toggle} aria-label="Rejimni almashtirish" title="Kunduzgi / tungi rejim">
    <i><Sun className="theme-sun" size={14} strokeWidth={2.4} aria-hidden="true"/><Moon className="theme-moon" size={14} aria-hidden="true"/></i>
  </button>;
}
