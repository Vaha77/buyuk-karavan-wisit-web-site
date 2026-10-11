"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { refreshInsightsAction } from "@/app/admin/(protected)/instagram/actions";
import { BusyLabel } from "@/components/admin/feedback";
import { TYPE_LABELS, formatDayUz, formatDurationMs, formatNumber } from "@/lib/instagram/insights-rules";
import type { StatsBoard } from "@/lib/instagram/stats-queries";

/** "Hozir yangilash": fetches Insights now (can take up to a minute), then reloads the data. */
export function RefreshButton() {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return <span className="ig-refresh">
    <button type="button" className="bk-btn" disabled={pending} onClick={() => startTransition(async () => {
      setMessage(null);
      const result = await refreshInsightsAction();
      setMessage(result.ok ? { ok: true, text: result.message ?? "Yangilandi ✓" } : { ok: false, text: result.error });
      router.refresh();
    })}><RefreshCw size={14}/><BusyLabel busy={pending} busyText="Yangilanmoqda…">Hozir yangilash</BusyLabel></button>
    {message && <small className={message.ok ? "ig-ok" : "ig-error"} role={message.ok ? "status" : "alert"}>{message.text}</small>}
  </span>;
}

/** "Obunachilar" / "Reaksiya beruvchilar": the server-rendered map and bars carry both shadings; this only switches. */
export function AudienceMode({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<"f" | "e">("f");
  return <div className="ig-geo" data-mode={mode}>
    <div className="bk-chips" role="tablist" aria-label="Auditoriya">
      <button type="button" role="tab" className="bk-chip" aria-selected={mode === "f"} onClick={() => setMode("f")}>Obunachilar</button>
      <button type="button" role="tab" className="bk-chip" aria-selected={mode === "e"} onClick={() => setMode("e")}>Reaksiya beruvchilar</button>
    </div>
    {children}
  </div>;
}

type Post = StatsBoard["posts"][number];
const SORTS: Array<{ key: "leads" | "views" | "comments" | "er"; label: string }> = [{ key: "leads", label: "Lid" }, { key: "views", label: "Ko‘rish" }, { key: "comments", label: "Komment" }, { key: "er", label: "ER" }];

export function TopPosts({ posts }: { posts: Post[] }) {
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("leads");
  const rows = [...posts].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1) || (b.views ?? 0) - (a.views ?? 0)).slice(0, 20);
  if (!posts.length) return <div className="bk-empty">Bu davrda post yo‘q</div>;
  return <>
    <div className="bk-chips" role="tablist" aria-label="Saralash">{SORTS.map(item => <button key={item.key} type="button" role="tab" className="bk-chip" aria-selected={sort === item.key} onClick={() => setSort(item.key)}>{item.label}</button>)}</div>
    <div className="bk-table-wrap"><table className="bk-table ig-table">
      <thead><tr><th className="is-left">Post</th><th>Sana</th><th>Ko‘rish</th><th>Like</th><th>Komment</th><th>Saqlash</th><th>Ulashish</th><th>O‘rt. tomosha</th><th>Direct</th><th>Lid</th><th>ER</th></tr></thead>
      <tbody>{rows.map(post => <tr key={post.id}>
        <td className="is-left ig-wrap"><a href={post.permalink ?? undefined} target="_blank" rel="noreferrer"><span className="ig-tag">{TYPE_LABELS[post.type] ?? post.type}</span>{(post.caption ?? "Izohsiz").slice(0, 60)} <ExternalLink size={11}/></a></td>
        <td>{formatDayUz(post.postedAt.slice(0, 10), true)}</td>
        <td>{formatNumber(post.views)}</td><td>{formatNumber(post.likes)}</td><td>{formatNumber(post.comments)}</td><td>{formatNumber(post.saved)}</td><td>{formatNumber(post.shares)}</td>
        <td>{post.type === "REELS" ? formatDurationMs(post.avgWatchMs) : "—"}</td>
        <td>{formatNumber(post.direct)}</td><td className="is-strong">{formatNumber(post.leads)}</td><td>{post.er === null ? "—" : `${formatNumber(post.er, 1)}%`}</td>
      </tr>)}</tbody>
    </table></div>
  </>;
}
