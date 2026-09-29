import type { DeskLayout } from "./office-layout";

export function OfficeDesk({ desk, vacant = false, compact = false }: { desk: DeskLayout; vacant?: boolean; compact?: boolean }) {
  const monitorX = desk.x + desk.width / 2 - 43;
  return <g className="office-desk" aria-label={`${desk.label}-stol`}>
    <ellipse cx={desk.seat.x} cy={desk.seat.y} rx="35" ry="25" fill="#bfd0e4" stroke="#7f9bb8" strokeWidth="3"/>
    <rect x={desk.seat.x - 25} y={desk.seat.y - 17} width="50" height="26" rx="12" fill="#dce8f4"/>
    <rect x={desk.x} y={desk.y} width={desk.width} height={desk.height} rx="14" fill="#fff" stroke="#c9dbef" strokeWidth="2"/>
    <rect x={desk.x + 12} y={desk.y + 12} width="34" height="24" rx="7" fill="#eaf2fb"/>
    <text x={desk.x + 29} y={desk.y + 29} textAnchor="middle" className="office-desk-number">{desk.label}</text>
    <rect x={monitorX} y={desk.y + 10} width="86" height="42" rx="6" fill="#071525" stroke="#183b62" strokeWidth="3" data-screen={desk.label}/>
    <rect x={monitorX + 38} y={desk.y + 52} width="10" height="8" rx="2" fill="#294966"/>
    <rect x={monitorX + 25} y={desk.y + 59} width="36" height="4" rx="2" fill="#294966"/>
    <circle className="office-standby-led" cx={monitorX + 78} cy={desk.y + 45} r="3.5" fill="#f59e0b"/>
    <rect x={desk.x + 65} y={desk.y + 67} width="90" height="8" rx="3" fill="#d5e1ed" stroke="#9bb1c7"/>
    <path d={`M${desk.x + 72} ${desk.y + 70.5}h76M${desk.x + 83} ${desk.y + 67}v8M${desk.x + 100} ${desk.y + 67}v8M${desk.x + 117} ${desk.y + 67}v8M${desk.x + 134} ${desk.y + 67}v8`} stroke="#9bb1c7" strokeWidth="1"/>
    <ellipse cx={desk.x + 177} cy={desk.y + 69} rx="8" ry="11" fill="#d5e1ed" stroke="#9bb1c7"/>
    {vacant && <g className="office-vacant-seat" aria-label="Bo‘sh o‘rin: yangi agent">
      <circle cx={desk.seat.x} cy={desk.seat.y - 3} r="25" fill="#f5f9fe" stroke="#8cb3dd" strokeWidth="2.5" strokeDasharray="6 5"/>
      <path d={`M${desk.seat.x - 9} ${desk.seat.y - 3}h18M${desk.seat.x} ${desk.seat.y - 12}v18`} stroke="#5f8fc2" strokeWidth="3" strokeLinecap="round"/>
      <rect x={desk.seat.x - (compact ? 98 : 66)} y={desk.seat.y + 27} width={compact ? 196 : 132} height={compact ? 36 : 27} rx="9" fill="#f5f9fe" stroke="#8cb3dd" strokeDasharray="5 4"/>
      <text x={desk.seat.x} y={desk.seat.y + 27 + (compact ? 18 : 13.5)} dominantBaseline="central" textAnchor="middle" className="office-empty-label">+ yangi agent</text>
    </g>}
  </g>;
}
