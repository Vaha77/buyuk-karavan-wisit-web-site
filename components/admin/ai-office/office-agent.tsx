import type { Point } from "./office-layout";
import type { ProductAgentStatus } from "@/lib/ai-office/product-agent";

/** `target` moves the agent away from its seat with a CSS transform (transitioned in ai-office.css). */
export function OfficeAgent({ seat, status, onOpen, label = "Mahsulot agenti", target, compact = false }: { seat: Point; status: ProductAgentStatus; onOpen: () => void; label?: string; target?: Point; compact?: boolean }) {
  const working = status === "reading" || status === "analyzing" || status === "writing";
  const transform = target ? `translate(${target.x - seat.x}px, ${target.y - seat.y}px)` : "translate(0px, 0px)";
  // The mobile SVG is scaled to ~0.6, so its label uses larger user units to stay >= 11px on screen.
  const pillWidth = compact ? 196 : 132, pillHeight = compact ? 36 : 27;
  return <g className={`office-agent is-${status}${target ? " is-away" : ""}`} style={{ transform }} role="button" tabIndex={0} aria-label={`${label} chatini ochish`} onClick={onOpen} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}>
    <circle cx={seat.x} cy={seat.y - 3} r="25" fill="#123b68" stroke="#fff" strokeWidth="4"/>
    <circle cx={seat.x} cy={seat.y - 7} r="15" fill="#d7eaff"/>
    <path d={`M${seat.x - 9} ${seat.y - 9}h18v10c-5 5-13 5-18 0z`} fill="#1d4ed8"/>
    <circle cx={seat.x - 5} cy={seat.y - 3} r="2" fill="#fff"/><circle cx={seat.x + 5} cy={seat.y - 3} r="2" fill="#fff"/>
    <path d={`M${seat.x - 5} ${seat.y + 3}q5 4 10 0`} fill="none" stroke="#fff" strokeWidth="1.5"/>
    <rect x={seat.x - pillWidth / 2} y={seat.y + 27} width={pillWidth} height={pillHeight} rx="9" fill="#0b2a5b"/>
    <circle cx={seat.x - pillWidth / 2 + 15} cy={seat.y + 27 + pillHeight / 2} r={compact ? 5 : 4} fill={working ? "#49d98c" : "#7e9ab7"}/>
    <text x={seat.x + 8} y={seat.y + 27 + pillHeight / 2} dominantBaseline="central" textAnchor="middle" className="office-agent-label">{label}</text>
  </g>;
}
