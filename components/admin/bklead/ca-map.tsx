import caView from "@/lib/dashboard/maps/ca.json";
import { COUNTRY_NAMES, type CustomerCountry } from "@/lib/dashboard/regions";

type MapView = { viewBox: string; regions: Array<{ code: string; d: string; x: number; y: number; small: boolean; point?: boolean }>; countries: Array<{ code: string; d: string; x: number; y: number }> };
/** UZ, KZ, KG, TJ, TM on one Natural Earth admin-1 map (scripts/build-region-maps.mjs, view "ca"). */
export const CA_MAP: MapView = caView;
export const [CA_WIDTH, CA_HEIGHT] = CA_MAP.viewBox.split(" ").slice(2).map(Number);
export const countryOf = (code: string) => code.split("-")[0] as CustomerCountry;

/** Country borders (thicker than region borders) and faint country names, drawn between areas and labels. */
export function CountryLayer() {
  return <g aria-hidden="true" style={{ pointerEvents: "none" }}>
    {CA_MAP.countries.map(country => <path key={country.code} d={country.d} fill="none" stroke="#5B6B82" strokeWidth="1.8" strokeLinejoin="round"/>)}
    {CA_MAP.countries.map(country => <text key={country.code} x={country.x} y={country.y - 18} textAnchor="middle" style={{ fill: "#5B6B82", opacity: 0.45, fontSize: 18, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{COUNTRY_NAMES[country.code as CustomerCountry]}</text>)}
  </g>;
}

/** Tooltip position (percent of the map box) for a pointer event or a focused area. */
export function tipAt(code: string, event?: React.MouseEvent<SVGPathElement>, area?: { x: number; y: number }) {
  if (event) { const box = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); return { code, x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 }; }
  return { code, x: ((area?.x ?? 0) / CA_WIDTH) * 100, y: ((area?.y ?? 0) / CA_HEIGHT) * 100 };
}
