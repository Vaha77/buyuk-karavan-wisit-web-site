import { formatInt, formatUsd, formatUsdK, MONTHS_LONG, MONTHS_SHORT } from "@/lib/dashboard/format";

/** Daily bars; the highest days are drawn navy, the rest light blue. Server-rendered SVG. */
export function DailyBars({ days, highlight = 2, label }: { days: Array<{ day: string; clicks: number }>; highlight?: number; label: string }) {
  const width = 640, height = 220, top = 10, bottom = 26, gap = 6;
  const max = Math.max(1, ...days.map(day => day.clicks));
  const peaks = new Set([...days].filter(day => day.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, highlight).map(day => day.day));
  const barWidth = (width - gap * (days.length - 1)) / days.length;
  const every = days.length > 16 ? 3 : 1;
  return <svg className="bk-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    {days.map((day, index) => {
      const h = Math.max(day.clicks ? 3 : 1, ((height - top - bottom) * day.clicks) / max), x = index * (barWidth + gap);
      return <g key={day.day}>
        <rect x={x} y={height - bottom - h} width={barWidth} height={h} rx="3" fill={peaks.has(day.day) ? "var(--chart-bar, #123E7C)" : day.clicks ? "var(--chart-soft, #8DB0E4)" : "#E6EBF2"}><title>{`${day.day}: ${formatInt(day.clicks)} klik`}</title></rect>
        {index % every === 0 && <text x={x + barWidth / 2} y={height - 8} textAnchor="middle">{Number(day.day.slice(8))}</text>}
      </g>;
    })}
  </svg>;
}

