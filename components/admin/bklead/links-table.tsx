"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pause, Pencil, Play, Search, Trash2 } from "lucide-react";
import { deleteLinkAction, setLinkStatusAction } from "@/app/admin/(protected)/links/actions";
import { formatInt, formatPercent, formatUsd } from "@/lib/dashboard/format";
import { REFERRAL_SOURCES, SOURCE_LABELS, type ReferralSourceKey } from "@/lib/referrals/rules";
import type { LinkRow } from "@/lib/referrals/queries";
import { CopyButton, SourceIcon } from "./bits";

export function LinksTable({ rows, siteHost, canEdit }: { rows: LinkRow[]; siteHost: string; canEdit: boolean }) {
  const [source, setSource] = useState<ReferralSourceKey | "ALL">("ALL"), [query, setQuery] = useState(""), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const counts = useMemo(() => Object.fromEntries(REFERRAL_SOURCES.map(key => [key, rows.filter(row => row.source === key).length])), [rows]);
  const visible = rows.filter(row => (source === "ALL" || row.source === source) && `${row.name} ${row.slug}`.toLocaleLowerCase("uz-UZ").includes(query.trim().toLocaleLowerCase("uz-UZ")));
  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => { setError(""); const result = await action(); if (!result.ok) setError(result.error || "Bajarilmadi."); else router.refresh(); });

  return <section className="bk-card" aria-label="Referal linklar">
    <div className="bk-toolbar" style={{ marginBottom: 14 }}>
      <div className="bk-chips" role="group" aria-label="Manba bo‘yicha">
        <button type="button" className={`bk-chip${source === "ALL" ? " is-active" : ""}`} aria-pressed={source === "ALL"} onClick={() => setSource("ALL")}>Barchasi <small>{rows.length}</small></button>
        {REFERRAL_SOURCES.filter(key => counts[key]).map(key => <button type="button" key={key} className={`bk-chip${source === key ? " is-active" : ""}`} aria-pressed={source === key} onClick={() => setSource(key)}>{SOURCE_LABELS[key]} <small>{counts[key]}</small></button>)}
      </div>
      <label className="bk-search"><Search size={15} aria-hidden="true"/><span className="bk-sr-only">Link nomi bo‘yicha qidirish</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Link nomi..."/></label>
    </div>
    {error && <p className="bk-note is-soft" role="alert" style={{ marginBottom: 10 }}>{error}</p>}
    {!rows.length ? <div className="bk-empty"><strong>Hali referal link yo‘q</strong><span>Birinchi linkni yarating — har bir reklama, bloger yoki post uchun alohida.</span>{canEdit && <Link className="bk-btn is-primary" href="/admin/links/new">Yangi link</Link>}</div>
      : !visible.length ? <div className="bk-empty">Qidiruv bo‘yicha link topilmadi.</div>
      : <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>Link</th><th>Klik</th><th>Ketdi</th><th>Qiziqdi</th><th>Bog‘lanish</th><th>Zayavka</th><th>Sotuv</th><th>Konv.</th><th>Xarajat</th><th>Lid narxi</th><th>Holat</th>{canEdit && <th><span className="bk-sr-only">Amallar</span></th>}</tr></thead>
        <tbody>{visible.map(row => {
          const url = `${siteHost}/r/${row.slug}`;
          return <tr key={row.id}>
            <td><div className="bk-link-cell"><SourceIcon source={row.source}/><div><Link href={`/admin/links/${row.id}`}>{row.name}</Link><small>{url}</small></div><CopyButton text={`https://${url}`} compact/></div></td>
            <td className="is-strong">{formatInt(row.clicks)}</td><td>{formatInt(row.outcomes.LEFT)}</td><td>{formatInt(row.outcomes.INTERESTED)}</td><td>{formatInt(row.outcomes.CONTACT_ATTEMPT)}</td>
            <td className="is-blue">{formatInt(row.leads)}</td><td>{formatInt(row.sales)}</td>
            <td className={row.clicks >= 50 && row.conversion < 2 ? "is-orange" : row.conversion >= 5 ? "is-blue" : ""}>{formatPercent(row.conversion)}</td>
            <td>{row.costUsd ? formatUsd(row.costUsd) : "—"}</td>
            <td className={row.costPerLead && row.costPerLead >= 15 ? "is-orange" : ""}>{row.costPerLead ? formatUsd(row.costPerLead, 1) : row.costUsd ? "—" : <span className="bk-muted">organik</span>}</td>
            <td><span className={`bk-badge${row.status === "PAUSED" ? " is-grey" : ""}`}>{row.status === "ACTIVE" ? "Faol" : "To‘xtatilgan"}</span></td>
            {canEdit && <td><div className="bk-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
              <button type="button" className="bk-btn bk-icon-btn" disabled={pending} onClick={() => run(() => setLinkStatusAction(row.id, row.status === "ACTIVE" ? "PAUSED" : "ACTIVE"))} aria-label={row.status === "ACTIVE" ? `${row.name} — to‘xtatish` : `${row.name} — qayta yoqish`} title={row.status === "ACTIVE" ? "To‘xtatish" : "Qayta yoqish"}>{row.status === "ACTIVE" ? <Pause size={15}/> : <Play size={15}/>}</button>
              <Link className="bk-btn bk-icon-btn" href={`/admin/links/${row.id}/edit`} aria-label={`${row.name} — tahrirlash`} title="Tahrirlash"><Pencil size={15}/></Link>
              {!row.hasVisits && <button type="button" className="bk-btn bk-icon-btn" disabled={pending} onClick={() => { if (window.confirm(`“${row.name}” linkini o‘chirasizmi?`)) run(() => deleteLinkAction(row.id)); }} aria-label={`${row.name} — o‘chirish`} title="O‘chirish (tashrif yo‘q)"><Trash2 size={15}/></button>}
            </div></td>}
          </tr>;
        })}</tbody>
      </table></div>}
  </section>;
}

export function LinkStatusButton({ id, status }: { id: string; status: "ACTIVE" | "PAUSED" }) {
  const [pending, startTransition] = useTransition(), [error, setError] = useState("");
  const router = useRouter();
  const toggle = () => startTransition(async () => { const result = await setLinkStatusAction(id, status === "ACTIVE" ? "PAUSED" : "ACTIVE"); if (result.ok) router.refresh(); else setError(result.error); });
  return <><button type="button" className="bk-btn" disabled={pending} onClick={toggle}>{status === "ACTIVE" ? <><Pause size={15}/>To‘xtatish</> : <><Play size={15}/>Qayta yoqish</>}</button>{error && <span className="bk-status-line is-bad" role="alert">{error}</span>}</>;
}
