import { formatInt, formatPercent, formatUsd, formatUsdK, MONTHS_LONG } from "@/lib/dashboard/format";
import type { PersonResult, PlanBoard } from "@/lib/sales-plan/rules";
import { zoneStyle, type ZoneInfo, type ZoneKey, type ZoneThresholds } from "@/lib/sales-plan/zones";

const initials = (name: string) => name.replace(/\b(aka|filiali)\b/gi, "").trim().split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || name.slice(0, 2).toUpperCase();
const zoneVars = (zone: ZoneKey) => ({ "--sp-zone": zoneStyle(zone).color, "--sp-zone-text": zoneStyle(zone).text }) as React.CSSProperties;
const groupId = (plan: number) => `sp-group-${Math.round(plan)}`;
const whole = (value: number) => `${Math.round(value)}%`;

export function ZoneChip({ zone }: { zone: ZoneKey }) {
  return <span className="sp-zone-chip" style={zoneVars(zone)}>{zoneStyle(zone).label}</span>;
}

/** Progress bar with thin marks at the fair, excellent and record thresholds (60 / 80 / 100% by default). */
function Progress({ percent, zone, thresholds, label }: { percent: number; zone: ZoneKey; thresholds: ZoneThresholds; label: string }) {
  const scale = Math.max(100, thresholds.record);
  const marks = [thresholds.fair, thresholds.excellent, thresholds.record];
  return <div className="sp-progress" style={zoneVars(zone)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={scale} aria-valuenow={Math.min(scale, Math.round(percent))} aria-valuetext={formatPercent(percent, 1)}>
    <i style={{ width: `${Math.min(100, Math.max(percent > 0 ? 1.5 : 0, (percent / scale) * 100))}%` }}/>
    {marks.map(mark => <b key={mark} style={{ left: `${(mark / scale) * 100}%` }} title={`${whole(mark)} chegarasi`}/>)}
  </div>;
}

export function ZoneLegend({ zones }: { zones: ZoneInfo[] }) {
  return <div className="bk-chips sp-legend" aria-label="Bajarilish zonalari (davr jami ÷ reja)">
    {zones.map(zone => <span key={zone.key} className="bk-chip" title={zone.decision}><i style={{ background: zone.color }}/>{zone.range} {zone.label}</span>)}
  </div>;
}

/** "Zonalar bo‘yicha": how many sellers are in each zone, with names. */
export function ZoneSummary({ board }: { board: PlanBoard }) {
  return <section className="bk-card" aria-labelledby="sp-zones-title">
    <div className="bk-card-head"><div><h2 id="sp-zones-title">Zonalar bo‘yicha</h2><span className="bk-muted">Umumiy natija {formatPercent(board.percent, 1)} · {zoneStyle(board.zone).label}</span></div></div>
    <div className="sp-zone-grid">{board.zones.map(zone => {
      const people = board.byZone.find(item => item.key === zone.key)?.people ?? [];
      return <div key={zone.key} className={`sp-zone-cell${people.length ? "" : " is-empty"}`} style={zoneVars(zone.key)}>
        <div><span className="sp-zone-chip">{zone.label}</span><small>{zone.range}</small><strong>{people.length}</strong></div>
        <p>{people.length ? people.map(person => `${person.name} (${formatPercent(person.percent, 1)})`).join(", ") : "—"}</p>
      </div>;
    })}</div>
  </section>;
}

export function SalesPlanBoard({ board }: { board: PlanBoard }) {
  const { thresholds } = board;
  return <>
    <div className="sp-group-cards">{board.groups.map(group => <a key={group.plan} href={`#${groupId(group.plan)}`} className="bk-card sp-group-card" style={zoneVars(group.zone)}>
      <span className="bk-muted">Reja: {formatInt(group.plan)}</span>
      <strong>{formatPercent(group.percent, 1)}</strong>
      <Progress percent={group.percent} zone={group.zone} thresholds={thresholds} label={`Reja ${formatInt(group.plan)} guruhi bajarilishi`}/>
      <span className="sp-small">{group.people.length} ta sotuvchi · {formatUsd(group.total)} / {formatUsd(group.planSum)}</span>
      <span className="sp-small"><b className="sp-ok">{group.high} tasi {whole(thresholds.excellent)}+</b> · <b>{group.middle} tasi {whole(thresholds.fair)}–{whole(thresholds.excellent - 1)}</b> · <b className={group.low ? "sp-bad" : undefined}>{group.low} tasi {whole(thresholds.fair)} dan past</b></span>
    </a>)}</div>

    {board.groups.map(group => <section key={group.plan} id={groupId(group.plan)} className="sp-group" aria-labelledby={`${groupId(group.plan)}-title`}>
      <div className="sp-group-head">
        <h2 id={`${groupId(group.plan)}-title`}>Reja: {formatInt(group.plan)}</h2>
        <span className="bk-muted">Guruh natijasi: <b style={{ color: "var(--bk-text)" }}>{formatPercent(group.percent, 1)}</b> · {formatUsd(group.total)} / {formatUsd(group.planSum)}</span>
        <ZoneChip zone={group.zone}/>
      </div>
      <div className="sp-people">{group.people.map(person => <PersonCard key={person.id} person={person} thresholds={thresholds}/>)}</div>
    </section>)}
  </>;
}

function PersonCard({ person, thresholds }: { person: PersonResult; thresholds: ZoneThresholds }) {
  const subtitle = [person.kind === "BRANCH" ? `Filial${person.branchHead ? ` · mas’ul: ${person.branchHead}` : ""}` : "Xodim", person.note].filter(Boolean).join(" · ");
  return <article className="bk-card sp-person" style={zoneVars(person.zone)} aria-label={`${person.name}: ${formatPercent(person.percent, 1)}, ${zoneStyle(person.zone).label}`}>
    <header>
      <span className="sp-avatar" aria-hidden="true">{initials(person.name)}</span>
      <div className="sp-person-name"><b>{person.name}</b><small>{subtitle}</small>
        <span className="sp-badges"><ZoneChip zone={person.zone}/>{person.twoPeriods && <span className="sp-streak" title={`Oldingi davr: ${formatPercent(person.previousPercent ?? 0, 1)}`}>⚠ 2 davr ketma-ket</span>}</span>
      </div>
      <strong className="sp-percent">{formatPercent(person.percent, 1)}</strong>
    </header>
    <p className="sp-decision">{zoneStyle(person.zone).decision}</p>
    <div className="sp-amounts"><b>{formatUsd(person.total)}</b><span className="bk-muted"> / {formatUsd(person.plan)}</span></div>
    <Progress percent={person.percent} zone={person.zone} thresholds={thresholds} label={`${person.name}: rejaning bajarilishi`}/>
    <div className="sp-facts">
      {person.over > 0 ? <span className="sp-ok">Rejadan +{formatUsd(person.over)} oshgan</span> : <span>Rejagacha <b>{formatUsd(person.remaining)}</b> qoldi</span>}
      <span className="bk-muted">{whole(thresholds.fair)} chegarasi: {formatUsd(person.plan * (thresholds.fair / 100))}</span>
    </div>
    <ol className="sp-months" style={{ gridTemplateColumns: `repeat(${Math.min(6, person.months.length)}, minmax(0, 1fr))` }}>
      {person.months.map(cell => {
        const label = `${MONTHS_LONG[cell.month - 1]} ${cell.year}`;
        return <li key={`${cell.year}-${cell.month}`} className={cell.zone ? "" : "is-empty"} style={cell.zone ? zoneVars(cell.zone) : undefined}
          title={cell.amount === null ? `${label}: kiritilmagan` : `${label}: ${formatUsd(cell.amount)} · oylik rejaning ${formatPercent(cell.percent, 1)} · ${zoneStyle(cell.zone!).label}`}>
          <span>{MONTHS_LONG[cell.month - 1].slice(0, 3)}</span>
          {cell.amount === null ? <><b>—</b><small>&nbsp;</small></> : <><b>{formatPercent(cell.percent, 0)}</b><small>{formatUsdK(cell.amount)}</small></>}
        </li>;
      })}
    </ol>
  </article>;
}

export function ManagerSummary({ board, previousName }: { board: PlanBoard; previousName: string | null }) {
  if (!board.insights.length) return null;
  return <section className="bk-card" aria-labelledby="sp-summary-title">
    <div className="bk-card-head"><div><h2 id="sp-summary-title">Rahbar uchun xulosa</h2><span className="bk-muted">Avtomatik qoidalar asosida · umumiy natija {formatPercent(board.percent, 1)} ({formatUsd(board.total)} / {formatUsd(board.planSum)}){previousName ? ` · oldingi davr: ${previousName}` : " · oldingi davr ma’lumoti yo‘q"}</span></div></div>
    <div className="sp-insights">{board.insights.map(insight => <div key={insight.key} className="sp-insight" style={zoneVars(insight.tone)}><b>{insight.title}</b><p>{insight.text}</p></div>)}</div>
  </section>;
}