/** Weekly two-series line chart (first series navy, second orange) with a label on the last navy point ("12 lid"). */
export function WeeklyLines({ weeks, label, unit = "lid" }: { weeks: Array<{ label: string; leads: number; calculations: number }>; label: string; unit?: string }) {
  const width = 640, height = 230, left = 30, right = 16, top = 26, bottom = 26;
  const max = Math.max(4, ...weeks.flatMap(week => [week.leads, week.calculations]));
  const step = Math.ceil(max / 3), scaleMax = step * 3;
  const x = (index: number) => left + (index * (width - left - right)) / Math.max(1, weeks.length - 1);
  const y = (value: number) => top + (height - top - bottom) * (1 - value / scaleMax);
  const line = (key: "leads" | "calculations") => weeks.map((week, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(week[key]).toFixed(1)}`).join("");
  const last = weeks.at(-1), lastX = x(weeks.length - 1);
  const tagWidth = Math.max(56, 16 + `${formatInt(last?.leads ?? 0)} ${unit}`.length * 6.5);
  return <svg className="bk-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    {[0, 1, 2, 3].map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick * step)} y2={y(tick * step)} stroke="var(--k-bd-e3e9f2, #E3E9F2)"/><text x={left - 8} y={y(tick * step) + 4} textAnchor="end">{tick * step}</text></g>)}
    <path d={`${line("leads")}L${lastX.toFixed(1)} ${y(0)}L${x(0)} ${y(0)}Z`} fill="var(--chart-bar, #123E7C)" opacity=".06"/>
    <path d={line("leads")} fill="none" stroke="var(--chart-bar, #123E7C)" strokeWidth="2.2" strokeLinejoin="round"/>
    <path d={line("calculations")} fill="none" stroke="#E07A2E" strokeWidth="2" strokeLinejoin="round"/>
    {weeks.map((week, index) => index % 2 === 0 && <text key={week.label} x={x(index)} y={height - 6} textAnchor="middle">{week.label}</text>)}
    {last && <g>
      <circle cx={lastX} cy={y(last.leads)} r="4.5" fill="var(--k-bg-ffffff, #fff)" stroke="var(--chart-bar, #123E7C)" strokeWidth="2"/><circle cx={lastX} cy={y(last.calculations)} r="4" fill="var(--k-bg-ffffff, #fff)" stroke="#E07A2E" strokeWidth="2"/>
      <rect x={lastX - tagWidth - 2} y={y(last.leads) - 30} width={tagWidth} height="20" rx="6" fill="#0F1E33"/><text x={lastX - 2 - tagWidth / 2} y={y(last.leads) - 16} textAnchor="middle" style={{ fill: "#fff", fontWeight: 700 }}>{formatInt(last.leads)} {unit}</text>
    </g>}
  </svg>;
}

/** Region total per month (k USD); months still to be entered are drawn as dashed orange outlines. */
export function MonthBars({ months, missing, label }: { months: number[]; missing: number[]; label: string }) {
  const width = 360, height = 150, top = 14, bottom = 20, gap = 5;
  const max = Math.max(1, ...months);
  const barWidth = (width - gap * 11) / 12, gaps = new Set(missing);
  return <svg className="bk-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    <line x1="0" x2={width} y1={height - bottom} y2={height - bottom} stroke="var(--k-bd-e3e9f2, #E3E9F2)"/>
    {months.map((value, index) => {
      const h = value > 0 ? Math.max(3, ((height - top - bottom) * value) / max) : 0, x = index * (barWidth + gap);
      return <g key={index}>
        {gaps.has(index + 1) ? <rect x={x + 1} y={height - bottom - 18} width={barWidth - 2} height="17" rx="3" fill="none" stroke="#E07A2E" strokeDasharray="3 2"><title>{`${MONTHS_LONG[index]}: kiritilmagan`}</title></rect>
          : <rect x={x} y={height - bottom - h} width={barWidth} height={h} rx="3" fill={value === max ? "var(--chart-bar, #123E7C)" : "var(--chart-soft, #8DB0E4)"}><title>{`${MONTHS_LONG[index]}: ${formatUsd(value)}`}</title></rect>}
        <text x={x + barWidth / 2} y={height - 5} textAnchor="middle">{MONTHS_LONG[index].slice(0, 1)}</text>
      </g>;
    })}
  </svg>;
}

/** Monthly sales bars of one year with the month's plan as a black tick; the current month is light (still running). */
export function PlanBars({ sales, plans, current, label }: { sales: number[]; plans: number[]; current: number; label: string }) {
  // top leaves a band for the tooltip (hover or tap = focus; tapping elsewhere blurs it).
  const width = 420, height = 200, top = 34, bottom = 20, gap = 6, inner = height - top - bottom;
  const monthLabel = (index: number) => MONTHS_SHORT[index][0].toUpperCase() + MONTHS_SHORT[index].slice(1);
  const max = Math.max(1, ...sales, ...plans), barWidth = (width - gap * 11) / 12, best = sales.indexOf(Math.max(...sales));
  const y = (value: number) => height - bottom - (inner * value) / max;
  return <svg className="bk-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    <line x1="0" x2={width} y1={height - bottom} y2={height - bottom} stroke="var(--k-bd-e3e9f2, #E3E9F2)"/>
    {sales.map((value, index) => {
      const x = index * (barWidth + gap), plan = plans[index], peak = Math.min(y(value), plan ? y(plan) : Infinity);
      const tip = `${monthLabel(index)}: ${formatUsd(value)}${plan ? ` · reja ${formatUsd(plan)} · ${formatInt((value / plan) * 100)}%` : ""}`, tipWidth = tip.length * 6.2 + 12;
      const tipX = Math.min(width - tipWidth, Math.max(0, x + barWidth / 2 - tipWidth / 2));
      return <g key={index} className="bk-bar" tabIndex={0} aria-label={tip}>
        <rect x={x - gap / 2} y={top} width={barWidth + gap} height={inner} fill="transparent"/>
        <rect x={x} y={y(value)} width={barWidth} height={height - bottom - y(value)} rx="3" fill={index + 1 === current ? "var(--chart-soft, #8DB0E4)" : "var(--chart-bar, #123E7C)"}/>
        {plan > 0 && <line x1={x - 2} x2={x + barWidth + 2} y1={y(plan)} y2={y(plan)} stroke="var(--chart-ink, #0F1E33)" strokeWidth="2.5"/>}
        {value > 0 && (index === best || index + 1 === current) && <text x={x + barWidth / 2} y={peak - 5} textAnchor="middle" style={{ fill: "var(--bk-text)", fontWeight: 700 }}>{formatUsdK(value)}</text>}
        <text x={x + barWidth / 2} y={height - 5} textAnchor="middle">{monthLabel(index)}</text>
        <g className="bk-bar-tip"><rect x={tipX} y="0" width={tipWidth} height="20" rx="5" fill="#0F1E33"/><text x={tipX + 6} y="14" style={{ fill: "#fff", fontWeight: 600 }}>{tip}</text></g>
      </g>;
    })}
  </svg>;
}

// Categorical series colors (validated: CVD ΔE ≥ 13, contrast ≥ 3:1 on white).
export const SERIES_COLORS = ["#2F5FAF", "#D06A1E", "#1F9E89", "#8E5BD0", "#B8860B"];
function niceStep(value: number) { const power = 10 ** Math.floor(Math.log10(Math.max(1, value))); const unit = value / power; return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power; }

/** Day-by-day lines for a few series (counts), one y-axis, legend underneath; x labels thinned to ~8. */
export function DailyLines({ days, series, label, dayLabel }: { days: string[]; series: Array<{ name: string; values: number[] }>; label: string; dayLabel: (day: string) => string }) {
  const width = 640, height = 220, left = 40, right = 12, top = 12, bottom = 24;
  const count = Math.max(1, days.length);
  const max = Math.max(1, ...series.flatMap(item => item.values));
  const step = niceStep(max / 3), scaleMax = step * 3;
  const x = (index: number) => count === 1 ? (left + width - right) / 2 : left + (index * (width - left - right)) / (count - 1);
  const y = (value: number) => top + (height - top - bottom) * (1 - value / scaleMax);
  const every = Math.max(1, Math.ceil(count / 8));
  return <figure style={{ margin: 0 }}>
    <svg className="bk-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {[0, 1, 2, 3].map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick * step)} y2={y(tick * step)} stroke="var(--k-bd-e3e9f2, #E3E9F2)"/><text x={left - 8} y={y(tick * step) + 4} textAnchor="end">{formatInt(tick * step)}</text></g>)}
      {days.map((day, index) => index % every === 0 || index === count - 1 ? <text key={day} x={x(index)} y={height - 6} textAnchor="middle">{dayLabel(day)}</text> : null)}
      {series.map((item, index) => <g key={item.name}>
        <path d={item.values.map((value, day) => `${day ? "L" : "M"}${x(day).toFixed(1)} ${y(value).toFixed(1)}`).join("")} fill="none" stroke={SERIES_COLORS[index]} strokeWidth="2" strokeLinejoin="round"/>
        {count <= 31 && item.values.map((value, day) => <circle key={day} cx={x(day)} cy={y(value)} r="3" fill="var(--k-bg-ffffff, #fff)" stroke={SERIES_COLORS[index]} strokeWidth="1.5"><title>{`${item.name}, ${dayLabel(days[day])}: ${formatInt(value)}`}</title></circle>)}
      </g>)}
    </svg>
    <figcaption className="bk-legend" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}>{series.map((item, index) => <span key={item.name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: SERIES_COLORS[index], display: "inline-block" }}/>{item.name}</span>)}</figcaption>
  </figure>;
}
