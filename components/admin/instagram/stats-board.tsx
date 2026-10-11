// Instagram → "Statistika" tab (server-rendered; the map paths are pre-projected in lib/instagram/world-map.json).
import type { CSSProperties } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { DailyLines } from "@/components/admin/bklead/charts";
import { KIND_LABELS } from "@/lib/instagram/constants";
import { AGE_ORDER, GENDER_LABELS, MAP_COUNTRIES, PERIODS, PERIOD_LABELS, TYPE_LABELS, WEEKDAYS, cityName, formatDayUz, formatDurationMs, formatNumber, shares, type Period } from "@/lib/instagram/insights-rules";
import type { StatsBoard as Board } from "@/lib/instagram/stats-queries";
import worldMap from "@/lib/instagram/world-map.json";
import { AudienceMode, RefreshButton, TopPosts } from "./stats-client";

const SHADES = ["#DCE6F5", "#A9C1E8", "#6F97D6", "#2F5FAF", "#173A78"];
const NONE = "#EEF2F8";
const shade = (percent: number, max: number) => !percent || !max ? NONE : SHADES[Math.min(SHADES.length - 1, Math.ceil((percent / max) * SHADES.length) - 1)];
const pct = (value: number | null) => value === null ? "" : `${value > 0 ? "+" : ""}${formatNumber(value, 1)}%`;
const DEMO_NOTE = "Instagram oxirgi 30 kun bo‘yicha beradi; kichik guruhlar yashiriladi (eng ko‘pi 45 ta).";

function Kpis({ board }: { board: Board }) {
  return <div className="ig-kpis">{board.kpis.map(item => <div key={item.key} className="bk-card ig-kpi">
    <span className="bk-muted">{item.label}</span>
    <strong>{item.key === "er" ? (item.value === null ? "—" : `${formatNumber(item.value, 1)}%`) : formatNumber(item.value)}</strong>
    <small className={item.change === null ? "bk-muted" : item.change >= 0 ? "ig-up" : "ig-down"}>{item.change === null ? (item.extra ?? "oldingi davr yo‘q") : `${pct(item.change)} oldingi davrga`}{item.change !== null && item.extra ? ` · ${item.extra}` : ""}</small>
  </div>)}</div>;
}

function Funnel({ steps }: { steps: Board["funnel"] }) {
  const max = Math.max(1, ...steps.map(step => step.value ?? 0));
  return <section className="bk-card" aria-labelledby="ig-funnel"><h2 id="ig-funnel">Voronka</h2>
    <ol className="ig-funnel">{steps.map(step => <li key={step.key}>
      <span>{step.label}</span>
      <span className="ig-funnel-bar"><i style={{ width: `${step.value === null ? 0 : Math.max(2, (step.value / max) * 100)}%` }}/></span>
      <strong>{step.value === null ? "ma’lumot yo‘q" : formatNumber(step.value)}</strong>
      <small className="bk-muted">{step.conversion === null ? (step.note && step.value !== null ? step.note : "") : `${formatNumber(step.conversion, 1)}%${step.note ? ` · ${step.note}` : ""}`}</small>
    </li>)}</ol>
  </section>;
}

