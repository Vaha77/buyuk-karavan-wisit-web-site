// Seller dashboard: only the viewer's own place reaches the page, never other sellers' names or percents.
import { formatPercent } from "@/lib/dashboard/format";
import type { MyPlace } from "@/lib/sales-plan/seller-ranking";
import { zoneStyle } from "@/lib/sales-plan/zones";

/** "Sotuv rejasi reytingida siz N-o‘rindasiz" card on top of /admin/my. */
export function RankCard({ me, periodName }: { me: MyPlace | null; periodName: string | null }) {
  const zone = me && zoneStyle(me.zone);
  return <section className="bk-card" aria-label="Sotuv rejasi reytingidagi o‘rningiz" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", padding: "12px 16px" }}>
    {me && zone ? <>
      <strong>Sotuv rejasi reytingida siz {me.rank}-o‘rindasiz · {formatPercent(me.percent)}</strong>
      <span className="sl-zone" style={{ background: zone.color, color: zone.text }}>{zone.label}</span>
    </> : <strong>Sotuv rejangiz hali kiritilmagan</strong>}
    {periodName && <span className="bk-muted">{periodName}</span>}
  </section>;
}
