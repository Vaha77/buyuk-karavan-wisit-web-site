import type { OfficeLayout } from "./office-layout";

export function OfficeWc({ room }: { room: OfficeLayout["wcRoom"] }) {
  const doorX = room.x + 32;
  const bottom = room.y + room.height;
  return <g aria-label="WC">
    <path d={`M${room.x} ${bottom}V${room.y}H${room.x + room.width}V${bottom}H${doorX + 70}M${doorX} ${bottom}H${room.x}`} fill="none" stroke="#0b2a5b" strokeWidth="10" strokeLinejoin="round"/>
    <rect x={room.x + room.width - 53} y={room.y + 28} width="30" height="55" rx="12" fill="#fff" stroke="#7895b1" strokeWidth="3"/>
    <ellipse cx={room.x + room.width - 38} cy={room.y + 77} rx="21" ry="29" fill="#fff" stroke="#7895b1" strokeWidth="3"/>
    <ellipse cx={room.x + room.width - 38} cy={room.y + 77} rx="11" ry="18" fill="#dcecf8"/>
    <rect x={room.x + 24} y={room.y + 31} width="55" height="38" rx="16" fill="#fff" stroke="#7895b1" strokeWidth="3"/>
    <circle cx={room.x + 51} cy={room.y + 50} r="9" fill="#dcecf8"/>
    <path d={`M${room.x + 51} ${room.y + 27}v10`} stroke="#1d4ed8" strokeWidth="4" strokeLinecap="round"/>
    <rect x={doorX} y={bottom - 70} width="7" height="70" rx="3" fill="#8da5bc" transform={`rotate(-75 ${doorX} ${bottom})`}/>
    <path d={`M${doorX} ${bottom - 70}A70 70 0 0 1 ${doorX + 70} ${bottom}`} fill="none" stroke="#8da5bc" strokeWidth="2" strokeDasharray="5 5"/>
    <rect x={room.x + room.width / 2 - 27} y={room.y + 119} width="54" height="31" rx="9" fill="#1d4ed8"/>
    <text x={room.x + room.width / 2} y={room.y + 141} textAnchor="middle" className="office-wc-label">WC</text>
  </g>;
}
