// Aurora design system primitives (styles: app/globals.css "Aurora design system"). Server-safe: no hooks.
import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";

type Tone = "ok" | "wait" | "info" | "gold" | "red";
const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(" ");

export function AuroraBackground() {
  return <div className="aurora" aria-hidden="true"><i/><i/><i/></div>;
}

/** `blur` only for nav, sidebar and hero cards — list cards stay translucent for phone scrolling. */
export function GlassCard({ blur, reveal, className, ...props }: ComponentProps<"div"> & { blur?: boolean; reveal?: boolean }) {
  return <div className={cx(blur ? "glass glass-blur" : "glass", reveal && "rv", className)} {...props}/>;
}

export function Pill({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("pill", `pill-${tone}`, className)}>{children}</span>;
}

export function ChipGroup({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <div className={cx("chips", className)} role="group" aria-label={label}>{children}</div>;
}

/** A chip is a link when `href` is set (filters in the URL), otherwise a toggle button. */
export function Chip({ href, on, dashed, children, ...props }: { href?: string; on?: boolean; dashed?: boolean; children: ReactNode } & Omit<ComponentProps<"button">, "children">) {
  const className = cx("chip", on && "on", dashed && "dash", props.className);
  if (href) return <Link href={href} className={className} aria-current={on ? "true" : undefined} scroll={false}>{children}</Link>;
  return <button type="button" {...props} className={className} aria-pressed={on}>{children}</button>;
}

type ButtonProps = ({ href: string } & Omit<ComponentProps<typeof Link>, "href">) | ({ href?: undefined } & ComponentProps<"button">);
function button(base: string) {
  return function AuroraButton({ className, ...props }: ButtonProps) {
    if (props.href !== undefined) return <Link {...(props as ComponentProps<typeof Link>)} className={cx(base, className)}/>;
    return <button type="button" {...(props as ComponentProps<"button">)} className={cx(base, className)}/>;
  };
}
export const GradientButton = button("btn-g");
export const GhostButton = button("btn-ghost");

/** 0…1; fills when it scrolls into view (components/ui/reveal.tsx). */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return <div className={cx("bar rv", className)} style={{ "--w": Math.max(0, Math.min(1, value)) } as CSSProperties} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}><i/></div>;
}

/** Counts up from 0 when revealed; the server renders the final number (SEO, no-JS). */
export function StatCounter({ value, prefix = "", suffix = "", className }: { value: number; prefix?: string; suffix?: string; className?: string }) {
  return <b className={className} data-count={value} data-pre={prefix} data-suf={suffix}>{prefix}{formatCount(value)}{suffix}</b>;
}
export const formatCount = (value: number) => Math.round(value).toLocaleString("en-US").replace(/,/g, " ");

/** Line drawn with stroke-dashoffset on reveal. Needs ≥ 2 values. */
export function Sparkline({ values, className, height = 34 }: { values: number[]; className?: string; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1, step = 120 / (values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`).join(" ");
  return <svg className={cx("spark rv", className)} viewBox={`0 0 120 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, "--len": 1 } as CSSProperties} aria-hidden="true">
    <defs><linearGradient id="spark-g" x1="0" x2="1"><stop stopColor="#7c5cff"/><stop offset="1" stopColor="#22d3ee"/></linearGradient></defs>
    <path d={d} pathLength={1} stroke="url(#spark-g)" strokeWidth="2.5" fill="none" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

/** Phone bottom bar with a gradient FAB in the middle (hidden ≥ 768px). */
export function BottomNav({ items, fab, label }: { items: Array<{ href?: string; onClick?: () => void; label: string; icon: ReactNode; on?: boolean; badge?: number }>; fab?: { href: string; label: string; icon: ReactNode }; label: string }) {
  const half = Math.ceil(items.length / 2);
  const link = (item: (typeof items)[number]) => item.href
    ? <Link key={item.href} href={item.href} className={item.on ? "on" : undefined} aria-current={item.on ? "page" : undefined}>{item.icon}<span>{item.label}</span>{item.badge ? <em className="bottom-nav-badge">{item.badge}</em> : null}</Link>
    : <button key={item.label} type="button" onClick={item.onClick}>{item.icon}<span>{item.label}</span></button>;
  return <nav className="bottom-nav glass-blur" aria-label={label}>
    {items.slice(0, half).map(link)}
    {fab && <Link href={fab.href} className="fab" aria-label={fab.label}>{fab.icon}</Link>}
    {items.slice(half).map(link)}
  </nav>;
}
