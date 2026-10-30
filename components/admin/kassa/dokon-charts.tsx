"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { money, type Currency } from "@/lib/kassa/rules";
import type { ChartRow } from "@/lib/dokon/stats";

const onceInView = (element: Element, run: () => void) => {
  const observer = new IntersectionObserver(([item]) => { if (item.isIntersecting) { observer.disconnect(); run(); } }, { threshold: .15 });
  observer.observe(element);
  return () => observer.disconnect();
};

/** Adds "in" once on screen: bars, lines, donuts and rings animate from CSS (kassa.css), so a new period glides from the old values. */
export function Reveal({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), [seen, setSeen] = useState(false);
  useEffect(() => ref.current ? onceInView(ref.current, () => setSeen(true)) : undefined, []);
  return <div ref={ref} className={`${className}${seen ? " in" : ""}`}>{children}</div>;
}

/** Counts from 0 when first seen (~1.5 s), then from the old value to a new one. */
export function Count({ value, currency, sign, className }: { value: number; currency?: Currency; sign?: boolean; className?: string }) {
  const ref = useRef<HTMLElement>(null), current = useRef(0), seen = useRef(false), [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    const run = () => {
      seen.current = true;
      const from = current.current, started = performance.now(), duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1500;
      const step = (time: number) => {
        const progress = duration ? Math.min(1, (time - started) / duration) : 1;
        current.current = progress >= 1 ? value : Math.round(from + (value - from) * (1 - (1 - progress) ** 4));
        setShown(current.current);
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    const stop = seen.current || !ref.current ? (run(), undefined) : onceInView(ref.current, run);
    return () => { stop?.(); cancelAnimationFrame(frame); };
  }, [value]);
  return <b ref={ref} className={className}>{currency ? money(shown, currency, sign) : `${shown}%`}</b>;
}

/** Two bars per column, a line over them; hover, focus or a tap shows the column's numbers. */
export function BarsChart({ rows, labels, tones, currency, area }: { rows: ChartRow[]; labels: [string, string, string]; tones: [string, string]; currency: Currency; area?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const lines = rows.map(row => row.line);
  const high = Math.max(1, ...rows.flatMap(row => [row.a, row.b]), ...lines), low = Math.min(0, ...lines), span = high - low;
  const point = (row: ChartRow, index: number) => `${((index + .5) / rows.length * 1000).toFixed(1)} ${(200 * (1 - (row.line - low) / span)).toFixed(1)}`;
  const path = `M${rows.map(point).join("L")}`, floor = 200 * high / span, step = Math.ceil(rows.length / 8);
  const shown = active === null ? null : rows[active];
  return <div className="dokon-chart" onMouseLeave={() => setActive(null)}>
    <div className="dokon-legend"><span><i className={tones[0]}/>{labels[0]}</span><span><i className={tones[1]}/>{labels[1]}</span><span><i className="dokon-line-key"/>{labels[2]}</span></div>
    <div className="dokon-plot">
      {rows.map((row, index) => <button key={row.full} type="button" aria-label={`${row.full}: ${labels[0]} ${money(row.a, currency)}, ${labels[1]} ${money(row.b, currency)}, ${labels[2]} ${money(row.line, currency)}`} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onClick={() => setActive(index)}>
        <span style={{ height: `${high / span * 100}%` }}>
          <i className={tones[0]} style={{ height: `${row.a / high * 100}%`, transitionDelay: `${index * 25}ms` }}/>
          <i className={tones[1]} style={{ height: `${row.b / high * 100}%`, transitionDelay: `${index * 25 + 40}ms` }}/>
        </span>
      </button>)}
      <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden>
        <defs><linearGradient id="dokon-line" x1="0" x2="1"><stop stopColor="#7c5cff"/><stop offset="1" stopColor="#22d3ee"/></linearGradient><linearGradient id="dokon-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f59e0b" stopOpacity=".28"/><stop offset="1" stopColor="#f59e0b" stopOpacity="0"/></linearGradient></defs>
        {area && <path className="dokon-area" d={`${path}L${((rows.length - .5) / rows.length * 1000).toFixed(1)} ${floor.toFixed(1)}L${(500 / rows.length).toFixed(1)} ${floor.toFixed(1)}Z`} fill="url(#dokon-area)"/>}
        <path className="dokon-stroke" d={path} pathLength={1} fill="none" stroke={area ? "#f59e0b" : "url(#dokon-line)"} strokeWidth="3" vectorEffect="non-scaling-stroke"/>
      </svg>
      {shown && <div className="dokon-tip" style={{ left: `clamp(75px, ${(active! + .5) / rows.length * 100}%, calc(100% - 75px))` }}><b>{shown.full}</b><span>{labels[0]}: {money(shown.a, currency)}</span><span>{labels[1]}: {money(shown.b, currency)}</span><span>{labels[2]}: {money(shown.line, currency)}</span></div>}
    </div>
    <div className="dokon-axis">{rows.map((row, index) => <span key={row.full}>{index % step === 0 ? row.label : ""}</span>)}</div>
  </div>;
}

const COLORS = ["#7c5cff", "#22d3ee", "#f59e0b", "#fb7185", "#34d399"];
type Part = { name: string; value: number; pct: number };

function Donut({ parts }: { parts: Part[] }) {
  return <Reveal className="dokon-donut">
    <svg viewBox="0 0 150 150" aria-hidden><circle cx="75" cy="75" r="58" stroke="rgba(255,255,255,.07)" pathLength={100}/>{parts.map((part, index) => {
      const style = { "--d": part.pct, strokeDashoffset: -parts.slice(0, index).reduce((sum, item) => sum + item.pct, 0) } as React.CSSProperties;
      return <circle key={part.name} className="dokon-seg" cx="75" cy="75" r="58" stroke={COLORS[index]} pathLength={100} style={style}/>;
    })}</svg>
    <ul>{parts.map((part, index) => <li key={part.name}><i style={{ background: COLORS[index] }}/>{part.name}<b>{part.pct}%</b></li>)}</ul>
  </Reveal>;
}

/** The dashboard's $ / so‘m switch: the chart and the donut follow it, currencies never add up. */
export function KassaPanels({ charts, debts, latest }: { charts: Record<Currency, { rows: ChartRow[]; parts: Part[] }>; debts: ReactNode; latest: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("USD"), { rows, parts } = charts[currency];
  return <>
    <section className="glass dokon-box">
      <h2>Kassa: kirim va chiqim<span className="seg" role="group" aria-label="Valyuta">{(["USD", "UZS"] as const).map(item => <button key={item} type="button" className={currency === item ? "on" : undefined} aria-pressed={currency === item} onClick={() => setCurrency(item)}>{item === "USD" ? "$" : "so‘m"}</button>)}</span></h2>
      <Reveal className="dokon-reveal"><BarsChart rows={rows} labels={["Kirim", "Chiqim", "Sof farq"]} tones={["col-in", "col-out"]} currency={currency}/></Reveal>
    </section>
    <div className="dokon-two">
      {debts}
      <section className="glass dokon-box"><h2>Chiqim — nimaga ketdi</h2>{parts.length ? <Donut parts={parts}/> : <p className="kassa-empty">Bu davrda chiqim yo‘q.</p>}{latest}</section>
    </div>
  </>;
}
