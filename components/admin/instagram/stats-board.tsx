// Instagram → "Statistika" tab (server-rendered; the map paths are pre-projected in lib/instagram/world-map.json).
// Layout and colours follow docs/design/instagram/instagram-statistika.dc.html (#1E4E8C primary, #E8792B accent).
import type { CSSProperties } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { AGE_ORDER, GENDER_LABELS, MAP_COUNTRIES, PERIOD_LABELS, TYPE_LABELS, WEEKDAYS, cityName, formatDayUz, formatDurationMs, formatNumber, shares, type Period } from "@/lib/instagram/insights-rules";
import type { StatsBoard as Board } from "@/lib/instagram/stats-queries";
import worldMap from "@/lib/instagram/world-map.json";
import { withAccount } from "@/lib/instagram/constants";
import { AudienceMode, AudienceToggle, RefreshButton, TopPosts } from "./stats-client";

const NAVY = "#1E4E8C", ORANGE = "#E8792B", SKY = "#7FA4D6", GREY = "#9AA8BC", NONE = "#EEF2F8";
const DEMO_NOTE = "Instagram oxirgi 30 kun bo‘yicha beradi · kichik guruhlar yashiriladi";
const signed = (value: number) => `${value > 0 ? "+" : ""}${formatNumber(value)}`;
/** Dark-blue scale: 12 % … 100 % of #1E4E8C by the square root of the share (small countries stay visible). */
const alpha = (percent: number, max: number) => !percent || !max ? 0 : 0.12 + 0.88 * Math.sqrt(percent / max);
const fill = (a: number) => a ? `rgba(30,78,140,${a.toFixed(2)})` : NONE;
const tashkentTime = (iso: string) => new Intl.DateTimeFormat("uz-UZ", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tashkent" }).format(new Date(iso));

function Kpis({ board }: { board: Board }) {
  return <div className="igs-kpis">{board.kpis.map(item => {
    let delta: string | null = null, up = true, hint = item.extra ?? "oldingi davr yo‘q";
    if (item.key === "followers") { if (board.profile.net !== null) { delta = signed(board.profile.net); up = board.profile.net >= 0; } hint = "davr ichida"; }
    else if (item.key === "er") { if (item.value !== null && item.previous !== null) { const diff = Math.round((item.value - item.previous) * 10) / 10; delta = `${diff > 0 ? "+" : ""}${formatNumber(diff, 1)} p.p.`; up = diff >= 0; } hint = "reaksiya / qamrov"; }
    else if (item.change !== null) { delta = `${item.change > 0 ? "+" : ""}${formatNumber(item.change, 1)}%`; up = item.change >= 0; hint = item.extra ? `oldingi davrga · ${item.extra}` : "oldingi davrga"; }
    return <div key={item.key} className="igs-kpi">
      <span className="igs-label">{item.label}</span>
      <strong>{item.key === "er" ? (item.value === null ? "—" : `${formatNumber(item.value, 1)}%`) : formatNumber(item.value)}</strong>
      <span className="igs-kpi-foot">{delta && <span className={`igs-pill ${up ? "is-up" : "is-down"}`}>{delta}</span>}<span>{hint}</span></span>
    </div>;
  })}</div>;
}

function Funnel({ steps }: { steps: Board["funnel"] }) {
  const base = steps[0]?.value ?? 0;
  return <section className="igs-card" aria-labelledby="igs-funnel">
    <div className="igs-card-head"><h2 id="igs-funnel">Instagram → sotuv voronkasi</h2><span className="igs-sub">Ko‘rishdan pulgacha: har bosqichda qancha odam qoldi</span></div>
    <ol className="igs-funnel">{steps.map((step, index) => {
      const last = index === steps.length - 1;
      const height = step.value === null || !base ? 0 : Math.max(6, Math.round(Math.pow(Math.min(1, step.value / base), 0.22) * 100));
      const conv = index === 0 ? "boshlang‘ich" : step.conversion === null ? (step.value === null ? "ma’lumot yo‘q" : step.note ?? "") : `${last && step.note ? `${step.note} · ` : ""}${formatNumber(step.conversion, 1)}% oldingidan`;
      return <li key={step.key}>
        <span className="igs-funnel-track"><i style={{ height: `${height}%`, background: last ? ORANGE : NAVY, opacity: Math.max(0.4, 1 - index * 0.1) }}/></span>
        <strong>{step.value === null ? "—" : formatNumber(step.value)}</strong>
        <b>{step.label}</b>
        <small>{conv}</small>
      </li>;
    })}</ol>
  </section>;
}

/** Likes, comments (Instagram) and Direct messages per day; likes are shown ÷10 when they would flatten the rest. */
function DailyChart({ daily }: { daily: Board["daily"] }) {
  const others = Math.max(0, ...daily.map(row => Math.max(row.comments, row.direct)));
  const likeMax = Math.max(0, ...daily.map(row => row.likes));
  const likeScale = others > 0 && likeMax > others * 3 ? 10 : 1;
  const top = Math.max(4, Math.ceil(Math.max(likeMax / likeScale, others) / 4) * 4);
  const x = (index: number) => daily.length < 2 ? 520 : 40 + (960 * index) / (daily.length - 1), y = (value: number) => 250 - (value / top) * 230;
  const series = [
    { key: "likes", label: likeScale > 1 ? "Like (÷10)" : "Like", color: NAVY, values: daily.map(row => row.likes / likeScale), dash: undefined },
    { key: "comments", label: "Kommentlar", color: ORANGE, values: daily.map(row => row.comments), dash: undefined },
    { key: "direct", label: "Direct xabarlar", color: SKY, values: daily.map(row => row.direct), dash: "8 6" },
  ];
  return <section className="igs-card igs-grow" aria-labelledby="igs-daily">
    <div className="igs-card-head"><h2 id="igs-daily">Kunlik faollik</h2>
      <div className="igs-legend">{series.map(item => <span key={item.key}><i style={{ background: item.color }}/>{item.label}</span>)}</div>
    </div>
    <svg className="igs-chart" viewBox="0 0 1000 280" role="img" aria-label={`Kunlik like, komment va Direct xabarlar: ${daily.map(row => `${formatDayUz(row.day, true)} — ${row.likes} like, ${row.comments} komment, ${row.direct} Direct`).join("; ")}`}>
      {[20, 135].map(line => <line key={line} x1="40" y1={line} x2="1000" y2={line} stroke="var(--k-bd-e6ecf5, #E6ECF5)"/>)}
      <line x1="40" y1="250" x2="1000" y2="250" stroke="var(--k-bd-c9d5e6, #C9D5E6)"/>
      <text x="0" y="24">{formatNumber(top)}</text><text x="0" y="139">{formatNumber(top / 2)}</text><text x="0" y="254">0</text>
      {series.map(item => daily.length > 1
        ? <polyline key={item.key} points={item.values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ")} fill="none" stroke={item.color} strokeWidth="3" strokeDasharray={item.dash} strokeLinejoin="round" strokeLinecap="round"/>
        : <circle key={item.key} cx={x(0)} cy={y(item.values[0] ?? 0)} r="6" fill={item.color}/>)}
      {daily.map((row, index) => <rect key={row.day} x={x(index) - 480 / Math.max(1, daily.length)} y="10" width={960 / Math.max(1, daily.length)} height="240" fill="transparent"><title>{`${formatDayUz(row.day)}: like ${formatNumber(row.likes)} · komment ${formatNumber(row.comments)} · Direct ${formatNumber(row.direct)}`}</title></rect>)}
      <text x="40" y="274">{daily.length ? formatDayUz(daily[0].day, true) : ""}</text>
      <text x="1000" y="274" textAnchor="end">bugun</text>
    </svg>
  </section>;
}

const KIND_ROWS: Array<{ key: keyof Board["kinds"]; label: string; color: string }> = [
  { key: "PRICE", label: "Narx so‘raganlar", color: NAVY }, { key: "POSITIVE", label: "Ijobiy (zo‘r, qoyil)", color: SKY }, { key: "QUESTION", label: "Boshqa savollar", color: NAVY },
  { key: "NEGATIVE", label: "Salbiy → sizga yuborildi", color: ORANGE }, { key: "SPAM", label: "Spam", color: GREY },
];

function Kinds({ board }: { board: Board }) {
  const max = Math.max(1, ...Object.values(board.kinds));
  return <section className="igs-card igs-side" aria-labelledby="igs-kinds">
    <h2 id="igs-kinds">Kommentlar turi</h2>
    <span className="igs-sub">Avto-javob tizimi ishga tushgandan beri{board.kindsSince ? ` (${formatDayUz(board.kindsSince.slice(0, 10))} dan)` : ""}</span>
    {KIND_ROWS.map(row => <div key={row.key} className="igs-kind">
      <span><b>{row.label}</b><b>{formatNumber(board.kinds[row.key])}</b></span>
      <span className="igs-track"><i style={{ width: `${(board.kinds[row.key] / max) * 100}%`, background: row.color }}/></span>
    </div>)}
    <div className="igs-split">
      <div><span className="igs-label">Direct o‘rt. javob vaqti</span><strong>{board.direct.avgResponseMs === null ? "—" : formatDurationMs(board.direct.avgResponseMs).replace(/ 0 s$/, "")}</strong><small>{formatNumber(board.direct.answered)} ta javob</small></div>
      <div><span className="igs-label">Javobsiz qolgan</span><strong className={board.direct.waiting ? "is-bad" : undefined}>{formatNumber(board.direct.waiting)} ta</strong></div>
    </div>
  </section>;
}

type Shares = ReturnType<typeof shares>;
const shareOf = (data: Shares, code: string) => data.rows.find(row => row.key === code) ?? { key: code, value: 0, percent: 0 };
const nameOf = (code: string) => worldMap.countries.find(country => country.code === code)?.name ?? code;

/** One sentence from the real shares: where followers are many but reactions few, else the leading countries. */
function mapInsight(follower: Shares, engaged: Shares, mode: "f" | "e") {
  const rows = MAP_COUNTRIES.map(code => ({ code, f: shareOf(follower, code).percent, e: shareOf(engaged, code).percent }));
  const lead = [...rows].sort((a, b) => (mode === "f" ? b.f - a.f : b.e - a.e))[0];
  if (!lead || !(mode === "f" ? lead.f : lead.e)) return "Ma’lumot yo‘q";
  if (mode === "f") {
    const gap = rows.filter(row => row.code !== lead.code && row.f - row.e >= 1).sort((a, b) => (b.f - b.e) - (a.f - a.e))[0];
    return gap ? `${nameOf(gap.code)}dan obunachi ko‘p (${formatNumber(gap.f, 1)}%), lekin reaksiya kamroq (${formatNumber(gap.e, 1)}%).` : `Obunachilarning ko‘pi — ${nameOf(lead.code)} (${formatNumber(lead.f, 1)}%).`;
  }
  const next = rows.filter(row => row.code !== lead.code && row.e > 0).sort((a, b) => b.e - a.e).slice(0, 2);
  return `Eng faol auditoriya ${nameOf(lead.code)}da (${formatNumber(lead.e, 1)}%).${next.length ? ` Qo‘shni davlatlardan ${next.map(row => nameOf(row.code)).join(" va ")} faolroq.` : ""}`;
}

function CountryMap({ board }: { board: Board }) {
  const follower = shares(board.audience?.follower.country ?? {}), engaged = shares(board.audience?.engaged.country ?? {});
  const maxF = Math.max(0, ...MAP_COUNTRIES.map(code => shareOf(follower, code).percent)), maxE = Math.max(0, ...MAP_COUNTRIES.map(code => shareOf(engaged, code).percent));
  const rows = (data: Shares, max: number, mode: "f" | "e") => <div className={`igs-country-rows only-${mode}`}>
    <b>{mode === "f" ? "Obunachilar ulushi" : "Like, komment, ulashganlar ulushi"}</b>
    {MAP_COUNTRIES.map(code => shareOf(data, code)).sort((a, b) => b.percent - a.percent).map(row => <div key={row.key} className="igs-row">
      <span>{nameOf(row.key)}</span><span className="igs-track"><i style={{ width: `${max ? Math.max(2, (row.percent / max) * 100) : 0}%`, background: NAVY }}/></span><b>{formatNumber(row.percent, 1)}%</b>
    </div>)}
    <p className="igs-insight">{mapInsight(follower, engaged, mode)}</p>
  </div>;
  return <section className="igs-card" aria-labelledby="igs-geo">
    <div className="igs-card-head"><div><h2 id="igs-geo">Davlatlar bo‘yicha auditoriya</h2><span className="igs-sub">{DEMO_NOTE}</span></div>{board.audience && <AudienceToggle/>}</div>
    {!board.audience ? <div className="igs-empty">Demografiya hali yo‘q (100 dan kam obunachi yoki reaksiya bo‘lsa Instagram bermaydi)</div> : <div className="igs-geo-grid">
      <div className="igs-map-box">
        <svg className="igs-map" viewBox={`0 0 ${worldMap.width} ${worldMap.height}`} role="img" aria-label={`Xarita: ${MAP_COUNTRIES.map(code => `${nameOf(code)} — obunachilar ${formatNumber(shareOf(follower, code).percent, 1)}%, reaksiya ${formatNumber(shareOf(engaged, code).percent, 1)}%`).join("; ")}`}>
          <rect width={worldMap.width} height={worldMap.height} fill="var(--k-bg-eaf1f8, #EAF1F8)"/>
          {worldMap.neighbours.map(country => <path key={country.code} d={country.d} fill="var(--k-bg-f7f9fc, #F7F9FC)" stroke="var(--k-bd-c9d5e6, #C9D5E6)" strokeWidth="0.8"><title>{country.name}</title></path>)}
          {worldMap.countries.map(country => {
            const f = shareOf(follower, country.code), e = shareOf(engaged, country.code);
            return <path key={country.code} className="igs-country" d={country.d} stroke="var(--k-bd-ffffff, #fff)" strokeWidth="1.2" style={{ "--f": fill(alpha(f.percent, maxF)), "--e": fill(alpha(e.percent, maxE)) } as CSSProperties}>
              <title>{`${country.name} — obunachilar: ${formatNumber(f.percent, 1)}% · ≈ ${formatNumber(f.value)}; reaksiya: ${formatNumber(e.percent, 1)}% · ≈ ${formatNumber(e.value)}`}</title>
            </path>;
          })}
          {worldMap.countries.map(country => country.label && (["f", "e"] as const).map(mode => {
            const share = shareOf(mode === "f" ? follower : engaged, country.code), dark = alpha(share.percent, mode === "f" ? maxF : maxE) > 0.5;
            return <g key={`${country.code}-${mode}`} className={`igs-map-label only-${mode}${dark ? " is-dark" : ""}`} transform={`translate(${country.label![0]} ${country.label![1]})`}>
              <text y={-3} className="igs-map-name">{country.name}</text><text y={12} className="igs-map-pct">{formatNumber(share.percent, 1)}%</text>
            </g>;
          }))}
        </svg>
        <div className="igs-scale"><span>Kam</span><i/><span>Ko‘p</span><small>{worldMap.source}</small></div>
      </div>
      <div>{rows(follower, maxF, "f")}{rows(engaged, maxE, "e")}</div>
    </div>}
  </section>;
}

function Demographics({ board }: { board: Board }) {
  if (!board.audience) return null;
  const parts = (mode: "f" | "e") => {
    const data = mode === "f" ? board.audience!.follower : board.audience!.engaged;
    const cities = shares(data.city ?? {}).rows.slice(0, 8), gender = shares(data.gender ?? {}), age = shares(data.age ?? {}, AGE_ORDER.filter(key => key in (data.age ?? {})));
    const ages = AGE_ORDER.map(key => age.rows.find(row => row.key === key)).filter((row): row is Shares["rows"][number] => !!row);
    const maxAge = Math.max(1, ...ages.map(row => row.percent));
    const ring = ["M", "F", "U"].map(key => gender.rows.find(row => row.key === key)).filter((row): row is Shares["rows"][number] => !!row && row.percent > 0);
    const colors: Record<string, string> = { M: NAVY, F: ORANGE, U: "#DCE5F1" };
    const circumference = 2 * Math.PI * 44;
    let offset = 0;
    const lead = ring[0];
    return <div className={`igs-demo only-${mode}`}>
      <section className="igs-card"><h2>Top shaharlar</h2>{cities.length ? cities.map(row => <div key={row.key} className="igs-row is-city"><span>{cityName(row.key)}</span><span className="igs-track"><i style={{ width: `${(row.percent / Math.max(1, cities[0].percent)) * 100}%`, background: NAVY }}/></span><b>{formatNumber(row.percent, 1)}%</b></div>) : <p className="igs-sub">Ma’lumot yo‘q</p>}</section>
      <section className="igs-card"><h2>Jinsi</h2>{ring.length ? <div className="igs-donut">
        <svg viewBox="0 0 120 120" role="img" aria-label={ring.map(row => `${GENDER_LABELS[row.key] ?? row.key} ${formatNumber(row.percent, 1)}%`).join(", ")}>
          <circle cx="60" cy="60" r="44" fill="none" stroke={NONE} strokeWidth="20"/>
          {ring.map(row => { const length = (row.percent / 100) * circumference, piece = <circle key={row.key} cx="60" cy="60" r="44" fill="none" stroke={colors[row.key] ?? GREY} strokeWidth="20" strokeDasharray={`${length.toFixed(1)} ${circumference.toFixed(1)}`} strokeDashoffset={(-offset).toFixed(1)} transform="rotate(-90 60 60)"/>; offset += length; return piece; })}
          {lead && <><text x="60" y="58" textAnchor="middle" className="igs-donut-pct">{formatNumber(lead.percent, 0)}%</text><text x="60" y="76" textAnchor="middle" className="igs-donut-cap">{(GENDER_LABELS[lead.key] ?? lead.key).toLowerCase()}</text></>}
        </svg>
        <ul>{ring.map(row => <li key={row.key}><i style={{ background: colors[row.key] ?? GREY }}/><b>{GENDER_LABELS[row.key] ?? row.key}</b> {formatNumber(row.percent, 1)}%</li>)}</ul>
      </div> : <p className="igs-sub">Ma’lumot yo‘q</p>}</section>
      <section className="igs-card"><h2>Yoshi</h2>{ages.length ? <div className="igs-ages">{ages.map(row => <div key={row.key} title={`${row.key}: ≈ ${formatNumber(row.value)}`}>
        <b>{formatNumber(row.percent, 0)}%</b><span style={{ height: `${(row.percent / maxAge) * 120}px`, background: row.percent === maxAge ? ORANGE : NAVY }}/><small>{row.key.replace("-", "–")}</small>
      </div>)}</div> : <p className="igs-sub">Ma’lumot yo‘q</p>}</section>
    </div>;
  };
  return <>{parts("f")}{parts("e")}</>;
}

/** The 24-hour activity grid shown in 3-hour columns (00, 03 … 21), as in the design. */
function Heatmap({ heat }: { heat: Board["heatmap"] }) {
  const buckets = heat.grid.map(row => Array.from({ length: 8 }, (_, index) => row.slice(index * 3, index * 3 + 3).reduce((a, b) => a + b, 0)));
  const max = Math.max(0, ...buckets.flat());
  let best: { day: number; bucket: number } | null = null;
  buckets.forEach((row, day) => row.forEach((value, bucket) => { if (max && value === max && !best) best = { day, bucket }; }));
  const top = best as { day: number; bucket: number } | null;
  const hour = (bucket: number) => String(bucket * 3).padStart(2, "0");
  return <section className="igs-card igs-grow" aria-labelledby="igs-heat">
    <div><h2 id="igs-heat">Joylashning eng yaxshi vaqti</h2>
      <span className="igs-sub">Mijozlar komment va Direct yozadigan soatlar (oxirgi 90 kun, Toshkent){top ? ` · eng faol: ${WEEKDAYS[top.day]} ${hour(top.bucket)}:00–${hour(top.bucket + 1 === 8 ? 0 : top.bucket + 1)}:00` : ""}</span>
    </div>
    {max ? <div className="igs-scroll"><div className="igs-heat">
      <span/>{Array.from({ length: 8 }, (_, bucket) => <span key={bucket} className="igs-heat-hour">{hour(bucket)}</span>)}
      {buckets.map((row, day) => <div key={day} className="igs-heat-row"><span className="igs-heat-day">{WEEKDAYS[day]}</span>{row.map((value, bucket) => <i key={bucket} title={`${WEEKDAYS[day]} ${hour(bucket)}:00 — ${value} ta`} style={{ background: `rgba(30,78,140,${(0.08 + (value / max) * 0.92).toFixed(2)})` }}/>)}</div>)}
    </div></div> : <div className="igs-empty">Hali komment / Direct yo‘q</div>}
    <p className="igs-note">Instagram’ning “online_followers” metrikasi hozirgi Instagram Login hujjatida yo‘q, shuning uchun jadval kommentlar va Direct xabarlar vaqtidan hisoblanadi.</p>
  </section>;
}

function ContentTypes({ board }: { board: Board }) {
  return <section className="igs-card igs-side" aria-labelledby="igs-types">
    <h2 id="igs-types">Kontent turi bo‘yicha</h2>
    {board.types.map(row => <div key={row.type} className="igs-format">
      <b>{row.type === "POST" ? "Postlar" : TYPE_LABELS[row.type]} <small>· {formatNumber(row.count)} ta</small></b>
      <div><span>O‘rt. qamrov</span><strong>{formatNumber(row.avgReach)}</strong></div>
      <div><span>ER</span><strong>{row.er === null ? "—" : `${formatNumber(row.er, 1)}%`}</strong></div>
      <div><span>Lid</span><strong>{formatNumber(row.leads)}</strong></div>
    </div>)}
    <div className="igs-split is-three">
      <div><span className="igs-label">Saytga bosish</span><strong>{formatNumber(board.profile.website)}</strong></div>
      <div><span className="igs-label">Qo‘ng‘iroq tugmasi</span><strong>{formatNumber(board.profile.call)}</strong></div>
      <div><span className="igs-label">Manzil (xarita)</span><strong>{formatNumber(board.profile.direction)}</strong></div>
    </div>
  </section>;
}

function Growth({ board }: { board: Board }) {
  const { follows, unfollows, net, netPercent, growth } = board.profile;
  return <section aria-label="Obunachilar o‘sishi" className="igs-growth-wrap">
    {growth.mismatch && <p className="ig-warn" role="alert">Diqqat: follows_and_unfollows bo‘yicha sof o‘sish ({signed(growth.reportedNet ?? 0)}) followers_count farqi bilan ({signed(growth.countNet ?? 0)}, {formatDayUz(growth.from!, true)} — {formatDayUz(growth.to!, true)}) mos kelmayapti.{growth.swapped ? " Belgisi teskari — FOLLOWER / NON_FOLLOWER teskari talqin qilinayotgan bo‘lishi mumkin." : " Meta ma’lumoti 48 soatgacha kechikishi mumkin; “Hozir yangilash” dan keyin qayta tekshiring."}</p>}
    <div className="igs-growth">
      <div className="igs-kpi"><span className="igs-label">Yangi obunachilar</span><strong className="is-good">{follows === null ? "—" : `+${formatNumber(follows)}`}</strong></div>
      <div className="igs-kpi"><span className="igs-label">Obunadan chiqqanlar</span><strong className="is-bad">{unfollows === null ? "—" : `−${formatNumber(unfollows)}`}</strong></div>
      <div className="igs-kpi"><span className="igs-label">Sof o‘sish</span><strong>{net === null ? "—" : `${signed(net)}${netPercent === null ? "" : ` · ${formatNumber(netPercent, 1)}%`}`}</strong></div>
      <div className="igs-kpi"><span className="igs-label">followers_count farqi</span><strong>{growth.countNet === null ? "—" : signed(growth.countNet)}</strong><span className="igs-kpi-foot"><span>{growth.from ? `${formatDayUz(growth.from, true)} — ${formatDayUz(growth.to!, true)} · kunlik obunachilar sonidan` : "kamida 2 kunlik obunachilar soni kerak"}</span></span></div>
    </div>
  </section>;
}

export function StatsBoard({ board, accountId }: { board: Board; accountId: string }) {
  const period = board.period;
  if (!board.status.connected) return <div className="bk-empty"><strong>Instagram ulanmagan</strong><span>Sozlamalar → Instagram</span></div>;
  const fetched = board.status.fetchedAt ? `Oxirgi yangilanish: ${formatDayUz(board.status.fetchedAt.slice(0, 10), true)} ${tashkentTime(board.status.fetchedAt)}` : "Hali yangilanmagan";
  return <div className="igs">
    <div className="igs-head">
      <div>
        <h2 className="igs-title">Instagram statistika</h2>
        <p className="igs-sub">{board.status.username ? `@${board.status.username} · ` : ""}{fetched} · {formatDayUz(board.range.from, true)} — {formatDayUz(board.range.to)}</p>
        {board.status.error && <p className="igs-sub is-bad">Oxirgi xato: {board.status.error}</p>}
      </div>
      <div className="igs-actions">
        <nav className="igs-periods" aria-label="Davr">{(["today", "7", "30", "90"] as const satisfies readonly Period[]).map(key => <Link key={key} className="igs-period" aria-current={key === period ? "page" : undefined} href={withAccount(`/admin/instagram?tab=stats&period=${key}`, accountId)}>{PERIOD_LABELS[key]}</Link>)}</nav>
        <RefreshButton accountId={accountId}/>
        <a className="igs-btn" href={withAccount(`/admin/instagram/stats/export?period=${period}`, accountId)}><Download size={14}/>Excel yuklab olish</a>
      </div>
    </div>
    {board.status.reconnect && <p className="ig-warn" role="alert">Statistika uchun qayta ulash kerak: Sozlamalar → Instagram → “Qayta ulash” (instagram_business_manage_insights ruxsati).</p>}
    {!board.status.hasData ? <div className="igs-card igs-empty"><strong>Statistika hali yo‘q</strong><span>Birinchi yangilanish ertaga 06:00 da. Hozir olish uchun “Hozir yangilash” ni bosing.</span></div> : <>
      <Kpis board={board}/>
      <Funnel steps={board.funnel}/>
      <div className="igs-pair"><DailyChart daily={board.daily}/><Kinds board={board}/></div>
      <AudienceMode><CountryMap board={board}/><Demographics board={board}/></AudienceMode>
      <div className="igs-pair"><Heatmap heat={board.heatmap}/><ContentTypes board={board}/></div>
      <TopPosts posts={board.posts}/>
      <Growth board={board}/>
    </>}
  </div>;
}

/** Skeleton while the period's data loads. */
export function StatsSkeleton() {
  return <div className="igs" aria-busy="true" aria-label="Yuklanmoqda">
    <div className="igs-kpis">{Array.from({ length: 8 }, (_, index) => <div key={index} className="igs-kpi ig-skeleton"/>)}</div>
    <div className="igs-card ig-skeleton" style={{ height: 240 }}/>
    <div className="igs-pair"><div className="igs-card igs-grow ig-skeleton" style={{ height: 340 }}/><div className="igs-card igs-side ig-skeleton" style={{ height: 340 }}/></div>
    <div className="igs-card ig-skeleton" style={{ height: 420 }}/>
  </div>;
}
