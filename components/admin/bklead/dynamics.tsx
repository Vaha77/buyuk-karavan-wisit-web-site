"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatInt, formatUsd, formatUsdK } from "@/lib/dashboard/format";

// Dashboard "Dinamika": one card per metric (count-up, sparkline); the chosen card opens in the big chart below.
export type DynamicsMetric = {
  key: string; name: string; color: string; unit: "" | "$"; values: number[]; total: number; change: { text: string; down: boolean };
  /** Second line in the big chart (Lidlar → Hisob-kitoblar). */
  extra?: { name: string; color: string; values: number[] };
};

const STORE = "bk-dynamics", PHONE = "(max-width: 720px)";
const noSubscribe = () => () => {};
const onPhoneChange = (notify: () => void) => { const query = matchMedia(PHONE); query.addEventListener("change", notify); return () => query.removeEventListener("change", notify); };
const amount = (value: number, unit: string) => (unit ? formatUsd(value) : formatInt(value));
const axis = (value: number, unit: string) => (unit ? `$${formatUsdK(value)}` : formatInt(value));
/** Round axis maximum with 4 even steps. */
const nice = (max: number) => { const power = 10 ** Math.floor(Math.log10(max || 1)); return [1, 2, 2.5, 5, 10].find(step => step * power * 4 >= max)! * power * 4; };
/** Smooth line through the points that never dips below the baseline. */
function smooth(points: Array<[number, number]>, base: number) {
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i - 1] ?? points[i], b = points[i], c = points[i + 1], d = points[i + 2] ?? c;
    path += ` C${b[0] + (c[0] - a[0]) / 6},${Math.min(base, b[1] + (c[1] - a[1]) / 6)} ${c[0] - (d[0] - b[0]) / 6},${Math.min(base, c[1] - (d[1] - b[1]) / 6)} ${c[0]},${c[1]}`;
  }
  return path;
}

function useCountUp(to: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches, start = performance.now();
    let frame = 0;
    const step = (now: number) => { const k = reduced ? 1 : Math.min(1, (now - start) / 1100); setValue(to * (1 - (1 - k) ** 3)); if (k < 1) frame = requestAnimationFrame(step); };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return value;
}

function Card({ metric, on, onPick }: { metric: DynamicsMetric; on: boolean; onPick: () => void }) {
  const value = useCountUp(metric.total), max = Math.max(1, ...metric.values);
  const points = metric.values.map((v, i) => `${((i * 240) / Math.max(1, metric.values.length - 1)).toFixed(1)},${(40 - (34 * v) / max).toFixed(1)}`).join(" ");
  const relative = metric.change.text.includes("%");
  return <button type="button" className={`bk-dyn-card${on ? " is-on" : ""}`} style={{ "--c": metric.color } as React.CSSProperties} aria-pressed={on} onClick={onPick}>
    <span className="bk-dyn-title"><i/>{metric.name}</span>
    <b>{amount(value, metric.unit)}</b>
    <span className={`bk-dyn-change${metric.change.down ? " is-down" : ""}`}>{metric.change.text}{relative ? " o‘tgan davrga" : ""}</span>
    <svg viewBox="0 0 240 44" aria-hidden><polyline className="bk-dyn-spark" points={points} pathLength={1}/></svg>
  </button>;
}

