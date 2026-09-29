"use client";

import { useState } from "react";
import { COUNTRY_CODES, COUNTRY_NAMES, regionsOf, type CountryCode, type LeadCountry } from "@/lib/dashboard/regions";

/**
 * "Davlat" then "Viloyat / hudud" for public lead forms. Submits country, regionCode and — for the existing
 * free-text Lead.region and Telegram messages — the region name as "region" (typed text for other countries).
 */
export function LocationFields({ variant, required = false, disabled = false }: { variant: "home" | "consultation"; required?: boolean; disabled?: boolean }) {
  const [country, setCountry] = useState<LeadCountry>("UZ"), [regionCode, setRegionCode] = useState(""), [otherText, setOtherText] = useState("");
  const regions = country === "OTHER" ? [] : regionsOf(country as CountryCode);
  const regionText = country === "OTHER" ? otherText : regions.find(region => region.code === regionCode)?.name ?? "";
  const label = (text: string, control: React.ReactNode) => variant === "home"
    ? <label><span>{text}{required ? " *" : ""}</span>{control}</label>
    : <label>{text} {required && <em>*</em>}{control}</label>;
  return <>
    {label("Davlat", <select name="country" value={country} disabled={disabled} onChange={event => { setCountry(event.target.value as LeadCountry); setRegionCode(""); }}>
      {COUNTRY_CODES.map(code => <option key={code} value={code}>{COUNTRY_NAMES[code]}</option>)}<option value="OTHER">{COUNTRY_NAMES.OTHER}</option>
    </select>)}
    {country === "OTHER"
      ? label("Shahar / hudud", <input value={otherText} onChange={event => setOtherText(event.target.value)} maxLength={160} required={required} disabled={disabled} placeholder="Masalan: Moskva"/>)
      : label("Viloyat / hudud", <select name="regionCode" value={regionCode} required={required} disabled={disabled} onChange={event => setRegionCode(event.target.value)}>
        <option value="" disabled={required}>Hududni tanlang</option>{regions.map(region => <option key={region.code} value={region.code}>{region.name}</option>)}
      </select>)}
    <input type="hidden" name="region" value={regionText}/>
  </>;
}
