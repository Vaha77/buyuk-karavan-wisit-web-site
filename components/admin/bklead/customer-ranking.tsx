import Link from "next/link";
import type { CustomerYearData } from "@/lib/customers/queries";
import { formatUsd, formatUsdK, MONTHS_LONG } from "@/lib/dashboard/format";
import { regionName } from "@/lib/dashboard/regions";
import { rankCustomers, requiredMonths } from "@/lib/dashboard/rules";
import { MonthlySaleButton } from "./monthly-sale-dialog";

const PLACE_LABELS = { 1: "1-O‘RIN · OLTIN", 2: "2-O‘RIN · KUMUSH", 3: "3-O‘RIN · BRONZA" } as const;
const shortRegion = (code: string | null) => code ? regionName(code).replace(/ viloyati$/, "") : "";

/** "Doimiy mijozlar reytingi — {yil}": podium, monthly table and status per customer. */
export function CustomerRanking({ data, now, canEdit, uzsPerUsd, yearHref }: { data: CustomerYearData; now: { year: number; month: number }; canEdit: boolean; uzsPerUsd: number | null; yearHref: (year: number) => string }) {
  const rows = rankCustomers(data.customers, data.year, now);
  const lastMonth = data.year < now.year ? 12 : now.month;
  const required = new Set(requiredMonths(data.year, now));
  const podium = [rows[1], rows[0], rows[2]].map((row, index) => ({ row, place: ([2, 1, 3] as const)[index] }));
  const monthsElapsed = data.year < now.year ? 12 : now.month;
  return <section className="bk-card" aria-labelledby="bk-ranking-title">
    <div className="bk-card-head">
      <div><h2 id="bk-ranking-title">Doimiy mijozlar reytingi — {data.year}</h2><span className="bk-muted">Oylik savdoni admin qo‘lda kiritadi · yil yakunida 1, 2, 3-o‘rin egalariga sovrin</span></div>
      <div className="bk-actions">
        <div className="bk-chips" role="group" aria-label="Yil">{data.years.slice(0, 4).map(year => <Link key={year} className={`bk-chip${year === data.year ? " is-active" : ""}`} aria-current={year === data.year ? "true" : undefined} href={yearHref(year)}>{year}-yil</Link>)}</div>
        {canEdit && <MonthlySaleButton data={data} now={now} uzsPerUsd={uzsPerUsd}/>}
      </div>
    </div>
    {!rows.length ? <div className="bk-empty"><strong>Hali doimiy mijoz qo‘shilmagan</strong><span>Mijozlarni qo‘shing va har oy savdo summasini kiriting — reyting shu yerda chiqadi.</span>{canEdit && <Link className="bk-btn is-primary" href="/admin/customers?new=1">+ Yangi doimiy mijoz qo‘shish</Link>}</div> : <>
      <div className="bk-podium">{podium.map(({ row, place }) => row ? <div key={place} className={`bk-podium-card is-${place}`}>
        <header><span className={`bk-medal is-${place}`}>{place}</span>{PLACE_LABELS[place]}</header>
        <b>{row.name}</b><small>{[shortRegion(row.regionCode), `${monthsElapsed} oyda`].filter(Boolean).join(" · ")}</small>
        <strong>{formatUsd(row.total)}</strong>
        {data.prizes[place] && <small>Sovrin: {data.prizes[place]}</small>}
      </div> : <div key={place}/>)}</div>
      <div className="bk-table-wrap"><table className="bk-table">
        <thead><tr><th>O‘rin</th><th className="is-left">Mijoz</th><th className="is-left">Viloyat</th>{MONTHS_LONG.slice(0, lastMonth).map(label => <th key={label} title={label}>{label.slice(0, 3)}</th>)}<th>Jami, $</th><th className="is-left">Holat</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td>{row.place <= 3 ? <span className={`bk-medal is-${row.place}`} style={{ marginLeft: "auto" }}>{row.place}</span> : row.place}</td>
          <td className="is-left is-strong">{row.name}</td><td className="is-left bk-muted">{shortRegion(row.regionCode) || "—"}</td>
          {row.months.slice(0, lastMonth).map((value, index) => <td key={index}>{value === null ? (required.has(index + 1) ? <span className="bk-month-empty" title={`${MONTHS_LONG[index]} kiritilmagan`}>—</span> : <span className="bk-muted">—</span>) : formatUsdK(value)}</td>)}
          <td className="is-strong">{formatUsd(row.total)}</td>
          <td className="is-left"><span className={`bk-badge${row.status.tone === "missing" ? " is-soft" : row.status.tone === "gap" ? "" : " is-grey"}`}>{row.status.text}</span></td>
        </tr>)}</tbody>
      </table></div>
      <p className="bk-muted" style={{ marginTop: 10, fontSize: 12 }}>Reyting yil boshidan jami summa (USD) bo‘yicha. Sovrinlar 31-dekabr holatiga ko‘ra beriladi.</p>
    </>}
  </section>;
}
