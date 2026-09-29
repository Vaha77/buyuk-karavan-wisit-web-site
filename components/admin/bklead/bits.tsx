"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Film, Link2, Mic, Music2, Play, QrCode, Search, Send } from "lucide-react";
import { RANGE_OPTIONS } from "@/lib/dashboard/period";
import type { ReferralSourceKey } from "@/lib/referrals/rules";

// Generic stroke icons only (no third-party brand logos).
const SOURCE_ICONS: Record<ReferralSourceKey, typeof Play> = { YOUTUBE: Play, INSTAGRAM: Film, TELEGRAM: Send, TIKTOK: Music2, GOOGLE_ADS: Search, BLOGGER: Mic, QR: QrCode, OTHER: Link2 };
export function SourceIcon({ source, size = 17 }: { source: ReferralSourceKey; size?: number }) {
  const Icon = SOURCE_ICONS[source];
  return <span className="bk-source" data-source={source} aria-hidden="true"><Icon size={size} strokeWidth={1.9}/></span>;
}

export function CopyButton({ text, label = "Nusxalash", compact = false }: { text: string; label?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked: the URL stays visible to copy by hand */ } };
  return <button type="button" className={`bk-btn${compact ? " bk-icon-btn" : ""}`} onClick={() => void copy()} aria-label={compact ? `${text} — nusxalash` : undefined} title={compact ? "Nusxalash" : undefined}>
    {copied ? <Check size={15}/> : <Copy size={15}/>}{!compact && (copied ? "Nusxalandi" : label)}
  </button>;
}

/** Date range for every dashboard block: 7 / 30 / 90 days, this year or a custom range (kept in the URL). */
export function RangeSelect({ value, from, to }: { value: string; from: string; to: string }) {
  const router = useRouter(), params = useSearchParams();
  const [custom, setCustom] = useState({ from, to }), [selected, setSelected] = useState(value);
  const go = (range: string, extra: Record<string, string> = {}) => {
    const next = new URLSearchParams(params.toString());
    next.delete("from"); next.delete("to");
    if (range === "30d") next.delete("range"); else next.set("range", range);
    for (const [key, item] of Object.entries(extra)) next.set(key, item);
    router.push(`?${next}`);
  };
  return <div className="bk-actions">
    <label className="bk-sr-only" htmlFor="bk-range">Davr</label>
    <select id="bk-range" className="bk-btn" value={selected} onChange={event => { setSelected(event.target.value); if (event.target.value !== "custom") go(event.target.value); }}>
      {RANGE_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
    </select>
    {selected === "custom" && <>
      <input className="bk-btn" type="date" aria-label="Boshlanish sanasi" value={custom.from} onChange={event => setCustom(current => ({ ...current, from: event.target.value }))}/>
      <input className="bk-btn" type="date" aria-label="Tugash sanasi" value={custom.to} onChange={event => setCustom(current => ({ ...current, to: event.target.value }))}/>
      <button type="button" className="bk-btn" onClick={() => go("custom", custom)}>Ko‘rsatish</button>
    </>}
  </div>;
}
