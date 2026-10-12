"use client";
// /admin/instagram/stories (Super Admin): "Video yuklash" (several MP4s, each with its time and note) and the queue with
// Tasdiqlash / Rad etish / Vaqtni o‘zgartirish / Hozir joylash. Uploads go straight to the storage (presigned PUT).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Send, Upload, X } from "lucide-react";
import { approveStoryAction, createStoryUploadAction, publishNowAction, registerStoryAction, rejectStoryAction, rescheduleStoryAction, type StoryActionResult } from "@/app/admin/(protected)/instagram/stories/actions";
import { BusyLabel } from "@/components/admin/feedback";
import { MAX_DURATION_MS, MAX_VIDEO_BYTES, MIN_DURATION_MS, STATUS_LABELS, formatTashkent, toLocalInput, type StoryStatus } from "@/lib/stories/rules";

export type StoryRow = { id: string; videoUrl: string; caption: string | null; scheduledAt: string; status: string; error: string | null; attempts: number; publishedAt: string | null; durationMs: number | null; width: number | null; height: number | null; approvedBy: string | null };
type Draft = { key: string; file: File; scheduledAt: string; caption: string; state: "idle" | "uploading" | "done" | "error"; note: string; check: string | null };
const TONE: Record<string, string> = { PENDING_APPROVAL: "is-wait", APPROVED: "is-ok", PUBLISHING: "is-wait", PUBLISHED: "is-ok", REJECTED: "is-bad", FAILED: "is-bad", EXPIRED: "is-bad" };
/** Next full hour in Tashkent, for a new row's default time. */
const nextHour = () => { const date = new Date(Date.now() + 3_600_000); date.setUTCMinutes(0, 0, 0); return toLocalInput(date); };

