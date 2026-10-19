"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { regionPeriodAction, type RegionPeriodResult } from "@/app/admin/(protected)/customers/actions";
import { tashkentDay, type PeriodMode, type PeriodPoint } from "@/lib/customers/region-period";
import { AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";
import { countryStats, type CountryRow, type RegionStat, type RegionStats } from "@/lib/customers/region-stats";
import { formatInt, formatPercent, formatUsd, formatUsdK, MONTHS_LONG, MONTHS_SHORT } from "@/lib/dashboard/format";
import { foreignTones, TONE_FILL, TONE_TEXT, uzbekistanTones, type Tone } from "@/lib/dashboard/rules";
import { Callout } from "./region-map";
import { nice } from "@/lib/dashboard/rules";
import { smooth, useCountUp, usePhone } from "./dynamics";
import { CA_MAP as map, calloutBoxes, shapeOf, CountryBackground, CountryLayer, countryOf, tipAt, useMapZoom } from "./ca-map";
const shortName = (name: string) => name.replace(/ viloyati$/, "").replace(/ shahri$/, " sh.").replace(/ Respublikasi$/, "");

function GrowthBadge({ growth }: { growth: RegionStat["growth"] }) {
  if (!growth) return <span className="bk-muted">—</span>;
  if (!growth.relative) return <span className="bk-badge">yangi</span>;
  if (growth.direction === "flat") return <span className="bk-delta">0%</span>;
  const Icon = growth.direction === "up" ? ArrowUp : ArrowDown;
  return <span className={`bk-delta${growth.direction === "down" ? " is-down" : ""}`}><Icon size={11}/>{formatPercent(growth.value, 0)}</span>;
}

type SortKey = "total" | "name" | "customers" | "share" | "average" | "growth" | "lastMonth";
const COLUMNS: Array<{ key: SortKey; label: string; left?: boolean }> = [
  { key: "name", label: "Viloyat", left: true }, { key: "customers", label: "Mijozlar" }, { key: "total", label: "Jami, $" }, { key: "share", label: "Ulush" },
  { key: "average", label: "O‘rtacha / mijoz" }, { key: "growth", label: "O‘tgan yilga nisbatan" },
];
const growthValue = (region: RegionStat) => !region.growth ? -Infinity : !region.growth.relative ? Infinity : region.growth.direction === "down" ? -region.growth.value : region.growth.value;
const sortValue = (region: RegionStat, key: SortKey) => key === "name" ? region.name : key === "growth" ? growthValue(region) : key === "lastMonth" ? region.lastMonth ?? 0 : region[key];

/** One 5-country map coloured by regular customer sales, region detail, sortable region ranking and the top-5 monthly chart. */
export function CustomerRegions({ stats }: { stats: RegionStats }) {
  const ranked = stats.regions;
  const [selected, setSelected] = useState<string>(ranked[0]?.code ?? "UZ-TO");
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "total", dir: -1 });
  const detailRef = useRef<HTMLElement>(null);

  const byCode = useMemo(() => new Map(ranked.map(region => [region.code, region])), [ranked]);
  const rankOf = useMemo(() => new Map(ranked.map((region, index) => [region.code, index + 1])), [ranked]);
  // Tones per country as before: UZ ranked, other countries on the foreign scale.
  const tones: Record<string, Tone> = useMemo(() => Object.assign({}, ...["UZ", "KZ", "KG", "TJ", "TM"].map(country => (country === "UZ" ? uzbekistanTones : foreignTones)(ranked.filter(region => countryOf(region.code) === country).map(region => ({ code: region.code, count: region.total }))))), [ranked]);
  const rows = useMemo(() => [...ranked].sort((a, b) => {
    const left = sortValue(a, sort.key), right = sortValue(b, sort.key);
    const order = typeof left === "string" ? left.localeCompare(right as string) : (left as number) - (right as number);
    return order * sort.dir || (rankOf.get(a.code)! - rankOf.get(b.code)!);
  }), [ranked, sort, rankOf]);
  const region = byCode.get(selected) ?? ranked[0];
  const hovered = hover ? byCode.get(hover.code) : null;
  const zoom = useMapZoom(), s = zoom.s;
  const calloutText = (stat: RegionStat) => `${shortName(stat.name)} ${formatUsdK(stat.total)} · ${stat.customers}`;
  const callouts = map.regions.flatMap(area => { const stat = byCode.get(area.code); return stat?.customers && (area.small || area.point) ? [{ x: area.x, y: area.y, text: calloutText(stat) }] : []; });

  const pick = (code: string) => {
    setSelected(code);
    // Single-column layout (tablet/mobile): the detail panel sits under the map, so bring it into view.
    if (window.matchMedia("(max-width: 1180px)").matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const toggleSort = (key: SortKey) => setSort(current => current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 });

  return <>
    <div style={{ display: "grid", gap: 16 }}>
      <section className="bk-card bk-map-card" aria-labelledby="bk-cmap-title">
        <div className="bk-card-head" style={{ marginBottom: 0 }}>
          <div><h2 id="bk-cmap-title">Viloyatlar bo‘yicha savdo — {stats.year}</h2><span className="bk-muted">Rang = yillik jami savdo · raqamlar: summa (k $) va mijozlar soni · viloyatni bosing</span></div>
          <div className="bk-legend" aria-hidden="true"><span><i style={{ background: TONE_FILL.top }}/>Eng ko‘p</span><span><i style={{ background: TONE_FILL.b1 }}/>Yuqori</span><span><i style={{ background: TONE_FILL.b2 }}/>O‘rta</span><span><i style={{ background: TONE_FILL.low }}/>Eng kam</span><span><i style={{ background: TONE_FILL.none }}/>Mijoz yo‘q (!)</span></div>
        </div>
        <div className="bk-map is-wide" onMouseLeave={() => setHover(null)}>
          {zoom.controls}
          <svg {...zoom.svgProps} role="img" aria-label={`O‘zbekiston, Qozog‘iston, Qirg‘iziston, Tojikiston, Turkmaniston: viloyatlar bo‘yicha doimiy mijozlar savdosi, ${stats.year}`}>
            <CountryBackground/>
            {map.regions.filter(area => !area.point || byCode.get(area.code)?.customers).map(area => {
              const stat = byCode.get(area.code);
              if (!stat) return null;
              const shape = shapeOf(area, s), Shape = "r" in shape ? "circle" : "path";
              return <Shape key={area.code} className={`bk-area${selected === area.code ? " is-selected" : ""}`} {...shape} fill={TONE_FILL[tones[area.code] ?? "none"]} tabIndex={0} role="button" aria-pressed={selected === area.code}
                aria-label={`${stat.name}: ${formatInt(stat.customers)} mijoz, ${formatUsd(stat.total)}`}
                onMouseMove={event => setHover(tipAt(area.code, zoom.box, event))}
                onFocus={() => setHover(tipAt(area.code, zoom.box, undefined, area))} onBlur={() => setHover(null)}
                onClick={event => { setHover(tipAt(area.code, zoom.box, event)); pick(area.code); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(area.code); } }}/>;
            })}
            <CountryLayer s={s} avoid={calloutBoxes(callouts, s, zoom.box, map.regions.filter(area => !area.small && !area.point && byCode.get(area.code)?.customers))}/>
            {map.regions.map(area => {
              const stat = byCode.get(area.code);
              if (!stat || (area.point && !stat.customers)) return null;
              // "!" (no customers) only for Uzbekistan, the home market; elsewhere the area just stays uncoloured.
              if (!stat.customers) return countryOf(area.code) !== "UZ" ? null : <g key={area.code} aria-hidden="true" className="bk-map-attention"><circle cx={area.x} cy={area.y} r={8 * s} fill="var(--k-bg-e07a2e, #E07A2E)" stroke="var(--k-bd-ffffff, #fff)" strokeWidth={1.5 * s}/><text x={area.x} y={area.y + 4 * s} textAnchor="middle">!</text></g>;
              if (area.small || area.point) return <Callout key={area.code} x={area.x} y={area.y} text={calloutText(stat)} s={s} view={zoom.box}/>;
              const tone = tones[area.code] ?? "none", light = tone === "b2" || tone === "b3" || tone === "none";
              return <g key={area.code}>
                <text className={`bk-map-label ${light ? "is-light" : "is-dark"}`} x={area.x} y={area.y} textAnchor="middle" style={{ fill: TONE_TEXT[tone] }}>{formatUsdK(stat.total)} $</text>
                <text className={`bk-map-name bk-map-label ${light ? "is-light" : "is-dark"}`} x={area.x} y={area.y + 13 * s} textAnchor="middle" style={{ fill: TONE_TEXT[tone] }}>{stat.customers} mijoz</text>
              </g>;
            })}
          </svg>
          {hover && hovered && <div className="bk-map-tooltip bk-map-tooltip-rich" style={{ left: `${hover.x}%`, top: `${hover.y}%` }}>
            <strong>{hovered.name}</strong>
            {hovered.customers ? <span>{formatInt(hovered.customers)} mijoz · {formatUsd(hovered.total)} · {formatPercent(hovered.share)}</span> : <span>Mijoz yo‘q — e’tibor kerak</span>}
          </div>}
          <span className="bk-map-credit">Xarita: Natural Earth, geoBoundaries</span>
        </div>
        {stats.unassigned.customers > 0 && <p className="bk-muted">Viloyati ko‘rsatilmagan yoki xorijdagi mijozlar: {formatInt(stats.unassigned.customers)} ta · {formatUsd(stats.unassigned.total)} — mijozlar ro‘yxatida viloyatni tanlang.</p>}
      </section>

      {region && <RegionDetail ref={detailRef} region={region} rank={rankOf.get(region.code) ?? 0}/>}
    </div>

    <section className="bk-card" aria-labelledby="bk-region-rank-title">
      <div className="bk-card-head"><div><h2 id="bk-region-rank-title">Viloyatlar reytingi — {stats.year}</h2><span className="bk-muted">Ustun sarlavhasini bosib saralang · qatorni bosing — tafsilot ochiladi</span></div></div>
      <div className="bk-table-wrap"><table className="bk-table bk-region-table">
        <thead><tr>
          <th>O‘rin</th>
          {COLUMNS.map(column => <th key={column.key} className={column.left ? "is-left" : undefined} aria-sort={sort.key === column.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
            <button type="button" className="bk-sort" onClick={() => toggleSort(column.key)}>{column.label}{sort.key === column.key && (sort.dir === 1 ? <ArrowUp size={11}/> : <ArrowDown size={11}/>)}</button>
          </th>)}
          <th className="is-left">Eng faol mijoz</th>
          <th aria-sort={sort.key === "lastMonth" ? (sort.dir === 1 ? "ascending" : "descending") : "none"}><button type="button" className="bk-sort" onClick={() => toggleSort("lastMonth")}>Oxirgi kiritilgan oy{sort.key === "lastMonth" && (sort.dir === 1 ? <ArrowUp size={11}/> : <ArrowDown size={11}/>)}</button></th>
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.code} className={`${selected === row.code ? "is-selected " : ""}${row.customers ? "" : "is-empty"}`} onClick={() => pick(row.code)}>
          <td>{rankOf.get(row.code)}</td>
          <td className="is-left is-strong"><button type="button" className="bk-row-link" onClick={event => { event.stopPropagation(); pick(row.code); }} aria-pressed={selected === row.code}>{shortName(row.name)}</button>{!row.customers && <span className="bk-badge is-soft" style={{ marginLeft: 6 }}>e’tibor kerak</span>}</td>
          <td>{formatInt(row.customers)}</td><td className="is-strong">{formatUsd(row.total)}</td><td>{formatPercent(row.share)}</td>
          <td>{row.customers ? formatUsd(row.average) : "—"}</td><td><GrowthBadge growth={row.growth}/></td>
          <td className="is-left">{row.topCustomer ? `${row.topCustomer.name} · ${formatUsdK(row.topCustomer.total)}` : <span className="bk-muted">—</span>}</td>
          <td>{row.lastMonth ? MONTHS_LONG[row.lastMonth - 1] : <span className="bk-muted">—</span>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <RegionDynamics stats={stats}/>
  </>;
}

