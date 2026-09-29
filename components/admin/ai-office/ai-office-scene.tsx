"use client";

import { useEffect, useRef, useState } from "react";
import { desktopOfficeLayout, IDLE_SPOTS, mobileOfficeLayout, type IdleSpot, type OfficeLayout } from "./office-layout";
import { OfficeCooler } from "./office-cooler";
import { OfficeDesk } from "./office-desk";
import { OfficePlant } from "./office-plant";
import { OfficeTennis } from "./office-tennis";
import { OfficeWc } from "./office-wc";
import { OfficeAgent } from "./office-agent";
import { ProductAgentChat } from "./product-agent-chat";
import { FotoAgentChat } from "./photo-agent-chat";
import type { ProductAgentStatus } from "@/lib/ai-office/product-agent";

function OfficeWalls({ layout }: { layout: OfficeLayout }) {
  const { bounds, spots } = layout;
  const bottom = bounds.y + bounds.height;
  const right = bounds.x + bounds.width;
  const opening = layout.name === "mobile" ? 86 : 104;
  const leftDoor = spots.entrance.x - opening / 2;
  // The leaf stands open at 90° inside the room and the swing arc ends on the inner wall face, so neither crosses the wall.
  const inner = bottom - 7, radius = opening - 10;
  return <g aria-hidden="true">
    <path d={`M${bounds.x} ${bottom}V${bounds.y}H${right}V${bottom}H${spots.entrance.x + opening / 2}M${leftDoor} ${bottom}H${bounds.x}`} fill="none" stroke="#0b2a5b" strokeWidth="14" strokeLinecap="square" strokeLinejoin="round"/>
    <rect x={leftDoor + 1} y={inner - radius} width="7" height={radius} rx="3" fill="#7892aa"/>
    <path d={`M${leftDoor + 4} ${inner - radius}A${radius} ${radius} 0 0 1 ${leftDoor + 4 + radius} ${inner}`} fill="none" stroke="#7892aa" strokeWidth="2" strokeDasharray="7 6"/>
    <text x={spots.entrance.x} y={bottom - 18} textAnchor="middle" className="office-entrance-label">Kirish</text>
  </g>;
}

type AgentView = { status: ProductAgentStatus; spot: IdleSpot | null; onOpen: () => void };

function OfficeSvg({ layout, product, photo }: { layout: OfficeLayout; product: AgentView; photo: AgentView }) {
  const gridId = `office-grid-${layout.name}`;
  const titleId = `office-title-${layout.name}`;
  const descriptionId = `office-description-${layout.name}`;
  const compact = layout.name === "mobile";
  return <svg className={`ai-office-svg ai-office-svg-${layout.name}`} viewBox={layout.viewBox} role="img" aria-labelledby={`${titleId} ${descriptionId}`} preserveAspectRatio="xMidYMid meet">
    <title id={titleId}>BUYUK KARAVAN AI Ofis</title>
    <desc id={descriptionId}>To‘rtta ish stoli (01 — Mahsulot agenti, 02 — Foto agent, 03 va 04 bo‘sh), suv kuleri, stol tennisi, WC, o‘simliklar va kirish eshigi bo‘lgan yuqoridan ko‘rinishdagi ofis.</desc>
    <defs>
      <pattern id={gridId} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#bdd0e5" strokeWidth="1" opacity=".35"/></pattern>
      <filter id={`office-shadow-${layout.name}`} x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="#12365a" floodOpacity=".12"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="#eaf1f9"/>
    <rect x={layout.bounds.x} y={layout.bounds.y} width={layout.bounds.width} height={layout.bounds.height} fill="#f5f8fd"/>
    <rect x={layout.bounds.x} y={layout.bounds.y} width={layout.bounds.width} height={layout.bounds.height} fill={`url(#${gridId})`}/>
    <rect x={layout.workZone.x} y={layout.workZone.y} width={layout.workZone.width} height={layout.workZone.height} rx="28" fill="#eaf3ff" stroke="#8cb3dd" strokeWidth="2" strokeDasharray="10 9"/>
    <rect x={layout.workZone.x + 22} y={layout.workZone.y + 18} width="118" height="30" rx="10" fill="#fff" stroke="#d2e2f3"/>
    <text x={layout.workZone.x + 81} y={layout.workZone.y + 38} textAnchor="middle" className="office-zone-title">ISH ZONASI</text>
    <g filter={`url(#office-shadow-${layout.name})`}>{layout.desks.map((desk, index) => <OfficeDesk key={desk.id} desk={desk} vacant={index >= 2} compact={compact}/>)}</g>
    <OfficeCooler position={layout.spots.cooler}/>
    <OfficeTennis table={layout.tennisTable}/>
    <OfficeWc room={layout.wcRoom}/>
    {layout.plants.map((plant, index) => <OfficePlant key={`${plant.x}-${plant.y}`} position={plant} index={index + 1}/>) }
    <OfficeWalls layout={layout}/>
    {/* Agents are drawn last so a visiting agent stays above the fixture it walks to. */}
    <OfficeAgent seat={layout.desks[0].seat} status={product.status} onOpen={product.onOpen} target={product.spot ? layout.visits[product.spot] : undefined} compact={compact}/>
    <OfficeAgent seat={layout.desks[1].seat} status={photo.status} onOpen={photo.onOpen} target={photo.spot ? layout.visits[photo.spot] : undefined} label="Foto agent" compact={compact}/>
  </svg>;
}

