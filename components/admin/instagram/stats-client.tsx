"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { refreshInsightsAction } from "@/app/admin/(protected)/instagram/actions";
import { BusyLabel } from "@/components/admin/feedback";
import { TYPE_LABELS, formatDayUz, formatDurationMs, formatNumber } from "@/lib/instagram/insights-rules";
import type { StatsBoard } from "@/lib/instagram/stats-queries";

/** "Hozir yangilash": fetches Insights now (can take up to a minute), then reloads the data. */
export function RefreshButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return <span className="igs-refresh">
    <button type="button" className="igs-btn" disabled={pending} onClick={() => startTransition(async () => {
      setMessage(null);
      const result = await refreshInsightsAction(accountId);
      setMessage(result.ok ? { ok: true, text: result.message ?? "Yangilandi ✓" } : { ok: false, text: result.error });
      router.refresh();
    })}><RefreshCw size={14}/><BusyLabel busy={pending} busyText="Yangilanmoqda…">Hozir yangilash</BusyLabel></button>
    {message && <small className={message.ok ? "ig-ok" : "ig-error"} role={message.ok ? "status" : "alert"}>{message.text}</small>}
  </span>;
}

type Mode = "f" | "e";
const ModeContext = createContext<{ mode: Mode; setMode: (mode: Mode) => void }>({ mode: "f", setMode: () => undefined });

/** "Obunachilar" / "Reaksiya beruvchilar" for the map and the demographics: both are server-rendered, this only switches. */
export function AudienceMode({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("f");
  return <ModeContext.Provider value={{ mode, setMode }}><div className="igs-geo" data-mode={mode}>{children}</div></ModeContext.Provider>;
}

export function AudienceToggle() {
  const { mode, setMode } = useContext(ModeContext);
  return <div className="igs-seg" role="tablist" aria-label="Auditoriya">
    <button type="button" role="tab" aria-selected={mode === "f"} onClick={() => setMode("f")}>Obunachilar</button>
    <button type="button" role="tab" aria-selected={mode === "e"} onClick={() => setMode("e")}>Reaksiya beruvchilar</button>
  </div>;
}

type Post = StatsBoard["posts"][number];
const SORTS: Array<{ key: "leads" | "views" | "comments" | "er"; label: string }> = [{ key: "leads", label: "Lid" }, { key: "views", label: "Ko‘rish" }, { key: "comments", label: "Komment" }, { key: "er", label: "ER" }];

export function TopPosts({ posts }: { posts: Post[] }) {
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("leads");
  const rows = [...posts].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1) || (b.views ?? 0) - (a.views ?? 0)).slice(0, 20);
  return <section className="igs-card" aria-labelledby="igs-top">
    <div className="igs-card-head"><h2 id="igs-top">Top postlar va Reels</h2>
      {posts.length > 0 && <div className="igs-seg" role="tablist" aria-label="Saralash">{SORTS.map(item => <button key={item.key} type="button" role="tab" aria-selected={sort === item.key} onClick={() => setSort(item.key)}>{item.label}</button>)}</div>}
    </div>
    {!posts.length ? <div className="igs-empty">Bu davrda post yo‘q</div> : <div className="igs-scroll"><table className="igs-table">
      <thead><tr><th>Post</th><th>Sana</th><th>Ko‘rish</th><th>Like</th><th>Komment</th><th>Saqlash</th><th>Ulashish</th><th>O‘rt. tomosha</th><th>Direct</th><th>Lid</th><th>ER</th></tr></thead>
      <tbody>{rows.map(post => <tr key={post.id}>
        <td><a className="igs-post" href={post.permalink ?? undefined} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- Instagram CDN thumbnails expire; not worth the image optimizer */}
          <span className="igs-thumb">{post.thumbnail ? <img src={post.thumbnail} alt="" loading="lazy"/> : null}<i>{(TYPE_LABELS[post.type] ?? post.type).toUpperCase()}</i></span>
          <span>{(post.caption ?? "Izohsiz").slice(0, 70)} <ExternalLink size={11} aria-hidden="true"/></span>
        </a></td>
        <td className="is-muted">{formatDayUz(post.postedAt.slice(0, 10), true)}</td>
        <td className="is-bold">{formatNumber(post.views)}</td><td>{formatNumber(post.likes)}</td><td>{formatNumber(post.comments)}</td><td>{formatNumber(post.saved)}</td><td>{formatNumber(post.shares)}</td>
        <td>{post.type === "REELS" ? formatDurationMs(post.avgWatchMs) : "—"}</td>
        <td>{formatNumber(post.direct)}</td><td className="is-lead">{formatNumber(post.leads)}</td><td className="is-bold">{post.er === null ? "—" : `${formatNumber(post.er, 1)}%`}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
