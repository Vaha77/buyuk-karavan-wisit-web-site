"use client";

import { useState } from "react";
import { desktopOfficeLayout, mobileOfficeLayout, type OfficeLayout } from "./office-layout";
import { OfficeCooler } from "./office-cooler";
import { OfficeDesk } from "./office-desk";
import { OfficePlant } from "./office-plant";
import { OfficeTennis } from "./office-tennis";
import { OfficeWc } from "./office-wc";
import { OfficeAgent } from "./office-agent";
import { ProductAgentChat } from "./product-agent-chat";
import type { ProductAgentStatus } from "@/lib/ai-office/product-agent";

function OfficeWalls({ layout }: { layout: OfficeLayout }) {
  const { bounds, spots } = layout;
  const bottom = bounds.y + bounds.height;
  const right = bounds.x + bounds.width;
  const opening = layout.name === "mobile" ? 86 : 104;
  const leftDoor = spots.entrance.x - opening / 2;
  return <g aria-hidden="true">
    <path d={`M${bounds.x} ${bottom}V${bounds.y}H${right}V${bottom}H${spots.entrance.x + opening / 2}M${leftDoor} ${bottom}H${bounds.x}`} fill="none" stroke="#0b2a5b" strokeWidth="14" strokeLinecap="square" strokeLinejoin="round"/>
    <rect x={leftDoor} y={bottom - opening} width="8" height={opening} rx="3" fill="#7892aa" transform={`rotate(-76 ${leftDoor} ${bottom})`}/>
    <path d={`M${leftDoor} ${bottom - opening}A${opening} ${opening} 0 0 1 ${leftDoor + opening} ${bottom}`} fill="none" stroke="#7892aa" strokeWidth="2" strokeDasharray="7 6"/>
    <text x={spots.entrance.x} y={bottom - 18} textAnchor="middle" className="office-entrance-label">Kirish</text>
  </g>;
}

function OfficeSvg({ layout, status, onOpen }: { layout: OfficeLayout; status: ProductAgentStatus; onOpen: () => void }) {
  const gridId = `office-grid-${layout.name}`;
  const titleId = `office-title-${layout.name}`;
  const descriptionId = `office-description-${layout.name}`;
  return <svg className={`ai-office-svg ai-office-svg-${layout.name}`} viewBox={layout.viewBox} role="img" aria-labelledby={`${titleId} ${descriptionId}`} preserveAspectRatio="xMidYMid meet">
    <title id={titleId}>BUYUK KARAVAN AI Ofis</title>
    <desc id={descriptionId}>To‘rtta bo‘sh ish stoli, suv kuleri, stol tennisi, WC, o‘simliklar va kirish eshigi bo‘lgan yuqoridan ko‘rinishdagi ofis.</desc>
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
    <g filter={`url(#office-shadow-${layout.name})`}>{layout.desks.map((desk) => <OfficeDesk key={desk.id} desk={desk}/>)}</g>
    <OfficeAgent seat={layout.desks[0].seat} status={status} onOpen={onOpen}/>
    <OfficeCooler position={layout.spots.cooler}/>
    <OfficeTennis table={layout.tennisTable}/>
    <OfficeWc room={layout.wcRoom}/>
    {layout.plants.map((plant, index) => <OfficePlant key={`${plant.x}-${plant.y}`} position={plant} index={index + 1}/>) }
    <OfficeWalls layout={layout}/>
  </svg>;
}

export function AiOfficeScene() {
  const [status, setStatus] = useState<ProductAgentStatus>("idle");
  const [open, setOpen] = useState(false);
  return <><section className="ai-office-frame" aria-label="AI Ofis sahnasi">
    <div className={`ai-office-canvas agent-status-${status}`}><OfficeSvg layout={desktopOfficeLayout} status={status} onOpen={() => setOpen(true)}/><OfficeSvg layout={mobileOfficeLayout} status={status} onOpen={() => setOpen(true)}/></div>
    <div className="ai-office-status" aria-label="Ofis holati"><span className="ai-office-status-dot" aria-hidden="true"/>Stollar: 4 <span aria-hidden="true">·</span> Agentlar: 1</div>
  </section><ProductAgentChat open={open} onClose={() => setOpen(false)} status={status} onStatus={setStatus}/></>;
}
