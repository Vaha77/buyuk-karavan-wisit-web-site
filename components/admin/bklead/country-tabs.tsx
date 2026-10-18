"use client";

import { useRef } from "react";
import uz from "@/lib/dashboard/maps/uz.json";
import kz from "@/lib/dashboard/maps/kz.json";
import kg from "@/lib/dashboard/maps/kg.json";
import tj from "@/lib/dashboard/maps/tj.json";
import tm from "@/lib/dashboard/maps/tm.json";
import { COUNTRY_NAMES, CUSTOMER_COUNTRIES, type CustomerCountry } from "@/lib/dashboard/regions";
import { formatInt } from "@/lib/dashboard/format";

export type MapView = { viewBox: string; regions: Array<{ code: string; d: string; x: number; y: number; small: boolean; point?: boolean }> };
/** Natural Earth admin-1 views (scripts/build-region-maps.mjs), one per customer country. */
export const COUNTRY_MAPS: Record<CustomerCountry, MapView> = { UZ: uz, KZ: kz, KG: kg, TJ: tj, TM: tm };

/** Country switch above the customer maps; `counts` = customers per country. */
export function CountryTabs({ value, onChange, counts, panelId }: { value: CustomerCountry; onChange: (country: CustomerCountry) => void; counts: Record<string, number>; panelId: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (event: React.KeyboardEvent, index: number) => {
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const target = (next + CUSTOMER_COUNTRIES.length) % CUSTOMER_COUNTRIES.length;
    onChange(CUSTOMER_COUNTRIES[target]); refs.current[target]?.focus();
  };
  return <div className="bk-chips" role="tablist" aria-label="Davlat">
    {CUSTOMER_COUNTRIES.map((code, index) => <button key={code} ref={element => { refs.current[index] = element; }} role="tab" type="button" aria-selected={value === code} aria-controls={panelId} tabIndex={value === code ? 0 : -1} className="bk-chip" onClick={() => onChange(code)} onKeyDown={event => onKey(event, index)}>{COUNTRY_NAMES[code]} <small>{formatInt(counts[code] ?? 0)}</small></button>)}
  </div>;
}

export const countryOf = (code: string) => code.split("-")[0] as CustomerCountry;
