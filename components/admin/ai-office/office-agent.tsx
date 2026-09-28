import type { Point } from "./office-layout";
import type { ProductAgentStatus } from "@/lib/ai-office/product-agent";

export function OfficeAgent({ seat, status, onOpen }: { seat: Point; status: ProductAgentStatus; onOpen: () => void }) {
  const working = status === "reading" || status === "analyzing" || status === "writing";
  return <g className={`office-agent is-${status}`} role="button" tabIndex={0} aria-label="Mahsulot agenti 01 chatini ochish" onClick={onOpen} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}>
    <circle cx={seat.x} cy={seat.y - 3} r="25" fill="#123b68" stroke="#fff" strokeWidth="4"/>
    <circle cx={seat.x} cy={seat.y - 7} r="15" fill="#d7eaff"/>
    <path d={`M${seat.x - 9} ${seat.y - 9}h18v10c-5 5-13 5-18 0z`} fill="#1d4ed8"/>
    <circle cx={seat.x - 5} cy={seat.y - 3} r="2" fill="#fff"/><circle cx={seat.x + 5} cy={seat.y - 3} r="2" fill="#fff"/>
    <path d={`M${seat.x - 5} ${seat.y + 3}q5 4 10 0`} fill="none" stroke="#fff" strokeWidth="1.5"/>
    <rect x={seat.x - 66} y={seat.y + 27} width="132" height="27" rx="9" fill="#0b2a5b"/>
    <circle cx={seat.x - 51} cy={seat.y + 40.5} r="4" fill={working ? "#49d98c" : "#7e9ab7"}/>
    <text x={seat.x + 8} y={seat.y + 45} textAnchor="middle" className="office-agent-label">Mahsulot agenti</text>
  </g>;
}
