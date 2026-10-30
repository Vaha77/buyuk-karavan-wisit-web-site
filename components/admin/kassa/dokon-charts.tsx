"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { money, type Currency } from "@/lib/kassa/rules";
import { barAxis, debtAxis, shortUsd, type ChartRow, type DebtPoint, type DebtUnit } from "@/lib/dokon/stats";

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
export function BarsChart({ rows, labels, tones, currency }: { rows: ChartRow[]; labels: [string, string, string]; tones: [string, string]; currency: Currency }) {
  const [active, setActive] = useState<number | null>(null);
  const lines = rows.map(row => row.line);
  const high = Math.max(1, ...rows.flatMap(row => [row.a, row.b]), ...lines), low = Math.min(0, ...lines), span = high - low;
  const point = (row: ChartRow, index: number) => `${((index + .5) / rows.length * 1000).toFixed(1)} ${(200 * (1 - (row.line - low) / span)).toFixed(1)}`;
  const path = `M${rows.map(point).join("L")}`, step = Math.ceil(rows.length / 8);
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
      {low < 0 && <div className="dokon-zero" style={{ bottom: `${-low / span * 100}%` }}/>}
      {rows.length === 1 ? <i className="dokon-dot" style={{ bottom: `${(rows[0].line - low) / span * 100}%` }}/> : <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden>
        <defs><linearGradient id="dokon-line" x1="0" x2="1"><stop stopColor="#7c5cff"/><stop offset="1" stopColor="#22d3ee"/></linearGradient></defs>
        <path className="dokon-stroke" d={path} pathLength={1} fill="none" stroke="url(#dokon-line)" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
      </svg>}
      {shown && <div className="dokon-tip" style={{ left: `clamp(75px, ${(active! + .5) / rows.length * 100}%, calc(100% - 75px))` }}><b>{shown.full}</b><span>{labels[0]}: {money(shown.a, currency)}</span><span>{labels[1]}: {money(shown.b, currency)}</span><span>{labels[2]}: {money(shown.line, currency)}</span></div>}
    </div>
    <div className="dokon-axis">{rows.map((row, index) => <span key={row.full}>{index % step === 0 ? row.label : ""}</span>)}</div>
  </div>;
}

const UNITS: Array<[DebtUnit, string]> = [["day", "Kun"], ["week", "Hafta"], ["month", "Oy"]];

/** "Olgan va bergan" of the Hodimlar page and the hodim page: bars on the left axis, the debt on its own right axis. */
export function DebtChart({ title, chart, debt, label, taken, given }: { title: string; chart: { opening: number; auto: DebtUnit; series: Record<DebtUnit, DebtPoint[]> }; debt: number; label: string; taken: number; given: number }) {
  const [unit, setUnit] = useState(chart.auto), [active, setActive] = useState<number | null>(null), rows = chart.series[unit];
  const left = barAxis(Math.max(...rows.flatMap(row => [row.a, row.b]))), top = left[left.length - 1];
  const right = debtAxis([...rows.map(row => row.line), ...(chart.opening ? [chart.opening] : [])]), low = right[0], span = right[right.length - 1] - low;
  const share = (value: number) => (value - low) / span, x = (index: number) => (index + .5) / rows.length;
  const path = rows.map((row, index) => `${index ? "L" : "M"}${(x(index) * 1000).toFixed(1)} ${(200 * (1 - share(row.line))).toFixed(1)}`).join("");
  const shown = active === null ? null : rows[active], changes = `+${money(taken, "USD")} · −${money(given, "USD")}`;
  const pace = Math.min(25, 600 / rows.length);
  return <section className="glass dokon-box">
    <h2>{title}<span className="debt-units" role="group" aria-label="Guruhlash">{UNITS.map(([key, name]) => <button key={key} type="button" className={`${unit === key ? "on" : ""}${key === "week" ? " debt-week" : ""}`} aria-pressed={unit === key} onClick={() => { setUnit(key); setActive(null); }}>{name}</button>)}</span></h2>
    <p className="debt-phone">Qarz: <b>{money(debt, "USD")}</b><span>{changes}</span></p>
    <div className="debt-sums">
      <div><span>Boshlang‘ich qarz (Excel’dan)</span><b className="debt-gold">{money(chart.opening, "USD")}</b></div>
      <div><span>{label}: olgan / bergan</span><b>{changes}</b></div>
      <div><span>Hozirgi umumiy qarz</span><b>{money(debt, "USD")}</b></div>
    </div>
    <div className="dokon-legend"><span><i className="debt-a"/>Olgan</span><span><i className="debt-b"/>Bergan</span><span><i className="debt-gold-key"/>Umumiy qarz</span></div>
    <Reveal className="debt-reveal"><div key={unit} className="debt-plot" onMouseLeave={() => setActive(null)}>
      <div className="debt-yl" aria-hidden>{left.map(value => <span key={value} style={{ bottom: `${value / top * 100}%` }}>{shortUsd(value)}</span>)}</div>
      <div className="debt-yr" aria-hidden>{right.map(value => <span key={value} style={{ bottom: `${share(value) * 100}%` }}>{shortUsd(value)}</span>)}</div>
      {left.map(value => <div key={value} className="debt-grid" style={{ bottom: `${value / top * 100}%` }}/>)}
      {rows.map((row, index) => <button key={row.full} type="button" className={row.today ? "is-today" : undefined} aria-label={`${row.full}: olgan ${money(row.a, "USD")}, bergan ${money(row.b, "USD")}, umumiy qarz ${money(row.line, "USD")}`} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onClick={() => setActive(index)}>
        <i className="debt-a" style={{ height: `${row.a / top * 100}%`, animationDelay: `${index * pace}ms` }}/>
        <i className="debt-b" style={{ height: `${row.b / top * 100}%`, animationDelay: `${index * pace + 40}ms` }}/>
        <em>{unit !== "day" || index % 3 === 0 || index === rows.length - 1 ? (unit === "day" || index % Math.ceil(rows.length / 8) === 0 ? row.label : "") : ""}</em>
      </button>)}
      <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden>
        <defs><linearGradient id="debt-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f59e0b" stopOpacity=".28"/><stop offset="1" stopColor="#f59e0b" stopOpacity="0"/></linearGradient></defs>
        <path className="debt-fill" d={`${path}L${(x(rows.length - 1) * 1000).toFixed(1)} 200L${(x(0) * 1000).toFixed(1)} 200Z`} fill="url(#debt-area)"/>
        <path className="debt-stroke" d={path} pathLength={1} fill="none" stroke="#f59e0b" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
      </svg>
      {rows.map((row, index) => (row.a > 0 || row.b > 0) && <i key={row.full} className="debt-dot" style={{ left: `${x(index) * 100}%`, bottom: `${share(row.line) * 100}%` }}/>)}
      {chart.opening > 0 && <div className="debt-opening" style={{ bottom: `${share(chart.opening) * 100}%` }}><b>Boshlang‘ich qarz {money(chart.opening, "USD")}</b></div>}
      {shown && <div className="debt-tip" style={{ left: `clamp(85px, ${x(active!) * 100}%, calc(100% - 85px))` }}><b>{shown.full}</b><span>Olgan<u>{money(shown.a, "USD")}</u></span><span>Bergan<u>{money(shown.b, "USD")}</u></span><span>Umumiy qarz<u>{money(shown.line, "USD")}</u></span></div>}
    </div></Reveal>
  </section>;
}

const COLORS = ["#7c5cff", "#22d3ee", "#f59e0b", "#fb7185", "#34d399"];
type Part = { name: string; value: number; pct: number };

export function Donut({ parts }: { parts: Part[] }) {
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
