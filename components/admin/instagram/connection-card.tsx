"use client";

import { useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { connectInstagramAction, disconnectInstagramAction, refreshInstagramTokenAction, resubscribeWebhookAction, syncMissedCommentsAction } from "@/app/admin/(protected)/instagram/actions";
import { BusyLabel } from "@/components/admin/feedback";
import type { InstagramStatus } from "@/lib/instagram/queries";

const RESULTS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Instagram ulandi ✓" },
  "connected-no-webhook": { ok: false, text: "Ulandi, lekin webhook obunasi bo‘lmadi — “Webhookni qayta ulash”ni bosing." },
  denied: { ok: false, text: "Instagram’da ruxsat berilmadi." },
  state: { ok: false, text: "Sessiya eskirdi — qaytadan ulashni bosing." },
  code: { ok: false, text: "Instagram kod qaytarmadi." },
  key: { ok: false, text: "PASSWORD_VIEW_KEY yo‘q — token shifrlanmadi." },
  forbidden: { ok: false, text: "Faqat Super Admin ulay oladi." },
  mismatch: { ok: false, text: "Boshqa akkauntga kirdingiz. Shu akkauntni qayta ulash uchun o‘sha Instagram bilan kiring yoki “Yangi akkaunt ulash”ni bosing." },
  failed: { ok: false, text: "Ulab bo‘lmadi. App ID / Secret va redirect URL’ni tekshiring." },
};

type Action = () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>;
type Account = InstagramStatus["accounts"][number];
const date = (iso: string) => new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function useRun(initial: { ok: boolean; text: string } | null = null) {
  const [message, setMessage] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const run = (name: string, action: Action, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(name);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await action();
        setMessage(response.ok ? { ok: true, text: response.message ?? "Bajarildi ✓" } : { ok: false, text: response.error });
      } finally { setBusy(null); }
    });
  };
  return { busy, run, note: message && <p className={message.ok ? "ig-ok" : "ig-error"} role={message.ok ? "status" : "alert"}>{message.text}</p> };
}

/** One account: token expiry, webhook state, catch-up, reconnect / disconnect. */
function AccountCard({ account, canConnect }: { account: Account; canConnect: boolean }) {
  const { busy, run, note } = useRun();
  const daysLeft = account.tokenDaysLeft;
  return <div className="bk-card" style={{ display: "grid", gap: 10 }}>
    <h3><a href={`https://instagram.com/${account.username}`} target="_blank" rel="noreferrer">@{account.username}</a>{account.name !== `@${account.username}` && <span className="bk-muted"> · {account.name}</span>}</h3>
    {account.insightsReconnect && !account.disconnected && <p className="ig-warn" role="alert">Statistika uchun qayta ulash kerak: token “instagram_business_manage_insights” ruxsatisiz. “Qayta ulash”ni bosing va ruxsat bering.</p>}
    {account.disconnected ? <p className="bk-muted">Uzilgan — avto-javoblar to‘xtagan (sozlamalar va jurnal saqlangan). “Qayta ulash”ni bosing.</p> : <dl className="ig-facts">
      <div><dt>Token muddati</dt><dd className={daysLeft < 10 ? "is-bad" : ""}>{date(account.tokenExpiresAt)} · {daysLeft} kun qoldi{!account.tokenReadable && " · o‘qib bo‘lmadi, qayta ulang"}</dd></div>
      <div><dt>Webhook</dt><dd className={account.webhookError ? "is-bad" : ""}>{account.webhookError ? `Xato: ${account.webhookError}` : account.webhookSubscribedAt ? `Obuna (comments, messages) · ${date(account.webhookSubscribedAt)}` : "Obuna yo‘q"}</dd></div>
      <div><dt>Oxirgi hodisa</dt><dd>{account.lastWebhookAt ? date(account.lastWebhookAt) : "Hali kelmagan"}</dd></div>
    </dl>}
    <div className="bk-actions">
      <button type="button" className="bk-btn is-primary" disabled={!!busy || !canConnect} onClick={() => run("connect", () => connectInstagramAction(account.id))}><BusyLabel busy={busy === "connect"} busyText="Yo‘naltirilmoqda…">Qayta ulash</BusyLabel></button>
      {!account.disconnected && <>
        <button type="button" className="bk-btn" disabled={!!busy} onClick={() => run("refresh", () => refreshInstagramTokenAction(account.id))}><BusyLabel busy={busy === "refresh"} busyText="Yangilanmoqda…">Tokenni yangilash</BusyLabel></button>
        <button type="button" className="bk-btn" disabled={!!busy} onClick={() => run("webhook", () => resubscribeWebhookAction(account.id))}><BusyLabel busy={busy === "webhook"} busyText="Ulanmoqda…">Webhookni qayta ulash</BusyLabel></button>
        <button type="button" className="bk-btn" disabled={!!busy} onClick={() => run("sync", () => syncMissedCommentsAction(account.id))}><BusyLabel busy={busy === "sync"} busyText="Tekshirilmoqda…">O‘tkazib yuborilgan kommentlarni tekshirish</BusyLabel></button>
        <button type="button" className="bk-btn is-danger-ghost" disabled={!!busy} onClick={() => run("disconnect", () => disconnectInstagramAction(account.id), `@${account.username} uzilsinmi? Avto-javoblar to‘xtaydi (post sozlamalari va jurnal saqlanadi).`)}><BusyLabel busy={busy === "disconnect"} busyText="Uzilmoqda…">Uzish</BusyLabel></button>
      </>}
    </div>
    {note}
  </div>;
}

