"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import uzView from "@/lib/dashboard/maps/uz.json";
import { REGION_STATUS, STALE_DAYS, STATUS_ORDER, daysTone, type SellerMap } from "@/lib/customers/seller-map";
import { formatInt, formatUsd, formatUsdK } from "@/lib/dashboard/format";
import { Callout } from "./region-map";
import { DaysBadge, NewCustomerButton } from "./seller";

type MapView = { viewBox: string; regions: Array<{ code: string; d: string; x: number; y: number; small: boolean; point?: boolean }> };
const map = uzView as MapView;
const [VB_WIDTH, VB_HEIGHT] = map.viewBox.split(" ").slice(2).map(Number);
const shortName = (name: string) => name.replace(/ viloyati$/, "").replace(/ shahri$/, " sh.").replace(/ Respublikasi$/, "");
const HATCH = "sl-hatch";
const fillOf = (status: keyof typeof REGION_STATUS) => status === "empty" ? `url(#${HATCH})` : REGION_STATUS[status].color;

/** "Mening hududlarim": the seller's own customers by region (data is already scoped on the server). */
export function SellerRegionMap({ data, year }: { data: SellerMap; year: number }) {
  const byCode = useMemo(() => new Map(data.regions.map(region => [region.code, region])), [data.regions]);
  const [selected, setSelected] = useState<string | null>(data.strongest?.code ?? data.regions.find(region => region.customers > 0)?.code ?? null);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const region = selected ? byCode.get(selected) : undefined;
  const hovered = hover ? byCode.get(hover.code) : undefined;

  const pick = (code: string) => {
    setSelected(code);
    // Single-column layout: the panel is under the map, so bring it into view.
    if (window.matchMedia("(max-width: 1180px)").matches) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  return <section className="bk-card sl-regions" aria-labelledby="sl-regions-title">
    <div className="bk-card-head">
      <div><h2 id="sl-regions-title">Mening hududlarim</h2><span className="bk-muted">Mijozlaringizning {year}-yil tasdiqlangan xaridlari · viloyatni bosing</span></div>
      <div className="bk-legend" aria-label="Xarita belgilari">{STATUS_ORDER.map(status => <span key={status}><i className={status === "empty" ? "sl-legend-hatch" : undefined} style={status === "empty" ? undefined : { background: REGION_STATUS[status].color }}/>{REGION_STATUS[status].label}</span>)}</div>
    </div>
    <div className="sl-regions-grid">
      <div className="bk-map sl-map" onMouseLeave={() => setHover(null)}>
        <svg viewBox={map.viewBox} role="img" aria-label={`O‘zbekiston: mening mijozlarim viloyatlar bo‘yicha, ${year}`}>
          <defs>
            <pattern id={HATCH} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill={REGION_STATUS.empty.color}/><line x1="0" y1="0" x2="0" y2="7" stroke="#9DB8E0" strokeWidth="1.6"/>
            </pattern>
          </defs>
          {map.regions.filter(area => !area.point).map(area => {
            const stat = byCode.get(area.code);
            if (!stat) return null;
            const empty = stat.status === "empty";
            return <path key={area.code} className={`bk-area${selected === area.code ? " is-selected" : ""}${empty ? " sl-area-empty" : ""}`} d={area.d} fill={fillOf(stat.status)} tabIndex={0} role="button" aria-pressed={selected === area.code}
              aria-label={empty ? `${stat.name}: mijoz yo‘q — imkoniyat` : `${stat.name}: ${formatInt(stat.customers)} mijoz, ${formatUsd(stat.total)}`}
              onMouseMove={event => { const box = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ code: area.code, x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 }); }}
              onFocus={() => setHover({ code: area.code, x: (area.x / VB_WIDTH) * 100, y: (area.y / VB_HEIGHT) * 100 })} onBlur={() => setHover(null)}
              onClick={() => pick(area.code)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(area.code); } }}/>;
          })}
          {map.regions.map(area => {
            const stat = byCode.get(area.code);
            if (!stat || area.point || !stat.customers) return null;
            if (area.small) return <Callout key={area.code} x={area.x} y={area.y} text={`${shortName(stat.name)} ${stat.customers} · $${formatUsdK(stat.total)}`}/>;
            const tone = REGION_STATUS[stat.status].text === "light" ? "is-dark" : "is-light";
            return <g key={area.code}>
              <text className={`bk-map-label ${tone}`} x={area.x} y={area.y} textAnchor="middle">${formatUsdK(stat.total)}</text>
              <text className={`bk-map-name bk-map-label ${tone}`} x={area.x} y={area.y + 13} textAnchor="middle">{stat.customers} mijoz</text>
            </g>;
          })}
        </svg>
        {hover && hovered && <div className="bk-map-tooltip bk-map-tooltip-rich" style={{ left: `${hover.x}%`, top: `${hover.y}%` }}>
          <strong>{hovered.name}</strong>
          {hovered.customers ? <>
            <span>{formatInt(hovered.customers)} mijoz · {formatUsd(hovered.total)} ({year})</span>
            <span>Qo‘ng‘iroq kerak: {formatInt(hovered.due)}</span>
          </> : <span>Mijoz yo‘q — imkoniyat</span>}
        </div>}
        <span className="bk-map-credit">Xarita: Natural Earth</span>
      </div>

      <div className="sl-regions-side" ref={panelRef}>
        <div className="sl-region-cards">
          <div className="sl-region-card is-good"><span>Eng kuchli hudud</span>{data.strongest ? <><strong>{shortName(data.strongest.name)}</strong><small>{formatInt(data.strongest.customers)} mijoz · ${formatUsdK(data.strongest.total)}</small></> : <><strong>—</strong><small>Bu yil hali tasdiqlangan xarid yo‘q</small></>}</div>
          <div className={`sl-region-card ${data.attention ? "is-bad" : "is-calm"}`}><span>E’tibor kerak</span>{data.attention ? <><strong>{shortName(data.attention.name)}</strong><small>{formatInt(data.attention.stale)} ta mijoz {STALE_DAYS}+ kun xarid qilmagan</small></> : <><strong>Hammasi joyida</strong><small>{STALE_DAYS}+ kun xarid qilmagan mijoz yo‘q</small></>}</div>
        </div>
        <div className="sl-region-panel" aria-live="polite">
          {!region ? <div className="bk-empty">Viloyatni tanlang.</div> : region.customers === 0 ? <div className="sl-region-empty">
            <strong>{region.name}</strong>
            <span>Bu viloyatda hali mijozingiz yo‘q · Yangi mijoz qidiring</span>
            <NewCustomerButton key={region.code} regionCode={region.code}/>
          </div> : <>
            <div className="sl-region-panel-head"><b>{shortName(region.name)}</b><span className="bk-muted">{formatInt(region.customers)} mijoz · ${formatUsdK(region.total)}</span></div>
            <div className="bk-list sl-list">{region.list.map(customer => <Link key={customer.id} href={`/admin/my/customers/${customer.id}`} className="sl-row">
              <div className="bk-grow"><b>{customer.name}</b><span>{shortName(region.name)} · ${formatUsdK(customer.total)}</span></div>
              <DaysBadge days={customer.days} tone={daysTone(customer.days)}/>
            </Link>)}</div>
          </>}
        </div>
        <p className="bk-muted sl-region-foot">Ochilmagan viloyatlar: {data.regionCount - data.opened} / {data.regionCount}{data.unplaced > 0 && ` · viloyati ko‘rsatilmagan yoki xorijdagi mijozlar: ${data.unplaced}`}</p>
      </div>
    </div>
  </section>;
}
