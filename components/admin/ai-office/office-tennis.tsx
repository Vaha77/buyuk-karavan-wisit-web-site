import type { OfficeLayout } from "./office-layout";

export function OfficeTennis({ table }: { table: OfficeLayout["tennisTable"] }) {
  return <g aria-label="Dam olish zonasi, stol tennisi">
    <text x={table.x} y={table.y - 24} className="office-zone-title">DAM OLISH</text>
    <rect x={table.x} y={table.y} width={table.width} height={table.height} rx="16" fill="#1557a6" stroke="#0b2a5b" strokeWidth="4"/>
    <rect x={table.x + 10} y={table.y + 10} width={table.width - 20} height={table.height - 20} rx="9" fill="none" stroke="#fff" strokeWidth="3" opacity=".9"/>
    <line x1={table.x + table.width / 2} y1={table.y + 10} x2={table.x + table.width / 2} y2={table.y + table.height - 10} stroke="#fff" strokeWidth="3"/>
    <line x1={table.x + table.width / 2 - 6} y1={table.y - 5} x2={table.x + table.width / 2 - 6} y2={table.y + table.height + 5} stroke="#dceafd" strokeWidth="4"/>
    <line x1={table.x + table.width / 2 + 6} y1={table.y - 5} x2={table.x + table.width / 2 + 6} y2={table.y + table.height + 5} stroke="#dceafd" strokeWidth="4"/>
    <circle cx={table.x + table.width - 32} cy={table.y + 28} r="8" fill="#f59e0b" stroke="#fff" strokeWidth="2"/>
  </g>;
}
