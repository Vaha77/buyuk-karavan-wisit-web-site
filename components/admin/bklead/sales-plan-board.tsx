import { formatInt, formatPercent, formatUsd, formatUsdK, MONTHS_LONG } from "@/lib/dashboard/format";
import { THRESHOLD, ZONE_BY_KEY, ZONES, type PersonResult, type PlanBoard, type ZoneKey } from "@/lib/sales-plan/rules";

const initials = (name: string) => name.replace(/\b(aka|filiali)\b/gi, "").trim().split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || name.slice(0, 2).toUpperCase();
const zoneStyle = (zone: ZoneKey) => ({ "--sp-zone": ZONE_BY_KEY[zone].color, "--sp-zone-text": ZONE_BY_KEY[zone].text }) as React.CSSProperties;
const groupId = (plan: number) => `sp-group-${Math.round(plan)}`;

export function ZoneChip({ zone }: { zone: ZoneKey }) {
  return <span className="sp-zone-chip" style={zoneStyle(zone)}>{ZONE_BY_KEY[zone].label}</span>;
}

/** Progress bar capped at 100%, with the 60% line. */
function Progress({ percent, zone, label }: { percent: number; zone: ZoneKey; label: string }) {
  return <div className="sp-progress" style={zoneStyle(zone)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(percent))} aria-valuetext={formatPercent(percent, 2)}>
    <i style={{ width: `${Math.min(100, Math.max(percent > 0 ? 1.5 : 0, percent))}%` }}/>
    <b style={{ left: `${THRESHOLD}%` }} title="60% chegarasi"/>
  </div>;
}

export function ZoneLegend() {
  return <div className="bk-chips sp-legend" aria-label="Bajarilish zonalari (davr jami ÷ reja)">
    {ZONES.map(zone => <span key={zone.key} className="bk-chip"><i style={{ background: zone.color }}/>{zone.range} {zone.label}</span>)}
  </div>;
}

export function SalesPlanBoard({ board }: { board: PlanBoard }) {
  return <>
    <div className="sp-group-cards">{board.groups.map(group => <a key={group.plan} href={`#${groupId(group.plan)}`} className="bk-card sp-group-card" style={zoneStyle(group.zone)}>
      <span className="bk-muted">Reja: {formatInt(group.plan)}</span>
      <strong>{formatPercent(group.percent, 1)}</strong>
      <Progress percent={group.percent} zone={group.zone} label={`Reja ${formatInt(group.plan)} guruhi bajarilishi`}/>
      <span className="sp-small">{group.people.length} ta sotuvchi · {formatUsd(group.total)} / {formatUsd(group.planSum)}</span>
      <span className="sp-small"><b className="sp-ok">{group.above} tasi 60%+</b> · <b className={group.below ? "sp-bad" : undefined}>{group.below} tasi 60% dan past</b></span>
    </a>)}</div>

    {board.groups.map(group => <section key={group.plan} id={groupId(group.plan)} className="sp-group" aria-labelledby={`${groupId(group.plan)}-title`}>
      <div className="sp-group-head">
        <h2 id={`${groupId(group.plan)}-title`}>Reja: {formatInt(group.plan)}</h2>
        <span className="bk-muted">Guruh natijasi: <b style={{ color: "var(--bk-text)" }}>{formatPercent(group.percent, 1)}</b> · {formatUsd(group.total)} / {formatUsd(group.planSum)}</span>
        <ZoneChip zone={group.zone}/>
      </div>
      <div className="sp-people">{group.people.map(person => <PersonCard key={person.id} person={person}/>)}</div>
    </section>)}
  </>;
}

function PersonCard({ person }: { person: PersonResult }) {
  const subtitle = [person.kind === "BRANCH" ? `Filial${person.branchHead ? ` · mas’ul: ${person.branchHead}` : ""}` : "Xodim", person.note].filter(Boolean).join(" · ");
  return <article className="bk-card sp-person" style={zoneStyle(person.zone)} aria-label={`${person.name}: ${formatPercent(person.percent, 2)}`}>
    <header>
      <span className="sp-avatar" aria-hidden="true">{initials(person.name)}</span>
      <div className="sp-person-name"><b>{person.name}</b><small>{subtitle}</small><ZoneChip zone={person.zone}/></div>
      <strong className="sp-percent">{formatPercent(person.percent, 2)}</strong>
    </header>
    <div className="sp-amounts"><b>{formatUsd(person.total)}</b><span className="bk-muted"> / {formatUsd(person.plan)}</span></div>
    <Progress percent={person.percent} zone={person.zone} label={`${person.name}: rejaning bajarilishi`}/>
    <div className="sp-facts">
      {person.over > 0 ? <span className="sp-ok">Rejadan +{formatUsd(person.over)} oshgan</span> : <span>Rejagacha <b>{formatUsd(person.remaining)}</b> qoldi</span>}
      <span className="bk-muted">60% chegarasi: {formatUsd(person.threshold)}</span>
    </div>
    <ol className="sp-months" style={{ gridTemplateColumns: `repeat(${Math.min(6, person.months.length)}, minmax(0, 1fr))` }}>
      {person.months.map(cell => {
        const label = `${MONTHS_LONG[cell.month - 1]} ${cell.year}`;
        return <li key={`${cell.year}-${cell.month}`} className={cell.zone ? "" : "is-empty"} style={cell.zone ? zoneStyle(cell.zone) : undefined}
          title={cell.amount === null ? `${label}: kiritilmagan` : `${label}: ${formatUsd(cell.amount)} · oylik rejaning ${formatPercent(cell.percent, 1)}`}>
          <span>{MONTHS_LONG[cell.month - 1].slice(0, 3)}</span>
          {cell.amount === null ? <><b>—</b><small>&nbsp;</small></> : <><b>{formatPercent(cell.percent, 0)}</b><small>{formatUsdK(cell.amount)}</small></>}
        </li>;
      })}
    </ol>
  </article>;
}

export function ManagerSummary({ board }: { board: PlanBoard }) {
  if (!board.insights.length) return null;
  return <section className="bk-card" aria-labelledby="sp-summary-title">
    <div className="bk-card-head"><div><h2 id="sp-summary-title">Rahbar uchun xulosa</h2><span className="bk-muted">Avtomatik qoidalar asosida · umumiy natija {formatPercent(board.percent, 1)} ({formatUsd(board.total)} / {formatUsd(board.planSum)})</span></div></div>
    <div className="sp-insights">{board.insights.map(insight => <div key={insight.key} className="sp-insight" style={zoneStyle(insight.tone)}><b>{insight.title}</b><p>{insight.text}</p></div>)}</div>
  </section>;
}