function RegionDetail({ ref, region, rank }: { ref: React.Ref<HTMLElement>; region: RegionStat; rank: number }) {
  return <section ref={ref} className="bk-card bk-region-detail" aria-labelledby="bk-region-detail-title" aria-live="polite">
    <div className="bk-card-head" style={{ marginBottom: 0 }}><div>
      <h2 id="bk-region-detail-title">{region.name}</h2>
      <span className="bk-muted">{region.customers ? `${rank}-o‘rin · ${formatInt(region.customers)} mijoz · ulush ${formatPercent(region.share)}` : "Doimiy mijoz yo‘q"}</span>
    </div><GrowthBadge growth={region.growth}/></div>
    {!region.customers ? <div className="bk-empty"><AlertTriangle size={18} color="var(--k-fg-8a4b12, #8A4B12)"/><strong>E’tibor kerak</strong><span>Bu viloyatda hali doimiy mijoz yo‘q.</span></div> : <>
      <RegionPeriod region={region}/>
      <div>
        <h3 style={{ marginBottom: 4 }}>Mijozlar</h3>
        <div className="bk-list">{region.customerRows.map((customer, index) => <div key={customer.id}>
          <span className={`bk-medal${index < 3 && customer.total > 0 ? ` is-${index + 1}` : ""}`}>{index + 1}</span>
          <div className="bk-grow"><b>{customer.name}</b><span>{customer.months.filter(value => value !== null).length} oy kiritilgan</span></div>
          <span className="bk-amount">{formatUsd(customer.total)}</span>
        </div>)}</div>
      </div>
    </>}
  </section>;
}