/**
 * An idle agent visits a random spot every 20–40 s, stays 5–10 s and walks back.
 * Busy agents stay seated; timers stop while the tab is hidden and when reduced motion is requested.
 */
function useIdleWander(busy: boolean, avoid: IdleSpot | null): IdleSpot | null {
  const [spot, setSpot] = useState<IdleSpot | null>(null);
  const avoidRef = useRef(avoid);
  useEffect(() => { avoidRef.current = avoid; }, [avoid]);
  useEffect(() => {
    if (busy) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined, away = false;
    const stop = () => { if (timer !== undefined) window.clearTimeout(timer); timer = undefined; };
    const schedule = () => {
      stop();
      if (document.hidden || reduceMotion.matches) return;
      if (away) timer = window.setTimeout(() => { away = false; setSpot(null); schedule(); }, 5_000 + Math.random() * 5_000);
      else timer = window.setTimeout(() => {
        const choices = IDLE_SPOTS.filter(item => item !== avoidRef.current);
        away = true; setSpot(choices[Math.floor(Math.random() * choices.length)]); schedule();
      }, 20_000 + Math.random() * 20_000);
    };
    const onVisibility = () => { if (document.hidden) stop(); else schedule(); };
    const onMotion = () => { if (reduceMotion.matches) { stop(); away = false; setSpot(null); } else schedule(); };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    reduceMotion.addEventListener("change", onMotion);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); reduceMotion.removeEventListener("change", onMotion); setSpot(null); };
  }, [busy]);
  return busy ? null : spot;
}

export function AiOfficeScene() {
  const [productStatus, setProductStatus] = useState<ProductAgentStatus>("idle");
  const [photoStatus, setPhotoStatus] = useState<ProductAgentStatus>("idle");
  const [productOpen, setProductOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const isBusy = (status: ProductAgentStatus, open: boolean) => open || (status !== "idle" && status !== "success" && status !== "error");
  const productSpot = useIdleWander(isBusy(productStatus, productOpen), null);
  const photoSpot = useIdleWander(isBusy(photoStatus, photoOpen), productSpot);
  const product: AgentView = { status: productStatus, spot: productSpot, onOpen: () => setProductOpen(true) };
  const photo: AgentView = { status: photoStatus, spot: photoSpot, onOpen: () => setPhotoOpen(true) };
  return <><section className="ai-office-frame" aria-label="AI Ofis sahnasi">
    <div className={`ai-office-canvas product-status-${productStatus} photo-status-${photoStatus}`}><OfficeSvg layout={desktopOfficeLayout} product={product} photo={photo}/><OfficeSvg layout={mobileOfficeLayout} product={product} photo={photo}/></div>
    <div className="ai-office-status" aria-label="Ofis holati"><span className="ai-office-status-dot" aria-hidden="true"/>Stollar: 4 <span aria-hidden="true">·</span> Agentlar: 2</div>
  </section><ProductAgentChat open={productOpen} onClose={() => setProductOpen(false)} status={productStatus} onStatus={setProductStatus}/><FotoAgentChat open={photoOpen} onClose={() => setPhotoOpen(false)} status={photoStatus} onStatus={setPhotoStatus}/></>;
}
