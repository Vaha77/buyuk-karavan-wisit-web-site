import type { Metadata } from "next";
import Link from "next/link";
import { StoriesBoard } from "@/components/admin/instagram/stories-board";
import "@/components/admin/instagram/instagram.css";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { superAdminChats } from "@/lib/stories/service";

export const metadata: Metadata = { title: "Instagram storislar — Admin | BUYUK KARAVAN" };
export const maxDuration = 60;

/** Stories queue (Super Admin only): upload, approve / reject, change the time, publish now (test). */
export default async function StoriesPage() {
  await requireRole("SUPER_ADMIN");
  const db = getDb();
  const [items, chats] = await Promise.all([
    db.storyQueueItem.findMany({ orderBy: { scheduledAt: "desc" }, take: 120 }),
    superAdminChats(),
  ]);
  const env = { publish: !!process.env.IG_USER_ID?.trim() && !!process.env.IG_PUBLISH_TOKEN?.trim(), api: !!process.env.STORY_QUEUE_TOKEN?.trim() };
  return <div className="bk">
    <div className="bk-head"><div><h1>Instagram storislar</h1><p className="bk-muted">Navbat → BK botda tasdiqlash → vaqtida avtomatik joylash (har 10 daqiqada)</p></div></div>
    <nav className="bk-chips" aria-label="Instagram bo‘limlari" style={{ marginBottom: 16 }}>
      <Link className="bk-chip" href="/admin/instagram">Kommentlar</Link>
      <Link className="bk-chip" href="/admin/instagram?tab=direct">Direct</Link>
      <Link className="bk-chip" href="/admin/instagram?tab=stats">Statistika</Link>
      <Link className="bk-chip is-active" href="/admin/instagram/stories">Storislar</Link>
    </nav>
    <StoriesBoard
      items={items.map(item => ({ id: item.id, videoUrl: item.videoUrl, caption: item.caption, scheduledAt: item.scheduledAt.toISOString(), status: item.status, error: item.error, attempts: item.attempts, publishedAt: item.publishedAt?.toISOString() ?? null, durationMs: item.durationMs, width: item.width, height: item.height, approvedBy: item.approvedBy }))}
      telegramLinked={chats.length > 0} publishReady={env.publish} apiReady={env.api}
    />
  </div>;
}
