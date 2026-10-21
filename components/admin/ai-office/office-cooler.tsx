import type { Point } from "./office-layout";

export function OfficeCooler({ position }: { position: Point }) {
  const { x, y } = position;
  return <g transform={`translate(${x} ${y})`} aria-label="Suv kuleri">
    <ellipse cx="62" cy="22" rx="34" ry="18" fill="#22d3ee" fillOpacity=".55" stroke="#0e7490" strokeWidth="3"/>
    <path d="M31 22v54c0 17 62 17 62 0V22" fill="#22d3ee" fillOpacity=".22" stroke="#0e7490" strokeWidth="3"/>
    <ellipse cx="62" cy="76" rx="31" ry="14" fill="#22d3ee" opacity=".7"/>
    <circle className="office-water-bubble bubble-one" cx="48" cy="55" r="4" fill="#fff" opacity=".8"/>
    <circle className="office-water-bubble bubble-two" cx="68" cy="65" r="3" fill="#fff" opacity=".7"/>
    <circle className="office-water-bubble bubble-three" cx="78" cy="45" r="5" fill="#fff" opacity=".65"/>
    <rect x="22" y="80" width="80" height="90" rx="12" fill="#1c1c2c" stroke="#3a3a52" strokeWidth="3"/>
    <rect x="35" y="94" width="54" height="30" rx="8" fill="#262636"/>
    <circle cx="49" cy="110" r="6" fill="#22d3ee"/><circle cx="75" cy="110" r="6" fill="#fb7185"/>
    <path d="M49 116v12M75 116v12" stroke="#5d6178" strokeWidth="4" strokeLinecap="round"/>
    <path d="M111 117h22l-4 32h-14zM117 111h22l-4 32" fill="#262636" stroke="#44445e" strokeWidth="2"/>
    <text x="62" y="190" textAnchor="middle" className="office-fixture-label">KULER</text>
  </g>;
}
