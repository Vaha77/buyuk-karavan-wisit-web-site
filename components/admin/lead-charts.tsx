"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Reveal } from "./kassa/dokon-charts";
import { useCountUp } from "./bklead/dynamics";
import { HEAT_FROM, HEAT_TO, LEAD_PERIODS, SOURCE_GROUPS, WEEKDAYS, type LeadPeriodKey, type LeadStats } from "@/lib/leads/stats-rules";

const Num = ({ value }: { value: number }) => <>{Math.round(useCountUp(value))}</>;
const Empty = () => <p className="lc-empty">Ma’lumot yo‘q</p>;
const Bar = ({ w, color, i }: { w: number; color: string; i: number }) => <div className="lc-bar"><b style={{ "--w": `${w}%`, background: color, transitionDelay: `${800 + i * 60}ms` } as React.CSSProperties}/></div>;

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values), d = "M" + values.map((v, i) => `${(i * 100 / Math.max(1, values.length - 1)).toFixed(1)},${(36 - v / max * 30).toFixed(1)}`).join(" L");
  return <svg className="lc-spark lc-wipe" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
    <path d={`${d} L100,40 L0,40Z`} fill={color} fillOpacity=".18"/><path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

function Area({ series }: { series: LeadStats["series"] }) {
  const [tip, setTip] = useState<number | null>(null), W = 760, H = 240, L = 34, R = W - 10, T = 10, B = H - 28, n = series.length;
  const max = Math.max(4, ...series.map(s => s.instagram + s.site + s.other)), x = (i: number) => L + (n > 1 ? i * (R - L) / (n - 1) : (R - L) / 2), y = (v: number) => B - v / max * (B - T);
  const stack = (upto: number) => series.map(p => SOURCE_GROUPS.slice(0, upto).reduce((sum, [key]) => sum + p[key], 0));
  const layers = SOURCE_GROUPS.map(([key, , color], k) => {
    if (series.every(p => !p[key])) return null;
    const top = "M" + stack(k + 1).map((v, i) => `${x(i)},${y(v)}`).join(" L"), base = stack(k).map((v, i) => `${x(i)},${y(v)}`).reverse().join(" L");
    return <g key={key}><path d={`${top} L${base}Z`} fill={color} fillOpacity=".28"/><path d={top} fill="none" stroke={color} strokeWidth="2"/></g>;
  });
  const every = Math.ceil(n / 8), s = tip === null ? null : series[tip];
  return <div className="lc-area" onMouseLeave={() => setTip(null)}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="So‘rovlar dinamikasi">
      {[0, 1, 2, 3, 4].map(g => <g key={g}><line x1={L} x2={R} y1={T + (B - T) * g / 4} y2={T + (B - T) * g / 4} stroke="rgba(255,255,255,.06)"/><text x={L - 8} y={T + (B - T) * g / 4 + 4} textAnchor="end">{Math.round(max - max * g / 4)}</text></g>)}
      {series.map((p, i) => i % every === 0 && <text key={i} x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>)}
      <g className="lc-wipe">{layers}<path d={"M" + series.map((p, i) => `${x(i)},${y(p.answered)}`).join(" L")} fill="none" stroke="#22d3ee" strokeWidth="3" strokeDasharray="6 5"/></g>
      {series.map((_, i) => <rect key={i} x={x(i) - (R - L) / n / 2} y={T} width={(R - L) / n} height={B - T} fill="transparent" onPointerEnter={() => setTip(i)} onPointerDown={() => setTip(i)}/>)}
    </svg>
    {s && <div className="lc-tip" style={{ left: `clamp(70px, ${x(tip!) / W * 100}%, calc(100% - 70px))` }}><b>{s.label}</b>{SOURCE_GROUPS.map(([key, name]) => <span key={key}>{name}: {s[key]}</span>)}<span style={{ color: "#22d3ee" }}>Javob berilgan: {s.answered}</span></div>}
  </div>;
}

function Donut({ sources, total }: { sources: LeadStats["sources"]; total: number }) {
  return <svg className="lc-donut" viewBox="0 0 150 150" aria-hidden>
    <circle cx="75" cy="75" r="58" stroke="rgba(255,255,255,.07)" pathLength={100}/>
    {sources.map((s, i) => { const d = s.value / total * 100, style = { "--d": d, strokeDashoffset: -sources.slice(0, i).reduce((sum, p) => sum + p.value / total * 100, 0), transitionDelay: `${300 + i * 250}ms` } as React.CSSProperties; return <circle key={s.key} className="lc-seg" cx="75" cy="75" r="58" stroke={s.color} pathLength={100} style={style}><title>{`${s.name}: ${s.value}`}</title></circle>; })}
    <text x="75" y="75" className="lc-donut-n">{total}</text><text x="75" y="93" className="lc-donut-l">so‘rov</text>
  </svg>;
}