function CountryMap({ board }: { board: Board }) {
  const follower = shares(board.audience?.follower.country ?? {}), engaged = shares(board.audience?.engaged.country ?? {});
  const value = (data: typeof follower, code: string) => data.rows.find(row => row.key === code) ?? { key: code, value: 0, percent: 0 };
  const maxF = Math.max(0, ...MAP_COUNTRIES.map(code => value(follower, code).percent)), maxE = Math.max(0, ...MAP_COUNTRIES.map(code => value(engaged, code).percent));
  const bars = (data: typeof follower, max: number, mode: "f" | "e") => <ul className={`ig-bars only-${mode}`}>{MAP_COUNTRIES.map(code => value(data, code)).sort((a, b) => b.percent - a.percent).map(row => <li key={row.key}><span>{worldMap.countries.find(country => country.code === row.key)?.name ?? row.key}</span><span className="ig-funnel-bar"><i style={{ width: `${max ? (row.percent / max) * 100 : 0}%`, background: shade(row.percent, max) }}/></span><strong>{formatNumber(row.percent, 1)}%</strong></li>)}</ul>;
  return <section className="bk-card" aria-labelledby="ig-geo-title">
    <div className="bk-card-head"><div><h2 id="ig-geo-title">Davlatlar</h2><p className="bk-muted">{DEMO_NOTE}</p></div></div>
    {!board.audience ? <div className="bk-empty">Demografiya hali yo‘q (100 dan kam obunachi yoki reaksiya bo‘lsa Instagram bermaydi)</div> : <AudienceMode>
      <div className="ig-geo-grid">
        <svg className="ig-map" viewBox={`0 0 ${worldMap.width} ${worldMap.height}`} role="img" aria-label="Davlatlar xaritasi">
          <rect width={worldMap.width} height={worldMap.height} fill="#F7F9FC"/>
          {worldMap.neighbours.map(country => <path key={country.code} d={country.d} fill="#E3E8EF" stroke="#fff" strokeWidth="0.8"><title>{country.name}</title></path>)}
          {worldMap.countries.map(country => {
            const f = value(follower, country.code), e = value(engaged, country.code);
            return <path key={country.code} className="ig-country" d={country.d} stroke="#fff" strokeWidth="1" style={{ "--f": shade(f.percent, maxF), "--e": shade(e.percent, maxE) } as CSSProperties}>
              <title>{`${country.name} — obunachilar: ~${formatNumber(f.value)} (${formatNumber(f.percent, 1)}%), reaksiya: ~${formatNumber(e.value)} (${formatNumber(e.percent, 1)}%)`}</title>
            </path>;
          })}
          {worldMap.countries.map(country => country.label && <g key={country.code} className="ig-map-label" transform={`translate(${country.label[0]} ${country.label[1]})`}>
            <text y={-2}>{country.name}</text>
            <text y={11} className="only-f">{formatNumber(value(follower, country.code).percent, 1)}%</text>
            <text y={11} className="only-e">{formatNumber(value(engaged, country.code).percent, 1)}%</text>
          </g>)}
        </svg>
        <div>{bars(follower, maxF, "f")}{bars(engaged, maxE, "e")}<p className="bk-muted" style={{ fontSize: 11 }}>{worldMap.source}</p></div>
      </div>
    </AudienceMode>}
  </section>;
}

function Demographics({ board }: { board: Board }) {
  if (!board.audience) return null;
  const parts = (mode: "f" | "e") => {
    const data = mode === "f" ? board.audience!.follower : board.audience!.engaged;
    const cities = shares(data.city ?? {}).rows.slice(0, 10), gender = shares(data.gender ?? {}), age = shares(data.age ?? {}, AGE_ORDER.filter(key => key in (data.age ?? {})));
    const maxAge = Math.max(1, ...age.rows.map(row => row.percent));
    let offset = 0;
    const ring = gender.rows.filter(row => row.percent > 0).map((row, index) => { const piece = { ...row, offset, color: ["#2F5FAF", "#D06A1E", "#9AA8BC"][index % 3] }; offset += row.percent; return piece; });
    return <div className={`ig-demo only-${mode}`}>
      <section className="bk-card"><h3>Top shaharlar</h3>{cities.length ? <ol className="ig-bars">{cities.map(row => <li key={row.key}><span>{cityName(row.key)}</span><span className="ig-funnel-bar"><i style={{ width: `${(row.percent / Math.max(1, cities[0].percent)) * 100}%` }}/></span><strong>{formatNumber(row.percent, 1)}%</strong></li>)}</ol> : <p className="bk-muted">Ma’lumot yo‘q</p>}</section>
      <section className="bk-card"><h3>Jins</h3>{ring.length ? <div className="ig-donut"><svg viewBox="0 0 42 42" role="img" aria-label="Jins">{ring.map(row => <circle key={row.key} cx="21" cy="21" r="15.9" fill="none" stroke={row.color} strokeWidth="6" strokeDasharray={`${row.percent} ${100 - row.percent}`} strokeDashoffset={25 - row.offset}/>)}</svg><ul>{ring.map(row => <li key={row.key}><i style={{ background: row.color }}/>{GENDER_LABELS[row.key] ?? row.key} — {formatNumber(row.percent, 1)}%</li>)}</ul></div> : <p className="bk-muted">Ma’lumot yo‘q</p>}</section>
      <section className="bk-card"><h3>Yosh</h3>{age.rows.length ? <div className="ig-ages">{AGE_ORDER.filter(key => age.rows.some(row => row.key === key)).map(key => { const row = age.rows.find(item => item.key === key)!; return <div key={key}><span style={{ height: `${(row.percent / maxAge) * 100}%` }} title={`${key}: ~${formatNumber(row.value)}`}/><b>{formatNumber(row.percent, 0)}%</b><small>{key}</small></div>; })}</div> : <p className="bk-muted">Ma’lumot yo‘q</p>}</section>
    </div>;
  };
  return <section aria-label="Demografiya"><p className="bk-muted" style={{ margin: "0 0 8px" }}>{DEMO_NOTE}</p><AudienceMode>{parts("f")}{parts("e")}</AudienceMode></section>;
}

