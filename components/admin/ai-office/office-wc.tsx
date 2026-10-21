import type { OfficeLayout } from "./office-layout";

export function OfficeWc({ room }: { room: OfficeLayout["wcRoom"] }) {
  const doorX = room.x + 32;
  const bottom = room.y + room.height;
  const inner = bottom - 5, radius = 60;
  return <g aria-label="WC">
    <path d={`M${room.x} ${bottom}V${room.y}H${room.x + room.width}V${bottom}H${doorX + 70}M${doorX} ${bottom}H${room.x}`} fill="none" stroke="#2b2b40" strokeWidth="10" strokeLinejoin="round"/>
    <rect x={room.x + room.width - 53} y={room.y + 28} width="30" height="55" rx="12" fill="#1c1c2c" stroke="#44445e" strokeWidth="3"/>
    <ellipse cx={room.x + room.width - 38} cy={room.y + 77} rx="21" ry="29" fill="#1c1c2c" stroke="#44445e" strokeWidth="3"/>
    <ellipse cx={room.x + room.width - 38} cy={room.y + 77} rx="11" ry="18" fill="#262636"/>
    <rect x={room.x + 24} y={room.y + 31} width="55" height="38" rx="16" fill="#1c1c2c" stroke="#44445e" strokeWidth="3"/>
    <circle cx={room.x + 51} cy={room.y + 50} r="9" fill="#262636"/>
    <path d={`M${room.x + 51} ${room.y + 27}v10`} stroke="#7c5cff" strokeWidth="4" strokeLinecap="round"/>
    {/* The leaf stands open at 90° inside the room; the swing arc ends on the inner wall face, so nothing crosses the wall. */}
    <rect x={doorX + 1} y={inner - radius} width="7" height={radius} rx="3" fill="#5d6178"/>
    <path d={`M${doorX + 4} ${inner - radius}A${radius} ${radius} 0 0 1 ${doorX + 4 + radius} ${inner}`} fill="none" stroke="#5d6178" strokeWidth="2" strokeDasharray="5 5"/>
    <rect x={room.x + room.width / 2 - 27} y={room.y + 119} width="54" height="31" rx="9" fill="#7c5cff"/>
    <text x={room.x + room.width / 2} y={room.y + 141} textAnchor="middle" className="office-wc-label">WC</text>
  </g>;
}