function BigChart({ metric, weeks }: { metric: DynamicsMetric; weeks: string[] }) {
  const phone = useSyncExternalStore(onPhoneChange, () => matchMedia(PHONE).matches, () => false);
  const [tip, setTip] = useState<number | null>(null);
  // Taller and with larger letters on a phone (the SVG is scaled down to the screen width).
  const W = phone ? 320 : 900, H = phone ? 300 : 230, font = phone ? 14 : 12, L = phone ? 44 : 56, R = W - (phone ? 10 : 16), T = 14, B = H - 30;
  const n = metric.values.length, X = (i: number) => L + ((R - L) * i) / Math.max(1, n - 1), slot = (R - L) / n;
  const max = nice(Math.max(1, ...metric.values, ...(metric.extra?.values ?? []))), Y = (v: number) => B - ((B - T) * v) / max;
  const line = smooth(metric.values.map((v, i) => [X(i), Y(v)]), B), every = phone ? 3 : 2;
  const tipLeft = tip === null ? 0 : (X(tip) / W) * 100;
  return <div className="bk-dyn-big" style={{ "--c": metric.color } as React.CSSProperties} onPointerLeave={() => setTip(null)}>
    <svg key={`${metric.key}-${W}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric.name} · so‘nggi ${n} hafta`} style={{ fontSize: font }}>
      <defs><linearGradient id={`bk-dyn-${metric.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={metric.color} stopOpacity=".2"/><stop offset="1" stopColor={metric.color} stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(step => { const y = B - ((B - T) * step) / 4; return <g key={step}><line className="bk-dyn-grid" x1={L} x2={R} y1={y} y2={y}/><text x={L - 8} y={y + font / 3} textAnchor="end">{axis((max * step) / 4, metric.unit)}</text></g>; })}
      {metric.values.map((v, i) => <rect key={i} className="bk-dyn-bar" x={X(i) - slot * 0.21} y={Y(v)} width={slot * 0.42} height={B - Y(v)} rx={5} style={{ animationDelay: `${i * 35}ms` }}/>)}
      {weeks.map((week, i) => (i % every === 0 || i === n - 1) && <text key={week} x={X(i)} y={B + font + 8} textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"}>{week}</text>)}
      <path className="bk-dyn-area" d={`${line} L${R},${B} L${L},${B}Z`} fill={`url(#bk-dyn-${metric.key})`}/>
      {metric.extra && <path className="bk-dyn-line" d={smooth(metric.extra.values.map((v, i) => [X(i), Y(v)]), B)} stroke={metric.extra.color} pathLength={1}/>}
      <path className="bk-dyn-line" d={line} stroke={metric.color} pathLength={1}/>
      {metric.values.map((v, i) => <circle key={i} className="bk-dyn-dot" cx={X(i)} cy={Y(v)} r={tip === i ? 6.5 : 4.5} stroke={metric.color} style={{ animationDelay: `${0.5 + i * 0.05}s` }}/>)}
      {metric.values.map((_, i) => <rect key={i} x={X(i) - slot / 2} y={T} width={slot} height={B - T} fill="transparent" onPointerEnter={() => setTip(i)} onPointerDown={() => setTip(i)}/>)}
    </svg>
    {tip !== null && <div className="bk-dyn-tip" role="status" style={{ left: `${tipLeft}%`, top: `${(Y(metric.values[tip]) / H) * 100}%`, transform: `translate(${tipLeft < 20 ? "-10%" : tipLeft > 80 ? "-90%" : "-50%"}, calc(-100% - 12px))` }}>
      <b>{weeks[tip]} haftasi</b><span>{amount(metric.values[tip], metric.unit)}</span>{metric.unit ? "" : " ta"}
      {metric.extra && <small>{metric.extra.name}: {formatInt(metric.extra.values[tip])}</small>}
    </div>}
  </div>;
}

export function DynamicsCards({ metrics, weeks }: { metrics: DynamicsMetric[]; weeks: string[] }) {
  const saved = useSyncExternalStore(noSubscribe, () => { try { return localStorage.getItem(STORE); } catch { return null; } }, () => null);
  const [picked, setPicked] = useState<string | null>(null);
  const current = metrics.find(metric => metric.key === (picked ?? saved)) ?? metrics[0];
  const pick = (key: string) => { setPicked(key); try { localStorage.setItem(STORE, key); } catch { /* private mode */ } };
  return <>
    <div className="bk-dyn-cards" style={{ "--n": metrics.length } as React.CSSProperties}>{metrics.map(metric => <Card key={metric.key} metric={metric} on={metric.key === current.key} onPick={() => pick(metric.key)}/>)}</div>
    {current.extra && <div className="bk-legend" style={{ marginTop: 12 }}><span><i style={{ background: current.color, borderRadius: "50%" }}/>{current.name}</span><span><i style={{ background: current.extra.color, borderRadius: "50%" }}/>{current.extra.name}</span></div>}
    <BigChart metric={current} weeks={weeks}/>
  </>;
}
