"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import allView from "@/lib/dashboard/maps/all.json";
import { COUNTRY_CODES, COUNTRY_NAMES, FERGANA_VALLEY, REGION_BY_CODE, regionsOf, type CountryCode } from "@/lib/dashboard/regions";
import { countryTones, foreignTones, rankingRows, TONE_FILL, TONE_TEXT, uzbekistanTones, type Tone } from "@/lib/dashboard/rules";
import { formatInt, formatPercent, percentOf } from "@/lib/dashboard/format";

type MapView = { view: string; viewBox: string; outline: string; regions: Array<{ code: string; d: string; x: number; y: number; small: boolean; point?: boolean }>; credit: string };
type Tab = "all" | CountryCode;
type Props = { rows: Array<{ country: string | null; regionCode: string | null; count: number }>; tips: Partial<Record<Tab, string>> };

// Country views are separate chunks, loaded when their tab is opened.
const loaders: Record<CountryCode, () => Promise<{ default: unknown }>> = {
  UZ: () => import("@/lib/dashboard/maps/uz.json"), KZ: () => import("@/lib/dashboard/maps/kz.json"), KG: () => import("@/lib/dashboard/maps/kg.json"),
  TJ: () => import("@/lib/dashboard/maps/tj.json"), TM: () => import("@/lib/dashboard/maps/tm.json"), AF: () => import("@/lib/dashboard/maps/af.json"),
};
const shortName = (code: string) => (REGION_BY_CODE.get(code)?.name ?? COUNTRY_NAMES[code as CountryCode] ?? code).replace(/ viloyati$/, "").replace(/ shahri$/, " sh.");

