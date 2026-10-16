import type { Metadata } from "next";
import { InstagramNav, pickAccount } from "@/components/admin/instagram/account-nav";
import { StoriesBoard } from "@/components/admin/instagram/stories-board";
import "@/components/admin/instagram/instagram.css";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { getAccountOptions } from "@/lib/instagram/queries";
import { FIRST_ACCOUNT_ID } from "@/lib/instagram/service";
import { superAdminChats } from "@/lib/stories/service";

export const metadata: Metadata = { title: "Instagram storislar — Admin | BUYUK KARAVAN" };
export const maxDuration = 60;

/** Stories queue of one account (Super Admin only): upload, approve / reject, change the time, publish now (test). */
export default async function StoriesPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const db = getDb();
  const accounts = await getAccountOptions();
  const accountId = pickAccount(accounts, (await searchParams).account)?.id ?? FIRST_ACCOUNT_ID;
  const [items, chats] = await Promise.all([
    db.storyQueueItem.findMany({ where: { accountId }, orderBy: { scheduledAt: "desc" }, take: 120 }),
    superAdminChats(),
  ]);
  // The first account publishes with the env token, the others with their own Instagram Login token.
  const env = { publish: accountId !== FIRST_ACCOUNT_ID || (!!process.env.IG_USER_ID?.trim() && !!process.env.IG_PUBLISH_TOKEN?.trim()), api: !!process.env.STORY_QUEUE_TOKEN?.trim() };
  return <div className="bk">
    <div className="bk-head"><div><h1>Instagram storislar</h1><p className="bk-muted">Navbat → BK botda tasdiqlash → vaqtida avtomatik joylash (har 10 daqiqada)</p></div></div>
    <InstagramNav accounts={accounts} accountId={accountId} active="stories" isSuper/>
    <StoriesBoard
      accountId={accountId}
      items={items.map(item => ({ id: item.id, videoUrl: item.videoUrl, caption: item.caption, scheduledAt: item.scheduledAt.toISOString(), status: item.status, error: item.error, attempts: item.attempts, publishedAt: item.publishedAt?.toISOString() ?? null, durationMs: item.durationMs, width: item.width, height: item.height, approvedBy: item.approvedBy }))}
      telegramLinked={chats.length > 0} publishReady={env.publish} apiReady={env.api}
    />
  </div>;
}