export function LeadCharts({ period, stats }: { period: LeadPeriodKey; stats: LeadStats }) {
  const params = useSearchParams(), href = (key: string) => { const q = new URLSearchParams(params); q.delete("lead"); if (key === "7d") q.delete("period"); else q.set("period", key); return q.size ? `/admin/leads?${q}` : "/admin/leads"; };
  const empty = !stats.total, heatMax = Math.max(1, ...stats.heat.flat()), topProduct = Math.max(1, ...stats.products.map(p => p.value));
  return <div className="lc">
    <nav className="lc-chips" aria-label="Davr">{LEAD_PERIODS.map(([key, label]) => <Link key={key} href={href(key)} className={key === period ? "on" : undefined} aria-current={key === period ? "page" : undefined} scroll={false}>{label}</Link>)}</nav>
    <Reveal className="lc-kpis">
      {stats.kpis.map(k => <div key={k.key} className="lc-card lc-kpi" style={{ "--k": k.color } as React.CSSProperties}>
        <span className="lc-lbl"><i/>{k.name}</span><b className="lc-val"><Num value={k.value}/></b>
        <span className={`lc-dl${k.change.down ? " dn" : ""}`}>{k.change.text}</span><Spark values={k.spark} color={k.color}/>
      </div>)}
      <div className="lc-card lc-ring">
        <svg viewBox="0 0 74 74" aria-hidden><circle cx="37" cy="37" r="30" stroke="rgba(255,255,255,.07)" pathLength={100}/><circle className="lc-seg" cx="37" cy="37" r="30" stroke="url(#lc-ring)" pathLength={100} style={{ "--d": stats.answeredPct } as React.CSSProperties}/><defs><linearGradient id="lc-ring"><stop offset="0" stopColor="#8b5cf6"/><stop offset="1" stopColor="#22d3ee"/></linearGradient></defs></svg>
        <div><span className="lc-lbl">Javob berilgan</span><b className="lc-ring-pct"><Num value={stats.answeredPct}/>%</b><span className="lc-hint">{stats.answered} / {stats.total}</span></div>
      </div>
    </Reveal>
    <div className="lc-r2">
      <section className="lc-card"><h3>So‘rovlar dinamikasi</h3><p className="lc-hint">{period === "year" ? "Oylar" : period === "today" ? "Soatlar" : "Kunlar"} bo‘yicha, manba kesimida</p>
        <div className="lc-legend">{SOURCE_GROUPS.map(([key, name, color]) => <span key={key}><i style={{ background: color }}/>{name}</span>)}<span><i className="lc-line-key"/>Javob berilgan</span></div>
        {empty ? <Empty/> : <Reveal className="lc-reveal"><Area series={stats.series}/></Reveal>}</section>
      <section className="lc-card"><h3>Manbalar</h3><p className="lc-hint">Qayerdan kelyapti</p>
        {empty ? <Empty/> : <Reveal className="lc-reveal"><Donut sources={stats.sources} total={stats.total}/>
          {stats.sources.map((s, i) => <div key={s.key} className="lc-it"><div className="lc-row"><span>{s.name}</span><span>{s.value}</span></div><Bar w={s.value / stats.sources[0].value * 100} color={s.color} i={i}/></div>)}</Reveal>}</section>
    </div>
    <div className="lc-r3">
      <section className="lc-card"><h3>Sotuv voronkasi</h3><p className="lc-hint">So‘rovdan sotuvgacha</p>
        {empty ? <Empty/> : <Reveal className="lc-reveal">{stats.funnel.map((f, i) => <div key={f.name} className="lc-it"><div className="lc-row"><span>{f.name}</span><b>{f.value}{i > 0 && <small> · {f.pct}%</small>}</b></div><Bar w={Math.max(f.value / stats.total * 100, f.value ? 3 : 0)} color={["#22d3ee", "#8b5cf6", "#fbbf24", "#34d399"][i]} i={i}/></div>)}</Reveal>}</section>
      <section className="lc-card"><h3>Mahsulotlar bo‘yicha</h3><p className="lc-hint">Eng ko‘p so‘ralgan</p>
        {empty ? <Empty/> : <Reveal className="lc-reveal">{stats.products.map((p, i) => <div key={i} className="lc-it"><div className="lc-row"><span>{p.name}{p.price && <small> · {p.price}</small>}</span><span>{p.value}</span></div><Bar w={p.value / topProduct * 100} color="linear-gradient(90deg,#8b5cf6,#22d3ee)" i={i}/></div>)}</Reveal>}</section>
      <section className="lc-card"><h3>Qachon yozishadi</h3><p className="lc-hint">Hafta kuni × soat ({String(HEAT_FROM).padStart(2, "0")}–{HEAT_TO})</p>
        {empty ? <Empty/> : <Reveal className="lc-reveal"><div className="lc-heat">
          <span/>{stats.heat[0].map((_, h) => <span key={h}>{h % 2 ? "" : HEAT_FROM + h}</span>)}
          {stats.heat.map((row, d) => [<span key={`d${d}`}>{WEEKDAYS[d].slice(0, 2)}</span>, ...row.map((v, h) => <i key={`${d}-${h}`} title={`${WEEKDAYS[d]} ${HEAT_FROM + h}:00 — ${v} so‘rov`} style={{ background: `rgba(139,92,246,${(.08 + v / heatMax * .9).toFixed(2)})`, transitionDelay: `${1000 + (d * row.length + h) * 8}ms` }}/>)])}
        </div>{stats.peakText && <p className="lc-hint lc-peak">🔥 Eng faol: <b>{stats.peakText}</b></p>}</Reveal>}</section>
    </div>
  </div>;
}