function Heatmap({ heat }: { heat: Board["heatmap"] }) {
  return <section className="bk-card" aria-labelledby="ig-heat">
    <div className="bk-card-head"><div><h2 id="ig-heat">Joylash uchun eng yaxshi vaqt</h2><p className="bk-muted">Instagram’ning “online_followers” metrikasi hozirgi hujjatda yo‘q — bu jadval oxirgi 90 kundagi kommentlar va Direct xabarlar vaqtidan hisoblangan (Toshkent vaqti).{heat.best ? ` Eng faol: ${WEEKDAYS[heat.best.day]} ${String(heat.best.hour).padStart(2, "0")}:00.` : ""}</p></div></div>
    {heat.max ? <div className="bk-table-wrap"><table className="ig-heat"><thead><tr><th/>{Array.from({ length: 24 }, (_, hour) => <th key={hour}>{hour % 3 === 0 ? hour : ""}</th>)}</tr></thead><tbody>{heat.grid.map((row, day) => <tr key={day}><th>{WEEKDAYS[day]}</th>{row.map((value, hour) => <td key={hour} title={`${WEEKDAYS[day]} ${hour}:00 — ${value}`} style={{ background: value ? SHADES[Math.min(4, Math.ceil((value / heat.max) * 5) - 1)] : NONE }}/>)}</tr>)}</tbody></table></div> : <div className="bk-empty">Hali komment / Direct yo‘q</div>}
  </section>;
}

