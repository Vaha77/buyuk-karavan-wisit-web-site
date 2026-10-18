"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wrench } from "lucide-react";
import type { SellerQueue } from "@/lib/sex/rules";

/** "Seh navbati": the seller's place (counting up) and the workshop's open orders in queue order. `limit` = short version. */
export function SehQueue({ workshopName, rows, me, limit }: SellerQueue & { workshopName: string; limit?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!me) return;
    // Reduced motion: one step straight to the place.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let value = reduce ? me.place - 1 : 0;
    const timer = setInterval(() => { value += 1; setShown(value); if (value >= me.place) clearInterval(timer); }, reduce ? 0 : 200);
    return () => clearInterval(timer);
  }, [me]);
  const visible = limit ? rows.slice(0, limit) : rows;
  return <div className="sq">
    <div className="sq-hero">
      {me ? <><div className="sq-big" aria-hidden="true">{shown}</div><div><p>Navbatdagi o‘rningiz</p><h2>{me.working ? "Zakazingiz yig‘ilyapti" : `Zakazingiz ${me.place}-navbatda · oldingizda ${me.ahead} ta zakaz`}</h2></div></>
        : <div><p>Navbatdagi o‘rningiz</p><h2>Navbatda zakazingiz yo‘q</h2></div>}
    </div>
    <div className="sq-box">
      <div className="sq-head"><div className="sq-av">{workshopName.trim()[0]?.toUpperCase() ?? "S"}</div><div><b>{workshopName}</b><span>Seh · zborka</span></div><span className="sq-tot">Navbatda {rows.length} ta</span></div>
      {visible.length ? <ol className="sq-list">{visible.map(row => <li key={row.place} className={row.working ? "is-now" : row.mine ? "is-me" : undefined}>
        <span className="sq-p">{row.place}</span>
        <span className="sq-t">{row.mine ? "Siz · " : ""}{row.title}</span>
        {row.working ? <span className="sq-s sq-wr"><Wrench size={16} className="sq-key" aria-hidden="true"/>yig‘ilyapti</span> : row.seller && <span className="sq-s">{row.seller}</span>}
        {row.working && <i aria-hidden="true"/>}
      </li>)}</ol> : <p className="bk-muted" style={{ margin: 0 }}>Navbat bo‘sh.</p>}
      {limit && rows.length > limit && <Link className="sq-more" href="/admin/seh">Barcha navbat ({rows.length}) →</Link>}
    </div>
  </div>;
}