/** Flag emoji from the ISO code (regional indicator letters); 🌐 for anything else. */
const flag = (code: string) => /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(letter => 0x1f1a5 + letter.charCodeAt(0))) : "🌐";
const sumOf = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** "Oylik dinamika — respublikalar va viloyatlar": one line at a time (all / a country), a chosen region as a dashed line over it. */
function RegionDynamics({ stats }: { stats: RegionStats }) {
  const countries = useMemo(() => countryStats(stats), [stats]);
  const months = stats.periodEnd || 12;
  const [country, setCountry] = useState<string | null>(null), [regionCode, setRegionCode] = useState<string | null>(null);
  const current = countries.find(item => item.code === country) ?? null;
  const region = current?.regions.find(item => item.code === regionCode) ?? null;
  const all = useMemo(() => Array.from({ length: 12 }, (_, index) => sumOf(countries.map(item => item.months[index]))), [countries]);
  const values = useMemo(() => (current?.months ?? all).slice(0, months), [current, all, months]);
  const highlight = useMemo(() => region?.months.slice(0, months) ?? null, [region, months]);
  const go = (next: string | null, nextRegion: string | null = null) => { setCountry(next); setRegionCode(nextRegion); };
  const rows: Array<CountryRow & { country?: boolean }> = current ? current.regions : countries.map(item => ({ ...item, country: true }));
  const top = Math.max(1, ...rows.map(row => row.total));
  const card = (code: string | null, name: string, icon: string, total: number, line: number[], note: string) => {
    const max = Math.max(1, ...line), points = line.slice(0, months).map((value, index) => `${((index * 140) / Math.max(1, months - 1)).toFixed(1)},${(28 - (24 * value) / max).toFixed(1)}`).join(" ");
    return <button key={code ?? "all"} type="button" className={`bk-dyn-card${country === code ? " is-on" : ""}`} aria-pressed={country === code} onClick={() => go(code)}>
      <span className="bk-dyn-title"><span style={{ fontSize: 16 }}>{icon}</span>{name}</span><b style={{ fontSize: 20 }}>{formatUsd(total)}</b><small className="bk-muted">{note}</small>
      <svg viewBox="0 0 140 30" aria-hidden><polyline className="bk-dyn-spark" points={points} pathLength={1}/></svg>
    </button>;
  };
  return <section className="bk-card" aria-labelledby="bk-region-lines-title">
    <div className="bk-card-head"><div><h2 id="bk-region-lines-title">Oylik dinamika — respublikalar va viloyatlar</h2><span className="bk-muted">Jami savdo, USD · {stats.year} · respublikani bosing → viloyatlari ochiladi</span></div></div>
    {!countries.length || !stats.periodEnd ? <div className="bk-empty">Bu yilda hali savdo kiritilmagan.</div> : <>
      <div className="bk-rep-cards" style={{ "--c": "var(--bk-b1)" } as React.CSSProperties}>
        {card(null, "Hammasi", "🌍", sumOf(all), all, `${countries.length} respublika`)}
        {countries.map(item => card(item.code, item.name, flag(item.code), item.total, item.months, `${item.regions.filter(row => row.code.slice(-1) !== "?").length} viloyat`))}
      </div>
      <nav className="bk-rep-crumb" aria-label="Tanlov">
        {current ? <button type="button" onClick={() => go(null)}>🌍 Hammasi</button> : <b>🌍 Hammasi</b>}
        {current && <><span>›</span>{region ? <button type="button" onClick={() => go(current.code)}>{flag(current.code)} {current.name}</button> : <b>{flag(current.code)} {current.name}</b>}</>}
        {region && <><span>›</span><b>{shortName(region.name)}</b></>}
      </nav>
      <div className="bk-rep-body">
        <div className="bk-dyn-big" style={{ "--c": "var(--bk-b1)", marginTop: 0 } as React.CSSProperties}>
          <div className="bk-rep-title">{region ? shortName(region.name) : current?.name ?? "Barcha respublikalar"}<small>{region ? `${formatUsd(region.total)} · ${current!.name} jami ichida (punktir)` : `${formatUsd(sumOf(values))} · ${current ? "viloyatlar jami" : stats.year}`}</small></div>
          <MorphChart values={values} highlight={highlight} highlightName={region ? shortName(region.name) : null} labels={MONTHS_SHORT.slice(0, months)}/>
        </div>
        <div className="bk-rep-rank" key={current?.code ?? "all"}>
          <h3>{current ? "Viloyatlar reytingi" : "Respublikalar reytingi"}</h3>
          {rows.map((row, index) => <button key={row.code} type="button" className={`bk-rep-row${region?.code === row.code ? " is-on" : ""}`} aria-pressed={region?.code === row.code}
            onClick={() => (row.country ? go(row.code) : go(current!.code, region?.code === row.code ? null : row.code))}>
            <small>{index + 1}</small><span>{row.country ? `${flag(row.code)} ${row.name}` : shortName(row.name)}{row.country && <em> → viloyatlar</em>}</span><b>{formatUsd(row.total)}</b>
            <span className="bk-rep-bar"><i style={{ width: `${(100 * row.total) / top}%`, animationDelay: `${index * 60}ms` }}/></span>
          </button>)}
        </div>
      </div>
    </>}
  </section>;
}

