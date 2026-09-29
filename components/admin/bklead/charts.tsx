import { formatInt } from "@/lib/dashboard/format";

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

/** Weekly two-series line chart (Lidlar navy, Hisob-kitoblar orange) with a label on the last lead point. */
export function WeeklyLines({ weeks, label }: { weeks: Array<{ label: string; leads: number; calculations: number }>; label: string }) {
  const width = 640, height = 230, left = 30, right = 16, top = 26, bottom = 26;
  const max = Math.max(4, ...weeks.flatMap(week => [week.leads, week.calculations]));
  const step = Math.ceil(max / 3), scaleMax = step * 3;
  const x = (index: number) => left + (index * (width - left - right)) / Math.max(1, weeks.length - 1);
  const y = (value: number) => top + (height - top - bottom) * (1 - value / scaleMax);
  const line = (key: "leads" | "calculations") => weeks.map((week, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(week[key]).toFixed(1)}`).join("");
  const last = weeks.at(-1), lastX = x(weeks.length - 1);
  return <svg className="bk-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    {[0, 1, 2, 3].map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick * step)} y2={y(tick * step)} stroke="#E3E9F2"/><text x={left - 8} y={y(tick * step) + 4} textAnchor="end">{tick * step}</text></g>)}
    <path d={`${line("leads")}L${lastX.toFixed(1)} ${y(0)}L${x(0)} ${y(0)}Z`} fill="#123E7C" opacity=".06"/>
    <path d={line("leads")} fill="none" stroke="#123E7C" strokeWidth="2.2" strokeLinejoin="round"/>
    <path d={line("calculations")} fill="none" stroke="#E07A2E" strokeWidth="2" strokeLinejoin="round"/>
    {weeks.map((week, index) => index % 2 === 0 && <text key={week.label} x={x(index)} y={height - 6} textAnchor="middle">{week.label}</text>)}
    {last && <g>
      <circle cx={lastX} cy={y(last.leads)} r="4.5" fill="#fff" stroke="#123E7C" strokeWidth="2"/><circle cx={lastX} cy={y(last.calculations)} r="4" fill="#fff" stroke="#E07A2E" strokeWidth="2"/>
      <rect x={lastX - 58} y={y(last.leads) - 30} width="56" height="20" rx="6" fill="#0F1E33"/><text x={lastX - 30} y={y(last.leads) - 16} textAnchor="middle" style={{ fill: "#fff", fontWeight: 700 }}>{formatInt(last.leads)} lid</text>
    </g>}
  </svg>;
}
