"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveZoneThresholdsAction } from "@/app/admin/(protected)/sales-plan/actions";
import { DEFAULT_THRESHOLDS, resolveZones, THRESHOLD_KEYS, validateThresholds, zoneStyle, type ZoneThresholds } from "@/lib/sales-plan/zones";

/** Sozlamalar: lower bounds of the Sotuv rejasi zones (whole percents, increasing, 0–200). */
export function ZoneThresholdsForm({ thresholds }: { thresholds: ZoneThresholds }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(THRESHOLD_KEYS.map(key => [key, String(thresholds[key])])));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null), [pending, startTransition] = useTransition();
  const parsed = Object.fromEntries(THRESHOLD_KEYS.map(key => [key, values[key].trim() === "" ? NaN : Number(values[key])])) as ZoneThresholds;
  const error = validateThresholds(parsed);
  const preview = error ? null : resolveZones(parsed);
  const save = (next: ZoneThresholds) => startTransition(async () => {
    const result = await saveZoneThresholdsAction(next);
    setMessage(result.ok ? { ok: true, text: "Saqlandi." } : { ok: false, text: result.error });
    if (result.ok) router.refresh();
  });
  return <form className="bk-card" style={{ display: "grid", gap: 12 }} aria-labelledby="sp-zone-settings-title" onSubmit={event => { event.preventDefault(); if (!error) save(parsed); }}>
    <div><h2 id="sp-zone-settings-title">Sotuv rejasi zonalari</h2><span className="bk-muted">Har bir zonaning quyi chegarasi (% , davr jami ÷ reja). “Xavf” — Ogohlantirish chegarasidan past hamma natija.</span></div>
    <div className="bk-row">{[...THRESHOLD_KEYS].reverse().map(key => <label key={key} className="bk-field"><span><i className="sp-zone-dot" style={{ background: zoneStyle(key).color }}/>{zoneStyle(key).label}, % dan</span>
      <input inputMode="numeric" value={values[key]} onChange={event => { setMessage(null); setValues(current => ({ ...current, [key]: event.target.value })); }} aria-invalid={!!error}/></label>)}</div>
    {error ? <p className="bk-field-error" role="alert">{error}</p> : <p className="bk-muted" style={{ fontSize: 12 }}>{preview!.map(zone => `${zone.range} ${zone.label}`).join(" · ")}</p>}
    <div className="bk-actions">
      <button type="submit" className="bk-btn is-primary" disabled={pending || !!error}>Saqlash</button>
      <button type="button" className="bk-btn" disabled={pending} onClick={() => { setValues(Object.fromEntries(THRESHOLD_KEYS.map(key => [key, String(DEFAULT_THRESHOLDS[key])]))); save(DEFAULT_THRESHOLDS); }}>Standartga qaytarish</button>
      {message && <span className={`bk-status-line ${message.ok ? "is-ok" : "is-bad"}`} role="status">{message.text}</span>}
    </div>
  </form>;
}
