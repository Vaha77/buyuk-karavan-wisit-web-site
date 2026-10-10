import { formatInt, formatUsd, formatUsdK, MONTHS_LONG } from "@/lib/dashboard/format";

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
        <rect x={x} y={height - bottom - h} width={barWidth} height={h} rx="3" fill={peaks.has(day.day) ? "#123E7C" : day.clicks ? "#8DB0E4" : "#E6EBF2"}><title>{`${day.day}: ${formatInt(day.clicks)} klik`}</title></rect>
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
    {[0, 1, 2, 3].map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick * step)} y2={y(tick * step)} stroke="#E3E9F2"/><text x={left - 8} y={y(tick * step) + 4} textAnchor="end">{tick * step}</text></g>)}
    <path d={`${line("leads")}L${lastX.toFixed(1)} ${y(0)}L${x(0)} ${y(0)}Z`} fill="#123E7C" opacity=".06"/>
    <path d={line("leads")} fill="none" stroke="#123E7C" strokeWidth="2.2" strokeLinejoin="round"/>
    <path d={line("calculations")} fill="none" stroke="#E07A2E" strokeWidth="2" strokeLinejoin="round"/>
    {weeks.map((week, index) => index % 2 === 0 && <text key={week.label} x={x(index)} y={height - 6} textAnchor="middle">{week.label}</text>)}
    {last && <g>
      <circle cx={lastX} cy={y(last.leads)} r="4.5" fill="#fff" stroke="#123E7C" strokeWidth="2"/><circle cx={lastX} cy={y(last.calculations)} r="4" fill="#fff" stroke="#E07A2E" strokeWidth="2"/>
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
    <line x1="0" x2={width} y1={height - bottom} y2={height - bottom} stroke="#E3E9F2"/>
    {months.map((value, index) => {
      const h = value > 0 ? Math.max(3, ((height - top - bottom) * value) / max) : 0, x = index * (barWidth + gap);
      return <g key={index}>
        {gaps.has(index + 1) ? <rect x={x + 1} y={height - bottom - 18} width={barWidth - 2} height="17" rx="3" fill="none" stroke="#E07A2E" strokeDasharray="3 2"><title>{`${MONTHS_LONG[index]}: kiritilmagan`}</title></rect>
          : <rect x={x} y={height - bottom - h} width={barWidth} height={h} rx="3" fill={value === max ? "#123E7C" : "#8DB0E4"}><title>{`${MONTHS_LONG[index]}: ${formatUsd(value)}`}</title></rect>}
        <text x={x + barWidth / 2} y={height - 5} textAnchor="middle">{MONTHS_LONG[index].slice(0, 1)}</text>
      </g>;
    })}
  </svg>;
}

// Categorical order for the top-5 regions (validated: CVD ΔE ≥ 13, contrast ≥ 3:1 on white).
export const SERIES_COLORS = ["#2F5FAF", "#D06A1E", "#1F9E89", "#8E5BD0", "#B8860B"];

/** Month-by-month lines for up to five regions, one y-axis in k USD, legend plus a label at each line's end. */
export function RegionLines({ series, lastMonth, label }: { series: Array<{ name: string; months: number[] }>; lastMonth: number; label: string }) {
  const width = 640, height = 240, left = 40, right = 110, top = 16, bottom = 24;
  const count = Math.max(1, lastMonth);
  const max = Math.max(1, ...series.flatMap(item => item.months.slice(0, count)));
  const step = niceStep(max / 3), scaleMax = step * 3;
  const x = (index: number) => left + (index * (width - left - right)) / Math.max(1, count - 1);
  const y = (value: number) => top + (height - top - bottom) * (1 - value / scaleMax);
  // End labels sorted by position and nudged apart so they never overlap.
  const ends = series.map((item, index) => ({ index, y: y(item.months[count - 1] ?? 0) })).sort((a, b) => a.y - b.y);
  for (let index = 1; index < ends.length; index++) ends[index].y = Math.max(ends[index].y, ends[index - 1].y + 14);
  return <svg className="bk-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    {[0, 1, 2, 3].map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick * step)} y2={y(tick * step)} stroke="#E3E9F2"/><text x={left - 8} y={y(tick * step) + 4} textAnchor="end">{formatUsdK(tick * step)}</text></g>)}
    {Array.from({ length: count }, (_, index) => <text key={index} x={x(index)} y={height - 6} textAnchor="middle">{MONTHS_LONG[index].slice(0, 3)}</text>)}
    {series.map((item, index) => <g key={item.name}>
      <path d={item.months.slice(0, count).map((value, month) => `${month ? "L" : "M"}${x(month).toFixed(1)} ${y(value).toFixed(1)}`).join("")} fill="none" stroke={SERIES_COLORS[index]} strokeWidth="2" strokeLinejoin="round"/>
      {item.months.slice(0, count).map((value, month) => <circle key={month} cx={x(month)} cy={y(value)} r="4" fill="#fff" stroke={SERIES_COLORS[index]} strokeWidth="2"><title>{`${item.name}, ${MONTHS_LONG[month]}: ${formatUsd(value)}`}</title></circle>)}
    </g>)}
    {ends.map(end => <text key={end.index} x={x(count - 1) + 10} y={end.y + 4} style={{ fill: "#0F1E33", fontWeight: 600 }}>{series[end.index].name}</text>)}
  </svg>;
}
function niceStep(value: number) { const power = 10 ** Math.floor(Math.log10(Math.max(1, value))); const unit = value / power; return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power; }