export function RegionMap({ rows, tips }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [views, setViews] = useState<Partial<Record<Tab, MapView>>>({ all: allView as MapView });
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const countryCounts = useMemo(() => Object.fromEntries(COUNTRY_CODES.map(code => [code, rows.filter(row => row.country === code).reduce((sum, row) => sum + row.count, 0)])) as Record<CountryCode, number>, [rows]);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const outside = total - COUNTRY_CODES.reduce((sum, code) => sum + countryCounts[code], 0);

  useEffect(() => {
    if (tab === "all" || views[tab]) return;
    let active = true;
    void loaders[tab]().then(module => { if (active) setViews(current => ({ ...current, [tab]: module.default as MapView })); });
    return () => { active = false; };
  }, [tab, views]);

  // Areas of the current view with their counts and tones.
  const items = tab === "all" ? COUNTRY_CODES.map(code => ({ code, count: countryCounts[code] }))
    : regionsOf(tab).map(region => ({ code: region.code, count: rows.filter(row => row.regionCode === region.code).reduce((sum, row) => sum + row.count, 0) }));
  const tones: Record<string, Tone> = tab === "all" ? countryTones(items) : tab === "UZ" ? uzbekistanTones(items) : foreignTones(items);
  const counts = Object.fromEntries(items.map(item => [item.code, item.count]));
  const viewTotal = items.reduce((sum, item) => sum + item.count, 0);
  const unlocated = tab === "all" ? outside : countryCounts[tab] - viewTotal;
  const ranking = rankingRows(items, tones);
  const top = ranking.rows[0], bottom = ranking.rows.at(-1);
  const map = views[tab];
  const tabs: Tab[] = ["all", ...COUNTRY_CODES];
  const tabLabel = (value: Tab) => value === "all" ? "Barchasi" : COUNTRY_NAMES[value];
  const tabCount = (value: Tab) => value === "all" ? total : countryCounts[value];
  const valley = FERGANA_VALLEY.reduce((sum, code) => sum + (counts[code] ?? 0), 0);

  const onTabKey = (event: React.KeyboardEvent, index: number) => {
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const target = (next + tabs.length) % tabs.length;
    setTab(tabs[target]); tabRefs.current[target]?.focus();
  };
  const open = (code: string) => router.push(`/admin/leads?region=${encodeURIComponent(code)}`);
  const [vbWidth, vbHeight] = (map?.viewBox ?? "0 0 640 440").split(" ").slice(2).map(Number);

  return <div className="bk-grid-main">
    <section className="bk-card bk-map-card" aria-labelledby="bk-map-title">
      <div className="bk-card-head">
        <div><h2 id="bk-map-title">Hududlar bo‘yicha lidlar</h2><span className="bk-muted">Tanlangan davr · xaritadagi raqam = lidlar soni</span></div>
        <div className="bk-legend" aria-hidden="true"><span><i style={{ background: TONE_FILL.top }}/>Eng ko‘p</span><span><i style={{ background: TONE_FILL.b1 }}/>2-o‘rin</span><span><i style={{ background: TONE_FILL.b2 }}/>O‘rta</span><span><i style={{ background: TONE_FILL.low }}/>Eng kam (e’tibor kerak)</span></div>
      </div>
      <div className="bk-chips" role="tablist" aria-label="Davlat">
        {tabs.map((value, index) => <button key={value} ref={element => { tabRefs.current[index] = element; }} role="tab" type="button" id={`bk-tab-${value}`} aria-selected={tab === value} aria-controls="bk-map-panel" tabIndex={tab === value ? 0 : -1} className="bk-chip" onClick={() => setTab(value)} onKeyDown={event => onTabKey(event, index)}>{tabLabel(value)} <small>{formatInt(tabCount(value))}</small></button>)}
      </div>
      <div className="bk-map" id="bk-map-panel" role="tabpanel" aria-labelledby={`bk-tab-${tab}`} onMouseLeave={() => setHover(null)}>
        {!map ? <div className="bk-map-loading">Xarita yuklanmoqda…</div> : <svg viewBox={map.viewBox} role="img" aria-label={`${tabLabel(tab)}: hududlar bo‘yicha lidlar xaritasi`}>
          {map.regions.filter(region => !region.point).map(region => {
            const tone = tones[region.code] ?? "none", count = counts[region.code] ?? 0;
            return <path key={region.code} className="bk-area" d={region.d} fill={TONE_FILL[tone]} tabIndex={0} role="link" aria-label={`${shortName(region.code)} — ${formatInt(count)} lid`}
              onMouseMove={event => { const box = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ code: region.code, x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 }); }}
              onFocus={() => setHover({ code: region.code, x: (region.x / vbWidth) * 100, y: (region.y / vbHeight) * 100 })} onBlur={() => setHover(null)}
              onClick={() => open(region.code)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(region.code); } }}/>;
          })}
          {map.regions.map(region => {
            const count = counts[region.code] ?? 0, tone = tones[region.code] ?? "none";
            if (region.point) return <g key={region.code}><circle cx={region.x} cy={region.y} r="5" fill={TONE_FILL[count ? tone : "none"]} stroke="#0F1E33" strokeWidth="1"/>{count > 0 && <Callout x={region.x} y={region.y} text={`${shortName(region.code)} ${formatInt(count)}`}/>}</g>;
            if (!count) return null;
            if (region.small) return <Callout key={region.code} x={region.x} y={region.y} text={`${shortName(region.code)} ${formatInt(count)}`}/>;
            const light = tone === "b2" || tone === "b3" || tone === "none";
            return <g key={region.code}>
              {tab === "all" && <text className={`bk-map-name bk-map-label ${light ? "is-light" : "is-dark"}`} x={region.x} y={region.y - 9} textAnchor="middle">{shortName(region.code)}</text>}
              <text className={`bk-map-label ${light ? "is-light" : "is-dark"}`} x={region.x} y={region.y + (tab === "all" ? 8 : 4)} textAnchor="middle" style={{ fill: TONE_TEXT[tone] }}>{formatInt(count)}</text>
            </g>;
          })}
        </svg>}
        {hover && <div className="bk-map-tooltip" style={{ left: `${hover.x}%`, top: `${hover.y}%` }}>{shortName(hover.code)} — {formatInt(counts[hover.code] ?? 0)} lid</div>}
        {tab === "UZ" && map && <div className="bk-map-callout"><span className="bk-muted">Farg‘ona vodiysi</span><strong>{formatInt(valley)} lid · {formatPercent(percentOf(valley, viewTotal), 0)}</strong></div>}
        <span className="bk-map-credit">Xarita: Natural Earth</span>
      </div>
      <div className="bk-tiles">
        <div className="bk-tile"><span>Eng ko‘p lid</span><strong>{top ? `${shortName(top.code)} · ${formatInt(top.count)}` : "—"}</strong></div>
        <div className="bk-tile is-soft"><span>Eng kam lid</span><strong>{bottom && ranking.rows.length > 1 ? `${shortName(bottom.code)} · ${formatInt(bottom.count)}` : "—"}</strong></div>
        <div className="bk-tile is-plain"><span>{tab === "all" ? "Lid kelgan davlatlar" : "Lid kelgan viloyatlar"}</span><strong>{ranking.rows.length} / {items.length} · jami {formatInt(viewTotal)}</strong></div>
      </div>
    </section>

    <section className="bk-card" aria-labelledby="bk-rank-title" style={{ display: "grid", alignContent: "start", gap: 14 }}>
      <div className="bk-card-head" style={{ marginBottom: 0 }}><div><h2 id="bk-rank-title">{tab === "all" ? "Davlatlar reytingi" : `${COUNTRY_NAMES[tab]}: viloyatlar`}</h2><span className="bk-muted">Lidlar soni bo‘yicha, tanlangan davr</span></div></div>
      {ranking.rows.length ? <div className="bk-rank">{ranking.rows.map(row => {
        const tone = row.tone === "low" ? "is-orange" : row.tone === "top" ? "" : row.tone === "b1" ? "is-b1" : "is-b2";
        return <div className={`bk-rank-row${row.tone === "low" ? " is-low" : ""}`} key={row.code}>
          <span>{row.rank}</span><b title={shortName(row.code)}>{shortName(row.code)}</b>
          <span>{row.badge && <span className={`bk-badge ${row.badge === "TOP" ? "is-navy" : "is-orange"}`}>{row.badge}</span>}</span>
          <span className="bk-track"><i className={`bk-bar ${tone}`} style={{ width: `${Math.max(3, (row.count / (ranking.rows[0]?.count || 1)) * 100)}%`, height: "100%" }}/></span>
          <em>{formatInt(row.count)}</em>
        </div>;
      })}</div> : <div className="bk-empty">Bu davrda lid yo‘q.</div>}
      {ranking.withoutLeads > 0 && <p className="bk-muted">{tab === "all" ? "Lid kelmagan davlatlar" : "Lid kelmagan viloyatlar"}: {ranking.withoutLeads} ta</p>}
      {unlocated > 0 && <p className="bk-muted">Hududi aniqlanmagan: {formatInt(unlocated)} ta · <a href={tab === "all" ? "/admin/leads?region=none" : `/admin/leads?region=${tab}`}>ko‘rish</a></p>}
      {tips[tab] && <p className="bk-note is-soft" style={{ marginTop: "auto" }}>{tips[tab]}</p>}
    </section>
  </div>;
}

/** Label with a leader line for areas too small to hold their number (city regions, point cities). */
export function Callout({ x, y, text }: { x: number; y: number; text: string }) {
  const dx = 34, dy = -24, width = text.length * 6.6 + 12;
  return <g aria-hidden="true">
    <line x1={x} y1={y} x2={x + dx} y2={y + dy} stroke="#0F1E33" strokeWidth="1"/>
    <rect x={x + dx} y={y + dy - 11} width={width} height="20" rx="6" fill="#0F1E33"/>
    <text x={x + dx + 6} y={y + dy + 3} style={{ fill: "#fff", fontSize: 11, fontWeight: 700 }}>{text}</text>
  </g>;
}
