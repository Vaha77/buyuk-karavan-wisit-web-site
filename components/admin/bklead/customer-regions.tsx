"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";
import uzView from "@/lib/dashboard/maps/uz.json";
import type { RegionStat, RegionStats } from "@/lib/customers/region-stats";
import { formatInt, formatPercent, formatUsd, formatUsdK, MONTHS_LONG } from "@/lib/dashboard/format";
import { TONE_FILL, TONE_TEXT, uzbekistanTones, type Tone } from "@/lib/dashboard/rules";
import { Callout } from "./region-map";
import { MonthBars, RegionLines, SERIES_COLORS } from "./charts";

type MapView = { viewBox: string; regions: Array<{ code: string; d: string; x: number; y: number; small: boolean; point?: boolean }> };
const map = uzView as MapView;
const [VB_WIDTH, VB_HEIGHT] = map.viewBox.split(" ").slice(2).map(Number);
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

/** Uzbekistan map coloured by regular customer sales, region detail, sortable region ranking and the top-5 monthly chart. */
export function CustomerRegions({ stats }: { stats: RegionStats }) {
  const ranked = stats.regions;
  const [selected, setSelected] = useState<string>(ranked[0]?.code ?? "UZ-TK");
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "total", dir: -1 });
  const detailRef = useRef<HTMLElement>(null);

  const byCode = useMemo(() => new Map(ranked.map(region => [region.code, region])), [ranked]);
  const rankOf = useMemo(() => new Map(ranked.map((region, index) => [region.code, index + 1])), [ranked]);
  const tones: Record<string, Tone> = useMemo(() => uzbekistanTones(ranked.map(region => ({ code: region.code, count: region.total }))), [ranked]);
  const rows = useMemo(() => [...ranked].sort((a, b) => {
    const left = sortValue(a, sort.key), right = sortValue(b, sort.key);
    const order = typeof left === "string" ? left.localeCompare(right as string) : (left as number) - (right as number);
    return order * sort.dir || (rankOf.get(a.code)! - rankOf.get(b.code)!);
  }), [ranked, sort, rankOf]);
  const top5 = ranked.filter(region => region.total > 0).slice(0, 5);
  const region = byCode.get(selected) ?? ranked[0];
  const hovered = hover ? byCode.get(hover.code) : null;

  const pick = (code: string) => {
    setSelected(code);
    // Single-column layout (tablet/mobile): the detail panel sits under the map, so bring it into view.
    if (window.matchMedia("(max-width: 1180px)").matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const toggleSort = (key: SortKey) => setSort(current => current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 });

  return <>
    <div className="bk-grid-main">
      <section className="bk-card bk-map-card" aria-labelledby="bk-cmap-title">
        <div className="bk-card-head" style={{ marginBottom: 0 }}>
          <div><h2 id="bk-cmap-title">Viloyatlar bo‘yicha savdo — {stats.year}</h2><span className="bk-muted">Rang = yillik jami savdo · raqamlar: summa (k $) va mijozlar soni · viloyatni bosing</span></div>
          <div className="bk-legend" aria-hidden="true"><span><i style={{ background: TONE_FILL.top }}/>Eng ko‘p</span><span><i style={{ background: TONE_FILL.b1 }}/>Yuqori</span><span><i style={{ background: TONE_FILL.b2 }}/>O‘rta</span><span><i style={{ background: TONE_FILL.low }}/>Eng kam</span><span><i style={{ background: TONE_FILL.none }}/>Mijoz yo‘q (!)</span></div>
        </div>
        <div className="bk-map" onMouseLeave={() => setHover(null)}>
          <svg viewBox={map.viewBox} role="img" aria-label={`O‘zbekiston: viloyatlar bo‘yicha doimiy mijozlar savdosi, ${stats.year}`}>
            {map.regions.filter(area => !area.point).map(area => {
              const stat = byCode.get(area.code);
              if (!stat) return null;
              return <path key={area.code} className={`bk-area${selected === area.code ? " is-selected" : ""}`} d={area.d} fill={TONE_FILL[tones[area.code] ?? "none"]} tabIndex={0} role="button" aria-pressed={selected === area.code}
                aria-label={`${stat.name}: ${formatInt(stat.customers)} mijoz, ${formatUsd(stat.total)}`}
                onMouseMove={event => { const box = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ code: area.code, x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 }); }}
                onFocus={() => setHover({ code: area.code, x: (area.x / VB_WIDTH) * 100, y: (area.y / VB_HEIGHT) * 100 })} onBlur={() => setHover(null)}
                onClick={() => pick(area.code)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(area.code); } }}/>;
            })}
            {map.regions.map(area => {
              const stat = byCode.get(area.code);
              if (!stat || area.point) return null;
              if (!stat.customers) return <g key={area.code} aria-hidden="true" className="bk-map-attention"><circle cx={area.x} cy={area.y} r="8" fill="#E07A2E" stroke="#fff" strokeWidth="1.5"/><text x={area.x} y={area.y + 4} textAnchor="middle">!</text></g>;
              if (area.small) return <Callout key={area.code} x={area.x} y={area.y} text={`${shortName(stat.name)} ${formatUsdK(stat.total)} · ${stat.customers}`}/>;
              const tone = tones[area.code] ?? "none", light = tone === "b2" || tone === "b3" || tone === "none";
              return <g key={area.code}>
                <text className={`bk-map-label ${light ? "is-light" : "is-dark"}`} x={area.x} y={area.y} textAnchor="middle" style={{ fill: TONE_TEXT[tone] }}>{formatUsdK(stat.total)} $</text>
                <text className={`bk-map-name bk-map-label ${light ? "is-light" : "is-dark"}`} x={area.x} y={area.y + 13} textAnchor="middle" style={{ fill: TONE_TEXT[tone] }}>{stat.customers} mijoz</text>
              </g>;
            })}
          </svg>
          {hover && hovered && <div className="bk-map-tooltip bk-map-tooltip-rich" style={{ left: `${hover.x}%`, top: `${hover.y}%` }}>
            <strong>{hovered.name}</strong>
            {hovered.customers ? <span>{formatInt(hovered.customers)} mijoz · {formatUsd(hovered.total)} · {formatPercent(hovered.share)}</span> : <span>Mijoz yo‘q — e’tibor kerak</span>}
          </div>}
          <span className="bk-map-credit">Xarita: Natural Earth</span>
        </div>
        {stats.unassigned.customers > 0 && <p className="bk-muted">Viloyati ko‘rsatilmagan yoki xorijdagi mijozlar: {formatInt(stats.unassigned.customers)} ta · {formatUsd(stats.unassigned.total)} — mijozlar ro‘yxatida viloyatni tanlang.</p>}
      </section>

      {region && <RegionDetail ref={detailRef} region={region} rank={rankOf.get(region.code) ?? 0} stats={stats}/>}
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

    <section className="bk-card" aria-labelledby="bk-region-lines-title">
      <div className="bk-card-head"><div><h2 id="bk-region-lines-title">Oylik dinamika — top-5 viloyat</h2><span className="bk-muted">Oyma-oy jami savdo, USD</span></div>
        {top5.length > 1 && <div className="bk-legend">{top5.map((item, index) => <span key={item.code}><i style={{ background: SERIES_COLORS[index], borderRadius: "50%" }}/>{shortName(item.name)}</span>)}</div>}</div>
      {top5.length && stats.periodEnd ? <RegionLines series={top5.map(item => ({ name: shortName(item.name), months: item.months }))} lastMonth={stats.periodEnd} label={`Top-5 viloyatning ${stats.year}-yil oylik savdosi`}/>
        : <div className="bk-empty">Bu yilda hali savdo kiritilmagan.</div>}
    </section>
  </>;
}

