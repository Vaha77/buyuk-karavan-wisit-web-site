import type { Point } from "./office-layout";

export function OfficePlant({ position, index }: { position: Point; index: number }) {
  return <g transform={`translate(${position.x} ${position.y})`} aria-hidden="true">
    <ellipse cx="0" cy="18" rx="24" ry="15" fill="#a96f43"/>
    <ellipse cx="0" cy="12" rx="20" ry="10" fill="#74452a"/>
    <g className={`office-plant-leaves plant-${index}`}>
      <ellipse cx="-13" cy="-5" rx="10" ry="27" fill="#3b8f62" transform="rotate(-35 -13 -5)"/>
      <ellipse cx="13" cy="-7" rx="10" ry="28" fill="#2f7f55" transform="rotate(35 13 -7)"/>
      <ellipse cx="0" cy="-16" rx="10" ry="31" fill="#4ca873"/>
      <ellipse cx="-22" cy="4" rx="8" ry="22" fill="#56b47e" transform="rotate(-64 -22 4)"/>
      <ellipse cx="22" cy="3" rx="8" ry="22" fill="#3d9665" transform="rotate(64 22 3)"/>
    </g>
  </g>;
}