/** Sozlamalar → Instagram (Super Admin): a card per connected account and "Yangi akkaunt ulash" (Instagram Login). */
export function InstagramConnectionCard({ status, result }: { status: InstagramStatus; result?: string }) {
  const { busy, run, note } = useRun(result ? RESULTS[result] ?? null : null);
  const canConnect = status.missingEnv.length === 0 && status.vault;
  return <section id="instagram" className="bk-card ig-connect" aria-labelledby="ig-connect-title">
    <div className="ig-connect-head"><span className="ig-logo"><Camera size={20}/></span><div><h2 id="ig-connect-title">Instagram</h2><p className="bk-muted">Har akkaunt o‘z avto-javoblari, Direct’i, statistikasi va storislari bilan. Postlarga mahsulot “Instagram” bo‘limida biriktiriladi.</p></div></div>
    {status.missingEnv.length > 0 && <p className="ig-warn" role="alert">Vercel’da o‘rnatilmagan: {status.missingEnv.join(", ")}. Yo‘riqnoma: docs/instagram-setup.md</p>}
    {!status.vault && <p className="ig-warn" role="alert">PASSWORD_VIEW_KEY o‘rnatilmagan — token shifrlab saqlanadi, usiz ulab bo‘lmaydi.</p>}
    {status.accounts.length ? status.accounts.map(account => <AccountCard key={account.id} account={account} canConnect={canConnect}/>) : <p className="bk-muted">Akkaunt ulanmagan. Instagram professional (Business / Creator) akkauntingiz bilan kiring.</p>}
    <div className="bk-actions">
      <button type="button" className="bk-btn is-primary" disabled={!!busy || !canConnect} onClick={() => run("add", () => connectInstagramAction("add"))}><BusyLabel busy={busy === "add"} busyText="Yo‘naltirilmoqda…">{status.accounts.length ? "Yangi akkaunt ulash" : "Instagram’ni ulash"}</BusyLabel></button>
    </div>
    <p className="bk-muted">Har soatda, har akkaunt uchun: token tekshiriladi (muddati tugashiga 20 kun qolganda yangilanadi) va so‘nggi 25 ta postning 7 kunlik kommentlaridan webhook o‘tkazib yuborganlari navbatga qo‘shiladi. Yangi akkaunt ulashdan oldin Instagram’da kerakli akkauntga kirilganini tekshiring.</p>
    {note}
  </section>;
}