function RegionDetail({ ref, region, rank, stats }: { ref: React.Ref<HTMLElement>; region: RegionStat; rank: number; stats: RegionStats }) {
  const missingMonths = region.missing.map(item => item.month);
  return <section ref={ref} className="bk-card bk-region-detail" aria-labelledby="bk-region-detail-title" aria-live="polite">
    <div className="bk-card-head" style={{ marginBottom: 0 }}><div>
      <h2 id="bk-region-detail-title">{region.name}</h2>
      <span className="bk-muted">{region.customers ? `${rank}-o‘rin · ${formatInt(region.customers)} mijoz · ulush ${formatPercent(region.share)}` : "Doimiy mijoz yo‘q"}</span>
    </div><GrowthBadge growth={region.growth}/></div>
    <div className="bk-tiles bk-tiles-2">
      <div className="bk-tile"><span>Jami, {stats.year}</span><strong>{formatUsd(region.total)}</strong></div>
      <div className="bk-tile is-plain"><span>O‘rtacha / mijoz</span><strong>{region.customers ? formatUsd(region.average) : "—"}</strong></div>
    </div>
    {!region.customers ? <div className="bk-empty"><AlertTriangle size={18} color="#8A4B12"/><strong>E’tibor kerak</strong><span>Bu viloyatda hali doimiy mijoz yo‘q.</span></div> : <>
      <div>
        <h3 style={{ marginBottom: 6 }}>Oylar bo‘yicha jami</h3>
        <MonthBars months={region.months} missing={missingMonths} label={`${region.name}: ${stats.year}-yil oylik savdo`}/>
      </div>
      {region.missing.length > 0 && <div className="bk-note is-soft" role="note">
        <strong>Kiritilmagan oylar:</strong>
        <ul className="bk-missing">{region.missing.map(item => <li key={item.month}><b>{MONTHS_LONG[item.month - 1]}</b> — {item.names.join(", ")}</li>)}</ul>
      </div>}
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