/** Duration and size from the browser before uploading (the server checks again). */
function probe(file: File): Promise<string | null> {
  if (file.size > MAX_VIDEO_BYTES) return Promise.resolve("100 MB dan katta");
  if (!/mp4$/i.test(file.type) && !/\.mp4$/i.test(file.name)) return Promise.resolve("MP4 emas");
  return new Promise(resolve => {
    const video = document.createElement("video"), url = URL.createObjectURL(file);
    const done = (value: string | null) => { URL.revokeObjectURL(url); resolve(value); };
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const ms = video.duration * 1000, ratio = video.videoWidth / Math.max(1, video.videoHeight);
      if (ms < MIN_DURATION_MS || ms > MAX_DURATION_MS) return done(`3–60 s bo‘lsin (${Math.round(video.duration)} s)`);
      if (Math.abs(ratio - 9 / 16) > 0.02) return done(`9:16 bo‘lsin (${video.videoWidth}×${video.videoHeight})`);
      done(null);
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

function Uploader({ onDone }: { onDone: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const patch = (key: string, value: Partial<Draft>) => setDrafts(rows => rows.map(row => row.key === key ? { ...row, ...value } : row));
  const add = async (files: FileList | null) => {
    const rows = Array.from(files ?? []).map((file, index) => ({ key: `${file.name}-${file.size}-${Date.now()}-${index}`, file, scheduledAt: nextHour(), caption: "", state: "idle" as const, note: "", check: null }));
    setDrafts(current => [...current, ...rows]);
    for (const row of rows) patch(row.key, { check: await probe(row.file) });
  };
  const uploadOne = async (row: Draft) => {
    patch(row.key, { state: "uploading", note: "Yuklanmoqda…" });
    try {
      const presign = await createStoryUploadAction(row.file.size);
      if (!presign.ok) throw new Error(presign.error);
      const put = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.headers, body: row.file });
      if (!put.ok) throw new Error(`Storage HTTP ${put.status}`);
      const saved = await registerStoryAction({ key: presign.key, scheduledAt: row.scheduledAt, caption: row.caption });
      if (!saved.ok) throw new Error(saved.error);
      patch(row.key, { state: "done", note: saved.message ?? "Navbatga qo‘shildi ✓" });
    } catch (error) {
      patch(row.key, { state: "error", note: error instanceof Error ? error.message : "Yuklab bo‘lmadi" });
    }
  };
  const uploadAll = async () => {
    setBusy(true);
    for (const row of drafts.filter(item => item.state === "idle" || item.state === "error")) await uploadOne(row);
    setBusy(false);
    onDone();
  };
  const waiting = drafts.filter(item => item.state === "idle" || item.state === "error");
  return <section className="bk-card ig-story-upload" aria-labelledby="story-upload">
    <div className="bk-card-head"><div><h2 id="story-upload">Video yuklash</h2><p className="bk-muted">MP4 · 9:16 · 3–60 soniya · 100 MB gacha. Har biriga vaqt (Toshkent) va ichki izoh. Yuklangach BK botga tasdiqlashga ketadi.</p></div></div>
    <label className="ig-story-pick"><Upload size={18}/><span>MP4 tanlash (bir nechta)</span><input type="file" accept="video/mp4" multiple onChange={event => { void add(event.target.files); event.target.value = ""; }} disabled={busy}/></label>
    {drafts.length > 0 && <ul className="ig-story-drafts">{drafts.map(row => <li key={row.key} className={`is-${row.state}`}>
      <div className="ig-story-file"><b>{row.file.name}</b><small>{Math.round(row.file.size / 1024 / 102.4) / 10} MB{row.check ? ` · ⚠️ ${row.check}` : ""}</small></div>
      <label className="bk-field"><span>Vaqt</span><input type="datetime-local" value={row.scheduledAt} disabled={row.state === "uploading" || row.state === "done"} onChange={event => patch(row.key, { scheduledAt: event.target.value })}/></label>
      <label className="bk-field"><span>Izoh (ichki)</span><input value={row.caption} maxLength={1000} disabled={row.state === "uploading" || row.state === "done"} onChange={event => patch(row.key, { caption: event.target.value })} placeholder="Masalan: Bitzer agregat yetib keldi"/></label>
      <div className="ig-story-draft-foot">
        <span className={row.state === "error" ? "ig-error" : row.state === "done" ? "ig-ok" : "bk-muted"} role={row.state === "error" ? "alert" : "status"}>{row.note}</span>
        {row.state !== "uploading" && row.state !== "done" && <button type="button" className="bk-icon-btn" aria-label={`${row.file.name} — olib tashlash`} onClick={() => setDrafts(rows => rows.filter(item => item.key !== row.key))}><X size={15}/></button>}
      </div>
    </li>)}</ul>}
    {waiting.length > 0 && <button type="button" className="bk-btn is-primary" disabled={busy} onClick={() => void uploadAll()}><BusyLabel busy={busy} busyText="Yuklanmoqda…">{`Yuklash va navbatga qo‘shish (${waiting.length})`}</BusyLabel></button>}
  </section>;
}

function StoryCard({ item, run, pending }: { item: StoryRow; run: (task: () => Promise<StoryActionResult>) => void; pending: boolean }) {
  const [editing, setEditing] = useState(false), [when, setWhen] = useState(toLocalInput(new Date(item.scheduledAt)));
  const status = item.status as StoryStatus;
  return <li className="bk-card ig-story">
    <video className="ig-story-video" src={item.videoUrl || undefined} controls preload="metadata" playsInline muted aria-label="Storis videosi"/>
    <div className="ig-story-body">
      <div className="ig-story-top"><strong>{formatTashkent(new Date(item.scheduledAt))}</strong><span className={`ig-tag ${TONE[status] ?? ""}`}>{STATUS_LABELS[status] ?? status}</span></div>
      {item.caption && <p className="ig-story-caption">{item.caption}</p>}
      <p className="bk-muted ig-story-meta">{[item.durationMs && `${Math.round(item.durationMs / 1000)} s`, item.width && item.height && `${item.width}×${item.height}`, item.approvedBy && `tasdiqladi: ${item.approvedBy}`, item.publishedAt && `joylandi: ${formatTashkent(new Date(item.publishedAt))}`, item.attempts > 0 && `urinish: ${item.attempts}/3`].filter(Boolean).join(" · ")}</p>
      {item.error && <p className="ig-error">⚠️ {item.error}</p>}
      {editing && <div className="ig-story-edit"><input type="datetime-local" value={when} onChange={event => setWhen(event.target.value)} aria-label="Yangi vaqt"/><button type="button" className="bk-btn is-primary" disabled={pending} onClick={() => run(async () => { const result = await rescheduleStoryAction(item.id, when); if (result.ok) setEditing(false); return result; })}>Saqlash</button><button type="button" className="bk-btn" onClick={() => setEditing(false)}>Bekor</button></div>}
      <div className="ig-story-actions">
        {status === "PENDING_APPROVAL" && <button type="button" className="bk-btn is-primary" disabled={pending} onClick={() => run(() => approveStoryAction(item.id))}><Check size={15}/>Tasdiqlash</button>}
        {(status === "PENDING_APPROVAL" || status === "APPROVED") && <button type="button" className="bk-btn" disabled={pending} onClick={() => run(() => rejectStoryAction(item.id))}><X size={15}/>Rad etish</button>}
        {["PENDING_APPROVAL", "APPROVED", "EXPIRED", "FAILED"].includes(status) && !editing && <button type="button" className="bk-btn" disabled={pending} onClick={() => setEditing(true)}><CalendarClock size={15}/>Vaqtni o‘zgartirish</button>}
        {status === "APPROVED" && <button type="button" className="bk-btn" disabled={pending} onClick={() => { if (window.confirm("Storis hozir Instagram’ga joylansinmi? (sinov)")) run(() => publishNowAction(item.id)); }}><Send size={15}/>Hozir joylash</button>}
      </div>
    </div>
  </li>;
}

export function StoriesBoard({ items, telegramLinked, publishReady, apiReady }: { items: StoryRow[]; telegramLinked: boolean; publishReady: boolean; apiReady: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (task: () => Promise<StoryActionResult>) => startTransition(async () => {
    setMessage(null);
    const result = await task();
    setMessage(result.ok ? { ok: true, text: result.message ?? "Saqlandi ✓" } : { ok: false, text: result.error });
    router.refresh();
  });
  const open = items.filter(item => ["PENDING_APPROVAL", "APPROVED", "PUBLISHING"].includes(item.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const done = items.filter(item => !open.includes(item));
  return <div className="ig">
    {!telegramLinked && <p className="ig-warn" role="alert">Super Admin Telegram’i ulanmagan — tasdiqlash xabarlari botga bormaydi (Foydalanuvchilar → Telegram bog‘lash). Bu yerda tasdiqlash mumkin.</p>}
    {!publishReady && <p className="ig-warn" role="alert">IG_USER_ID / IG_PUBLISH_TOKEN sozlanmagan — storislar joylanmaydi.</p>}
    {!apiReady && <p className="bk-muted" style={{ margin: 0 }}>API (POST /api/stories/queue) uchun STORY_QUEUE_TOKEN sozlanmagan — hozircha faqat shu yerdan yuklash mumkin.</p>}
    <Uploader onDone={() => router.refresh()}/>
    {message && <p className={message.ok ? "ig-ok" : "ig-error"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
    <section aria-labelledby="story-open"><h2 id="story-open" className="ig-story-h">Navbatda · {open.length}</h2>
      {open.length ? <ul className="ig-stories">{open.map(item => <StoryCard key={item.id} item={item} run={run} pending={pending}/>)}</ul> : <div className="bk-empty">Navbat bo‘sh</div>}
    </section>
    {done.length > 0 && <section aria-labelledby="story-done"><h2 id="story-done" className="ig-story-h">Tarix · {done.length}</h2><ul className="ig-stories">{done.map(item => <StoryCard key={item.id} item={item} run={run} pending={pending}/>)}</ul></section>}
  </div>;
}