export function StatsBoard({ board }: { board: Board }) {
  const period = board.period;
  const header = <div className="ig-stats-head">
    <nav className="bk-chips" aria-label="Davr">{(Object.keys(PERIODS) as Period[]).map(key => <Link key={key} className={`bk-chip${key === period ? " is-active" : ""}`} href={`/admin/instagram?tab=stats&period=${key}`}>{PERIOD_LABELS[key]}</Link>)}</nav>
    <div className="bk-actions"><RefreshButton/><a className="bk-btn" href={`/admin/instagram/stats/export?period=${period}`}><Download size={14}/>Excel yuklab olish</a></div>
  </div>;
  const status = <p className="bk-muted" style={{ margin: 0 }}>{formatDayUz(board.range.from)} — {formatDayUz(board.range.to)}{board.status.fetchedAt ? ` · yangilangan: ${formatDayUz(board.status.fetchedAt.slice(0, 10))}` : ""}{board.status.error ? ` · oxirgi xato: ${board.status.error}` : ""}</p>;
  if (!board.status.connected) return <div className="bk-empty"><strong>Instagram ulanmagan</strong><span>Sozlamalar → Instagram</span></div>;
  return <div className="ig ig-stats">
    {header}
    {board.status.reconnect && <p className="ig-warn" role="alert">Statistika uchun qayta ulash kerak: Sozlamalar → Instagram → “Qayta ulash” (instagram_business_manage_insights ruxsati).</p>}
    {status}
    {!board.status.hasData ? <div className="bk-empty"><strong>Statistika hali yo‘q</strong><span>Birinchi yangilanish ertaga 06:00 da. Hozir olish uchun:</span><RefreshButton/></div> : <>
      <Kpis board={board}/>
      <div className="bk-grid-main">
        <Funnel steps={board.funnel}/>
        <section className="bk-card" aria-labelledby="ig-kinds-title"><h2 id="ig-kinds-title">Kommentlar turi</h2>
          <ul className="ig-bars">{(Object.keys(board.kinds) as Array<keyof Board["kinds"]>).map(key => <li key={key}><span>{KIND_LABELS[key]}</span><span className="ig-funnel-bar"><i style={{ width: `${(board.kinds[key] / Math.max(1, ...Object.values(board.kinds))) * 100}%` }}/></span><strong>{formatNumber(board.kinds[key])}</strong></li>)}</ul>
          <p className="bk-muted">Direct: o‘rtacha javob {board.direct.avgResponseMs === null ? "—" : formatDurationMs(board.direct.avgResponseMs).replace(/ 0 s$/, "")} · javob berilgan {formatNumber(board.direct.answered)} · hozir javobsiz {formatNumber(board.direct.waiting)}</p>
        </section>
      </div>
      <section className="bk-card" aria-labelledby="ig-daily"><h2 id="ig-daily">Kunlik</h2>
        <DailyLines label="Like, kommentlar va Direct kunma-kun" days={board.daily.map(row => row.day)} dayLabel={day => formatDayUz(day, true)} series={[{ name: "Like", values: board.daily.map(row => row.likes) }, { name: "Kommentlar", values: board.daily.map(row => row.comments) }, { name: "Direct", values: board.daily.map(row => row.direct) }]}/>
      </section>
      <CountryMap board={board}/>
      <Demographics board={board}/>
      <Heatmap heat={board.heatmap}/>
      <div className="bk-grid-main">
        <section className="bk-card" aria-labelledby="ig-types"><h2 id="ig-types">Kontent turi</h2>
          <div className="bk-table-wrap"><table className="bk-table"><thead><tr><th>Tur</th><th>Soni</th><th>O‘rt. qamrov</th><th>ER</th><th>Lidlar</th></tr></thead><tbody>{board.types.map(row => <tr key={row.type}><td>{TYPE_LABELS[row.type]}</td><td>{formatNumber(row.count)}</td><td>{formatNumber(row.avgReach)}</td><td>{row.er === null ? "—" : `${formatNumber(row.er, 1)}%`}</td><td>{formatNumber(row.leads)}</td></tr>)}</tbody></table></div>
        </section>
        <section className="bk-card" aria-labelledby="ig-profile"><h2 id="ig-profile">Profil harakatlari</h2>
          <dl className="ig-facts">
            <div><dt>Saytga bosish</dt><dd>{formatNumber(board.profile.website)}</dd></div>
            <div><dt>Qo‘ng‘iroq</dt><dd>{formatNumber(board.profile.call)}</dd></div>
            <div><dt>Manzil</dt><dd>{formatNumber(board.profile.direction)}</dd></div>
            <div><dt>Yangi obunachi</dt><dd>{formatNumber(board.profile.follows)}</dd></div>
            <div><dt>Chiqib ketgan</dt><dd>{formatNumber(board.profile.unfollows)}</dd></div>
            <div><dt>Sof o‘sish</dt><dd>{board.profile.net === null ? "—" : `${board.profile.net >= 0 ? "+" : ""}${formatNumber(board.profile.net)}`}</dd></div>
          </dl>
          <p className="bk-muted" style={{ fontSize: 12 }}>Saytga bosish — postlardagi “profile_activity” (BIO_LINK_CLICKED); qo‘ng‘iroq / manzil — profil tugmalari va postlar.</p>
        </section>
      </div>
      <section className="bk-card" aria-labelledby="ig-top"><h2 id="ig-top">Top postlar</h2><TopPosts posts={board.posts}/></section>
    </>}
  </div>;
}

/** Skeleton while the period's data loads. */
export function StatsSkeleton() {
  return <div className="ig ig-stats" aria-busy="true" aria-label="Yuklanmoqda">
    <div className="ig-kpis">{Array.from({ length: 8 }, (_, index) => <div key={index} className="bk-card ig-kpi ig-skeleton"/>)}</div>
    <div className="bk-grid-main"><div className="bk-card ig-skeleton" style={{ height: 260 }}/><div className="bk-card ig-skeleton" style={{ height: 260 }}/></div>
    <div className="bk-card ig-skeleton" style={{ height: 240 }}/>
    <div className="bk-card ig-skeleton" style={{ height: 380 }}/>
  </div>;
}
