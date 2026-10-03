// Seller dashboard blocks rendered on the server: only the props below reach the page, and RankingRow carries
// nothing but rank, name, percent and zone of other sellers.
import { formatPercent, formatUsd } from "@/lib/dashboard/format";
import { nextPlaceHint, type MyPlace, type RankingRow } from "@/lib/sales-plan/seller-ranking";
import { zoneStyle } from "@/lib/sales-plan/zones";

/** "Siz N-o‘rindasiz" card on top of /admin/my. */
export function RankHero({ me }: { me: MyPlace | null }) {
  if (!me) return <section className="sl-hero is-empty" aria-label="Sotuvchilar reytingi">
    <div className="sl-hero-place">
      <span className="sl-hero-circle" style={{ background: "#2A3A5C", color: "#fff" }}><b>—</b></span>
      <div className="sl-hero-text"><span>Sotuvchilar reytingida</span><strong>Rejangiz hali kiritilmagan</strong><small>Reja kiritilgach o‘rningiz va bajarilish foizi shu yerda chiqadi.</small></div>
    </div>
  </section>;
  const zone = zoneStyle(me.zone);
  const fill = Math.min(100, Math.max(0, me.percent));
  const mark = Math.min(100, me.excellentPercent);
  const next = nextPlaceHint(me);
  return <section className="sl-hero" aria-label="Sotuvchilar reytingidagi o‘rningiz">
    <div className="sl-hero-place">
      <span className="sl-hero-circle" style={{ background: zone.color, color: zone.text }}><b>{me.rank}</b><small>o‘rin</small></span>
      <div className="sl-hero-text">
        <span>Sotuvchilar reytingida</span>
        <strong>Siz {me.rank}-o‘rindasiz · {formatPercent(me.percent)}</strong>
        <em style={{ background: zone.color, color: zone.text }}>{zone.label} zona · {me.count} kishidan</em>
      </div>
    </div>
    <div className="sl-hero-progress">
      <div className="sl-hero-numbers"><span>Jami {formatUsd(me.total)}</span><span>Reja {formatUsd(me.plan)}</span></div>
      <div className="sl-hero-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill)} aria-label="Reja bajarilishi">
        <i style={{ width: `${fill}%`, background: zone.color }}/>
        <span className="sl-hero-mark" style={{ left: `${mark}%` }} title={`${me.excellentPercent}% (${me.excellentLabel})`}/>
      </div>
      <p>
        {next.kind === "first" ? <b>Siz birinchisiz!</b> : next.kind === "tied" ? <>{next.rank}-o‘rin bilan tengsiz — <b>{formatUsd(1)}</b> ko‘proq sotsangiz o‘tib ketasiz</> : <>{next.rank}-o‘ringa chiqish uchun yana <b>{formatUsd(next.usd)}</b> kerak</>}
        {me.toExcellent > 0 && <> · {me.excellentPercent}% ({me.excellentLabel}) gacha <b>{formatUsd(me.toExcellent)}</b></>}
      </p>
    </div>
  </section>;
}

/** Current-period ranking of every seller and branch with a plan; the viewer's row is highlighted. */
export function SellerRankingList({ rows, periodName }: { rows: RankingRow[]; periodName: string | null }) {
  return <section className="bk-card" aria-labelledby="sl-ranking-title">
    <div className="bk-card-head"><div><h2 id="sl-ranking-title">Sotuvchilar reytingi</h2><span className="bk-muted">{periodName ? `${periodName} · ` : ""}Sotuv rejasi bajarilishi % · boshqalarning summalari ko‘rinmaydi</span></div></div>
    {rows.length ? <ol className="sl-ranking">{rows.map(row => {
      const zone = zoneStyle(row.zone);
      return <li key={row.rank} className={row.isMe ? "is-me" : undefined} aria-current={row.isMe ? "true" : undefined}>
        <span className="sl-ranking-place">{row.rank}</span>
        <b>{row.name}{row.isMe && " (Siz)"}</b>
        <span className="bk-track sl-ranking-track"><i style={{ width: `${Math.min(100, Math.max(2, row.percent))}%`, background: zone.color }}/></span>
        <em>{formatPercent(row.percent)}</em>
        <span className="sl-zone" style={{ background: zone.color, color: zone.text }}>{zone.label}</span>
      </li>;
    })}</ol> : <div className="bk-empty">Joriy davr uchun reja hali kiritilmagan.</div>}
  </section>;
}
