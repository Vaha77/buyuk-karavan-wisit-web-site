"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { LEADERBOARD_SIZES, type LeaderRow } from "@/lib/customers/leaderboard";

/** All sellers' customers by this year's approved purchases; only places are shown, never amounts. */
export function CustomerLeaderboard({ rows, year }: { rows: LeaderRow[]; year: number }) {
  const [size, setSize] = useState<number>(LEADERBOARD_SIZES[0]);
  return <section className="bk-card" aria-labelledby="sl-leaders-title">
    <div className="bk-card-head">
      <div><h2 id="sl-leaders-title">Mijozlar reytingi — {year}</h2><span className="bk-muted">Yil boshidan tasdiqlangan xaridlar bo‘yicha · summalar ko‘rsatilmaydi</span></div>
      <div className="bk-chips" role="group" aria-label="Ko‘rsatish">{LEADERBOARD_SIZES.map(value => <button key={value} type="button" className={`bk-chip${size === value ? " is-active" : ""}`} aria-pressed={size === value} onClick={() => setSize(value)}>Top {value}</button>)}</div>
    </div>
    {rows.length ? <ol className="bk-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>{rows.slice(0, size).map(row => <li key={row.place} style={row.mine ? { background: "#EAF2FD", borderRadius: 8, padding: "10px 8px" } : undefined} aria-current={row.mine ? "true" : undefined}>
      <span className={`bk-medal${row.place <= 3 ? ` is-${row.place}` : ""}`}>{row.place}</span>
      <div className="bk-grow"><b>{row.name}</b><span>{row.seller ?? "Sotuvchi biriktirilmagan"}</span></div>
      {row.mine && <span className="bk-badge">Sizning mijozingiz</span>}
      {row.prize && <span className="bk-badge is-soft"><Gift size={11} style={{ marginRight: 4 }}/>{row.prize}</span>}
    </li>)}</ol> : <div className="bk-empty">Bu yil hali tasdiqlangan xarid yo‘q.</div>}
  </section>;
}
