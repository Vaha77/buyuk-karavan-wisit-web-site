"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markImportSentAction } from "@/app/admin/(import)/import/actions";
import { BusyLabel, DownloadButton } from "@/components/admin/feedback";
import { formatDecimal } from "@/lib/dashboard/format";
import type { CatalogGroup } from "@/lib/import/rules";

// Same output on server and browser (no Intl hydration mismatch).
const num = (n: number) => formatDecimal(n, 2);

/** Boss summary of APPROVED orders; "Zavodga yuborildi" marks exactly `orderIds` (what this page showed). */
export function SummaryBoard({ groups, orderIds, seenAt }: { groups: CatalogGroup[]; orderIds: string[]; seenAt: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const totals = new Map<string, number>();
  for (const group of groups) if (group.amount) totals.set(group.currency, (totals.get(group.currency) ?? 0) + group.amount);
  const send = () => startTransition(async () => {
    const result = await markImportSentAction(orderIds);
    setConfirming(false);
    setMessage(result.ok ? { ok: true, text: `${result.count} ta zayavka zavodga yuborildi ✓` } : { ok: false, text: result.error });
    if (result.ok) router.refresh();
  });
  const kpi = (label: string, value: string) => <div className="bk-card bk-kpi"><div className="bk-kpi-top">{label}</div><strong className="impa-kpi">{value}</strong></div>;
  return <>
    <div className="impa-kpis">
      {kpi("Tasdiqlangan", `${orderIds.length} zayavka`)}{kpi("Kataloglar", String(groups.length))}
      {kpi("Jami dona", num(groups.reduce((sum, group) => sum + group.qty, 0)))}
      {kpi("Summa", [...totals].map(([currency, amount]) => `${num(amount)} ${currency}`).join(" + ") || "—")}
    </div>
    <section className="bk-card impa-board">
      <div className="impa-head">
        <h2 className="impa-title">Zavod bo‘yicha yig‘ma</h2>
        {groups.length > 0 && <div className="impa-actions is-row">
          <DownloadButton href={`/admin/import/yigma/export?at=${seenAt}`} className="impa-btn is-gold" label="📥 Excel yuklab olish" fallbackName="import-yigma.xlsx"/>
          {confirming ? <>
            <span className="bk-muted">{orderIds.length} ta zayavka “Zavodga yuborildi” bo‘ladi. Davom etasizmi?</span>
            <button type="button" className="impa-btn is-green" disabled={pending} onClick={send}><BusyLabel busy={pending}>Ha, yuborildi</BusyLabel></button>
            <button type="button" className="impa-btn" disabled={pending} onClick={() => setConfirming(false)}>Bekor</button>
          </> : <button type="button" className="impa-btn is-green" onClick={() => { setConfirming(true); setMessage(null); }}>Zavodga yuborildi ✓</button>}
        </div>}
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "impa-ok" : "impa-err"}>{message.text}</p>}
      {groups.length ? <>
        <div className="bk-table-wrap"><table className="bk-table impa-table">
          <thead><tr><th>Agent / Katalog</th><th>Davlat</th><th>Pozitsiya</th><th>Zayavka</th><th>Dona</th><th>Summa</th></tr></thead>
          <tbody>{groups.map(group => <tr key={group.catalogId}>
            <td><b>{group.agent}</b><br/><span className="bk-muted">{group.title} · {group.code}</span></td>
            <td>{group.country}</td><td>{group.positions}</td><td>{group.orders}</td><td>{num(group.qty)}</td>
            <td>{group.amount ? `${num(group.amount)} ${group.currency}` : "—"}{group.unpriced > 0 && <><br/><span className="impa-pill p3">narxsiz: {group.unpriced}</span></>}</td>
          </tr>)}</tbody>
        </table></div>
        {groups.map(group => <details key={group.catalogId} className="impa-details">
          <summary>{group.agent} · {group.title} — {group.lines.length} qator</summary>
          <div className="bk-table-wrap"><table className="bk-table impa-table">
            <thead><tr><th>Kod / Model</th><th>Nomi</th><th>Soni</th><th>Narx</th><th>Summa</th><th>Sotuvchi / Mijoz</th><th>Zayavka</th></tr></thead>
            <tbody>{group.lines.map((line, i) => <tr key={i}>
              <td><span className="impa-code">{line.code}</span><br/>{line.model}</td><td>{line.nameUz}<br/><span className="bk-muted">{line.nameEn}</span></td>
              <td>{num(line.qty)}</td><td>{line.price == null ? "—" : num(line.price)}</td><td>{line.amount == null ? "—" : num(line.amount)}</td>
              <td>{line.seller}{line.client && <><br/><span className="bk-muted">{line.client}</span></>}</td><td>{line.order}</td>
            </tr>)}</tbody>
          </table></div>
        </details>)}
      </> : <div className="bk-empty">Tasdiqlangan, zavodga yuborilmagan zayavka yo‘q.</div>}
    </section>
  </>;
}