/** The line "flows" to new values (y tween, not redrawn); the highlighted region rises from it as a dashed line. */
function MorphChart({ values, highlight, highlightName, labels }: { values: number[]; highlight: number[] | null; highlightName: string | null; labels: string[] }) {
  const phone = usePhone();
  const W = phone ? 320 : 640, H = phone ? 300 : 300, font = phone ? 14 : 11, L = phone ? 44 : 52, R = W - 12, T = 12, B = H - 30;
  const n = values.length, X = (i: number) => L + ((R - L) * i) / Math.max(1, n - 1);
  const max = nice(Math.max(1, ...values, ...(highlight ?? [])));
  const [shown, setShown] = useState<{ ys: number[]; hs: number[] | null } | null>(null);
  const last = useRef<{ ys: number[]; hs: number[] | null } | null>(null);
  const [tip, setTip] = useState<number | null>(null);
  useEffect(() => {
    const Y = (value: number) => B - ((B - T) * value) / max;
    const to = values.map(Y), hto = highlight?.map(Y) ?? null;
    const from = last.current?.ys.length === to.length ? last.current.ys : to.map(() => B);
    const hfrom = hto ? (last.current?.hs?.length === hto.length ? last.current.hs : from) : null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches, start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = reduced ? 1 : 1 - (1 - Math.min(1, (now - start) / 800)) ** 3;
      const next = { ys: from.map((y, i) => y + (to[i] - y) * k), hs: hto && hfrom ? hfrom.map((y, i) => y + (hto[i] - y) * k) : null };
      last.current = next; setShown(next);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [values, highlight, max, B]);
  const ys = shown?.ys.length === n ? shown.ys : values.map(() => B), line = smooth(ys.map((y, i) => [X(i), y]), B), slot = (R - L) / Math.max(1, n - 1);
  const tipLeft = tip === null ? 0 : (X(tip) / W) * 100;
  return <div style={{ position: "relative" }} onPointerLeave={() => setTip(null)}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Oylik savdo${highlightName ? `, ${highlightName} ajratilgan` : ""}`} style={{ fontSize: font }}>
      <defs><linearGradient id="bk-rep-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: "var(--bk-b1)" }} stopOpacity=".22"/><stop offset="1" style={{ stopColor: "var(--bk-b1)" }} stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(step => { const y = B - ((B - T) * step) / 4; return <g key={step}><line className="bk-dyn-grid" x1={L} x2={R} y1={y} y2={y}/><text x={L - 8} y={y + font / 3} textAnchor="end">${formatUsdK((max * step) / 4)}</text></g>; })}
      {labels.map((label, i) => (phone ? (n - 1 - i) % 2 === 0 : true) && <text key={label} x={X(i)} y={B + font + 6} textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"}>{label}</text>)}
      <path d={`${line} L${X(n - 1)},${B} L${L},${B}Z`} fill="url(#bk-rep-area)"/>
      <path d={line} fill="none" strokeWidth={3} strokeLinecap="round" style={{ stroke: "var(--bk-b1)" }}/>
      {shown?.hs && highlight && <path d={smooth(shown.hs.map((y, i) => [X(i), y]), B)} fill="none" strokeWidth={3} strokeDasharray="7 5" strokeLinecap="round" style={{ stroke: "var(--bk-navy)" }}/>}
      {ys.map((y, i) => <circle key={i} cx={X(i)} cy={y} r={tip === i ? 6 : 4} strokeWidth={2.5} style={{ fill: "var(--bk-card)", stroke: "var(--bk-b1)" }}/>)}
      {tip !== null && <line x1={X(tip)} x2={X(tip)} y1={T} y2={B} className="bk-dyn-grid" strokeDasharray="3 3"/>}
      {values.map((_, i) => <rect key={i} x={X(i) - slot / 2} y={T} width={slot} height={B - T + 24} fill="transparent" onPointerEnter={() => setTip(i)} onPointerDown={() => setTip(i)}/>)}
    </svg>
    {tip !== null && <div className="bk-dyn-tip" role="status" style={{ left: `${tipLeft}%`, top: `${(ys[tip] / H) * 100}%`, transform: `translate(${tipLeft < 20 ? "-10%" : tipLeft > 80 ? "-90%" : "-50%"}, calc(-100% - 12px))` }}>
      <b>{MONTHS_LONG[tip]}</b><span>{formatUsd(values[tip])}</span>{highlight && <small>{highlightName}: {formatUsd(highlight[tip])}</small>}
    </div>}
  </div>;
}

const MODES: Array<{ key: PeriodMode; label: string }> = [{ key: "month", label: "Bu oy" }, { key: "all", label: "Hammasi" }, { key: "range", label: "Oraliq tanlash" }];
const monthsBack = (months: number) => { const day = new Date(`${tashkentDay()}T12:00:00Z`); day.setUTCMonth(day.getUTCMonth() - months); return day.toISOString().slice(0, 10); };

/** Region panel "Davr": Bu oy (default) | Hammasi | Oraliq; kept in the URL (?period=&from=&to=). Totals, bars and "Kiritilmagan oylar" follow the period. */
function RegionPeriod({ region }: { region: RegionStat }) {
  const params = useSearchParams();
  const asked = params.get("period");
  const [mode, setMode] = useState<PeriodMode>(asked === "all" || asked === "range" ? asked : "month");
  const [from, setFrom] = useState(params.get("from") ?? monthsBack(3)), [to, setTo] = useState(params.get("to") ?? tashkentDay());
  const [data, setData] = useState<Extract<RegionPeriodResult, { ok: true }> | null>(null), [error, setError] = useState("");
  const [pending, startLoad] = useTransition();
  const load = (next: { period: PeriodMode; from: string; to: string }) => startLoad(async () => {
    const result = await regionPeriodAction({ region: region.code, ...next });
    // A wrong range keeps the chart as it was.
    if (!result.ok) { setError(result.error); return; }
    setError(""); setData(result);
  });
  const apply = (next: { period: PeriodMode; from: string; to: string }) => {
    setMode(next.period); setFrom(next.from); setTo(next.to);
    try { const url = new URL(window.location.href); url.searchParams.set("period", next.period); for (const key of ["from", "to"] as const) { if (next.period === "range") url.searchParams.set(key, next[key]); else url.searchParams.delete(key); } window.history.replaceState(null, "", url); } catch { /* the URL is a convenience */ }
    load(next);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when another region is opened
  useEffect(() => load({ period: mode, from, to }), [region.code]);
  const total = useCountUp(data?.total ?? 0), average = useCountUp(data && region.customers ? data.total / region.customers : 0);
  const index = MODES.findIndex(item => item.key === mode);
  return <div className="bk-per" aria-busy={pending}>
    <div className="bk-tiles bk-tiles-2">
      <div className="bk-tile"><span>Jami · {data?.label ?? "…"}</span><strong>{formatUsd(total)}</strong></div>
      <div className="bk-tile is-plain"><span>O‘rtacha / mijoz</span><strong>{formatUsd(average)}</strong></div>
    </div>
    <div className="bk-seg" role="tablist" aria-label="Davr"><span className="bk-seg-pill" style={{ transform: `translateX(${index * 100}%)` }}/>
      {MODES.map(item => <button key={item.key} type="button" role="tab" aria-selected={mode === item.key} onClick={() => apply({ period: item.key, from, to })}>{item.label}</button>)}
    </div>
    {mode === "range" && <div className="bk-per-range">
      <label>dan<input type="date" value={from} max={to || undefined} onChange={event => apply({ period: "range", from: event.target.value, to })}/></label>
      <label>gacha<input type="date" value={to} onChange={event => apply({ period: "range", from, to: event.target.value })}/></label>
      <div className="bk-per-chips">{[["3 oy", 3], ["6 oy", 6], ["1 yil", 12]].map(([label, months]) => <button key={label} type="button" onClick={() => apply({ period: "range", from: monthsBack(months as number), to: tashkentDay() })}>{label}</button>)}
        <button type="button" onClick={() => apply({ period: "range", from: `${tashkentDay().slice(0, 4)}-01-01`, to: tashkentDay() })}>Bu yil</button></div>
    </div>}
    {error && <p className="bk-note is-soft" role="alert">{error}</p>}
    {data && <>
      <div className="bk-per-head"><b>{data.grain === "day" ? "Kunlar" : data.grain === "month" ? "Oylar" : "Yillar"} bo‘yicha · {data.label}</b><small>{data.grain === "day" ? "har kun · tasdiqlangan xaridlar" : data.grain === "month" ? "har oy" : "har yil"}</small></div>
      <PeriodBars points={data.points} line={data.grain !== "day" && data.points.length > 6} label={`${region.name}: ${data.label}`}/>
      {data.missing.length > 0 && <div className="bk-note is-soft" role="note">
        <strong>Kiritilmagan oylar:</strong>
        <ul className="bk-missing">{data.missing.map(item => <li key={item.key}><b>{item.label}</b> — {item.names.join(", ")}</li>)}</ul>
      </div>}
    </>}
  </div>;
}

/** Bars grow one after another, the biggest in navy; a smooth line on top for months / years; missing months framed in dashed orange. */
function PeriodBars({ points, line, label }: { points: PeriodPoint[]; line: boolean; label: string }) {
  // Drawn at the box's real width (1 unit = 1 px), so labels stay readable on a phone and on a wide screen.
  const box = useRef<HTMLDivElement>(null), [boxWidth, setBoxWidth] = useState(700);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setBoxWidth(Math.round(entry.contentRect.width))); if (box.current) observer.observe(box.current); return () => observer.disconnect(); }, []);
  const [tip, setTip] = useState<number | null>(null);
  const W = Math.max(260, boxWidth), phone = W < 480, H = phone ? 260 : 280, font = 12, L = 46, R = W - 8, T = 12, B = H - 28;
  const n = points.length, slot = (R - L) / Math.max(1, n), width = Math.max(2, slot * (n > 20 ? 0.62 : 0.56)), X = (i: number) => L + slot * i + slot / 2;
  const max = nice(Math.max(1, ...points.map(point => point.value ?? 0))), Y = (value: number) => B - ((B - T) * value) / max;
  const peak = points.reduce((best, point, i) => ((point.value ?? 0) > (points[best].value ?? 0) ? i : best), 0), every = Math.ceil(n / Math.min(12, Math.floor(W / 56)));
  const path = line ? smooth(points.map((point, i) => [X(i), Y(point.value ?? 0)]), B) : "";
  const tipLeft = tip === null ? 0 : (X(tip) / W) * 100;
  return <div ref={box} className="bk-dyn-big" style={{ marginTop: 0 }} onPointerLeave={() => setTip(null)}>
    <svg key={points.map(point => `${point.key}${point.value}`).join()} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ fontSize: font }}>
      <defs><linearGradient id="bk-per-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: "var(--bk-b1)" }}/><stop offset="1" style={{ stopColor: "var(--bk-b2)" }} stopOpacity=".6"/></linearGradient>
        <linearGradient id="bk-per-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: "var(--bk-b1)" }} stopOpacity=".14"/><stop offset="1" style={{ stopColor: "var(--bk-b1)" }} stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(step => { const y = B - ((B - T) * step) / 4; return <g key={step}><line className="bk-dyn-grid" x1={L} x2={R} y1={y} y2={y}/><text x={L - 8} y={y + font / 3} textAnchor="end">${formatUsdK((max * step) / 4)}</text></g>; })}
      {points.map((point, i) => point.missing && <rect key={`m${i}`} x={X(i) - width / 2} y={B - 36} width={width} height={36} rx={6} fill="none" strokeWidth={2} strokeDasharray="5 4" style={{ stroke: "var(--bk-orange)" }}/>)}
      {points.map((point, i) => { if (!point.value) return null; const h = Math.max(3, B - Y(point.value)); return <rect key={i} className="bk-per-bar" x={X(i) - width / 2} y={B - h} width={width} height={h} rx={Math.min(6, width / 2, h / 2)} fill={i === peak ? "var(--bk-navy)" : "url(#bk-per-grad)"} style={{ animationDelay: `${Math.min(i * 28, 700)}ms` }}/>; })}
      {points.map((point, i) => (n - 1 - i) % every === 0 && <text key={`l${i}`} x={X(i)} y={B + font + 6} textAnchor="middle">{point.label}</text>)}
      {line && <><path className="bk-dyn-area" d={`${path} L${X(n - 1)},${B} L${X(0)},${B}Z`} fill="url(#bk-per-area)"/><path className="bk-dyn-line" d={path} strokeWidth={2.5} pathLength={1} style={{ stroke: "var(--bk-navy)" }}/></>}
      {points.map((_, i) => <rect key={`h${i}`} x={X(i) - slot / 2} y={T} width={slot} height={B - T + 20} fill="transparent" onPointerEnter={() => setTip(i)} onPointerDown={() => setTip(i)}/>)}
    </svg>
    {tip !== null && <div className="bk-dyn-tip" role="status" style={{ left: `${tipLeft}%`, top: `${(Y(points[tip].value ?? 0) / H) * 100}%`, transform: `translate(${tipLeft < 20 ? "-10%" : tipLeft > 80 ? "-90%" : "-50%"}, calc(-100% - 12px))` }}>
      <b>{points[tip].full}</b><span>{points[tip].value === null ? "—" : formatUsd(points[tip].value!)}</span>{points[tip].missing && <small>kiritilmagan oy bor</small>}
    </div>}
  </div>;
}
