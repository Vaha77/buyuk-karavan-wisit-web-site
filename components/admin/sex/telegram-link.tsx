"use client";

import { useState, useTransition } from "react";
import { createTelegramLinkAction, sendMyTelegramTestAction } from "@/app/admin/(sex)/seh/actions";
import { sendSehGroupTestAction } from "@/app/admin/(protected)/settings/actions";
import { BusyLabel } from "@/components/admin/feedback";

type Link = { url: string | null; code: string; expiresAt: string; minutes: number };
type Busy = "link" | "me" | "group" | null;

/** "Telegram ulash" (one-time deep link, 15 min) plus test messages. `compact` = the workshop panel header. */
export function TelegramLink({ linked, groupTest = false, compact = false }: { linked: boolean; groupTest?: boolean; compact?: boolean }) {
  const [link, setLink] = useState<Link | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [pending, startTransition] = useTransition();
  const run = (kind: Busy, task: () => Promise<void>) => { setBusy(kind); setMessage(null); startTransition(task); };
  const makeLink = () => run("link", async () => {
    const result = await createTelegramLinkAction();
    if (!result.ok) { setMessage({ ok: false, text: result.error }); return; }
    setLink({ ...result, minutes: Math.max(1, Math.round((new Date(result.expiresAt).getTime() - Date.now()) / 60_000)) });
    if (result.url) window.open(result.url, "_blank", "noopener");
  });
  const test = (kind: "me" | "group") => run(kind, async () => {
    const result = kind === "me" ? await sendMyTelegramTestAction() : await sendSehGroupTestAction();
    if (!result.ok) { setMessage({ ok: false, text: `❌ ${result.error}` }); return; }
    const migrated = "migratedTo" in result && result.migratedTo ? ` · Guruh ID o‘zgardi: ${result.migratedTo} — Vercel'da TELEGRAM_WORKSHOP_CHAT_ID ni yangilang` : "";
    setMessage({ ok: true, text: kind === "me" ? "✅ Test xabar yuborildi — Telegramni tekshiring" : `✅ Seh guruhiga yuborildi${migrated}` });
  });
  const isBusy = (kind: Busy) => pending && busy === kind;

  return <div className={compact ? "sx-tg-link is-compact" : "sx-tg-link"}>
    <div className="sx-actions">
      {linked && <span className="sx-pill is-green">✓ Telegram ulangan</span>}
      <button type="button" className={`sx-btn ${linked ? "" : "is-primary"} ${compact ? "is-md" : ""}`} disabled={pending} onClick={makeLink}><BusyLabel busy={isBusy("link")} busyText="Tayyorlanmoqda…">{linked ? "Qayta ulash" : "Telegram ulash"}</BusyLabel></button>
      {linked && <button type="button" className={`sx-btn ${compact ? "is-md" : ""}`} disabled={pending} onClick={() => test("me")}><BusyLabel busy={isBusy("me")} busyText="Yuborilmoqda…">Menga test xabar</BusyLabel></button>}
      {groupTest && <button type="button" className="sx-btn" disabled={pending} onClick={() => test("group")}><BusyLabel busy={isBusy("group")} busyText="Yuborilmoqda…">Seh guruhiga test xabar</BusyLabel></button>}
    </div>
    {link && <p className="sx-note is-info">
      {link.url ? <><a href={link.url} target="_blank" rel="noopener noreferrer"><b>Telegram‘da ochish</b></a> va <b>START</b> ni bosing. </> : <>Botga shu buyruqni yuboring: </>}
      Kod: <code>/start {link.code}</code> · {link.minutes} daqiqa amal qiladi.
    </p>}
    {message && <p className={`sx-note ${message.ok ? "is-ok" : "is-error"}`} role={message.ok ? "status" : "alert"}>{message.text}</p>}
  </div>;
}
