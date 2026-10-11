"use client";

import { useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { connectInstagramAction, disconnectInstagramAction, refreshInstagramTokenAction, resubscribeWebhookAction } from "@/app/admin/(protected)/instagram/actions";
import { BusyLabel } from "@/components/admin/feedback";
import type { InstagramStatus } from "@/lib/instagram/queries";

const RESULTS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Instagram ulandi ✓" },
  "connected-no-webhook": { ok: false, text: "Ulandi, lekin webhook obunasi bo‘lmadi — “Webhookni qayta ulash”ni bosing." },
  denied: { ok: false, text: "Instagram’da ruxsat berilmadi." },
  state: { ok: false, text: "Sessiya eskirdi — qaytadan “Instagram’ni ulash”ni bosing." },
  code: { ok: false, text: "Instagram kod qaytarmadi." },
  key: { ok: false, text: "PASSWORD_VIEW_KEY yo‘q — token shifrlanmadi." },
  forbidden: { ok: false, text: "Faqat Super Admin ulay oladi." },
  failed: { ok: false, text: "Ulab bo‘lmadi. App ID / Secret va redirect URL’ni tekshiring." },
};

const date = (iso: string) => new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Sozlamalar → Instagram (Super Admin): connect via Instagram Login, token expiry, webhook state, disconnect. */
export function InstagramConnectionCard({ status, result }: { status: InstagramStatus; result?: string }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(result ? RESULTS[result] ?? null : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const run = (name: string, action: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, confirmText?: string) => {
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
  const account = status.account;
  const daysLeft = account?.tokenDaysLeft ?? 0;

  return <section id="instagram" className="bk-card ig-connect" aria-labelledby="ig-connect-title">
    <div className="ig-connect-head"><span className="ig-logo"><Camera size={20}/></span><div><h2 id="ig-connect-title">Instagram</h2><p className="bk-muted">Komment → Direct’ga avtomatik narx. Postlarga mahsulot “Instagram” bo‘limida biriktiriladi.</p></div></div>
    {status.missingEnv.length > 0 && <p className="ig-warn" role="alert">Vercel’da o‘rnatilmagan: {status.missingEnv.join(", ")}. Yo‘riqnoma: docs/instagram-setup.md</p>}
    {!status.vault && <p className="ig-warn" role="alert">PASSWORD_VIEW_KEY o‘rnatilmagan — token shifrlab saqlanadi, usiz ulab bo‘lmaydi.</p>}
    {account ? <dl className="ig-facts">
      <div><dt>Akkaunt</dt><dd><a href={`https://instagram.com/${account.username}`} target="_blank" rel="noreferrer">@{account.username}</a></dd></div>
      <div><dt>Token muddati</dt><dd className={daysLeft < 10 ? "is-bad" : ""}>{date(account.tokenExpiresAt)} · {daysLeft} kun qoldi{!account.tokenReadable && " · o‘qib bo‘lmadi, qayta ulang"}</dd></div>
      <div><dt>Webhook</dt><dd className={account.webhookError ? "is-bad" : ""}>{account.webhookError ? `Xato: ${account.webhookError}` : account.webhookSubscribedAt ? `Obuna (comments, messages) · ${date(account.webhookSubscribedAt)}` : "Obuna yo‘q"}</dd></div>
      <div><dt>Oxirgi hodisa</dt><dd>{account.lastWebhookAt ? date(account.lastWebhookAt) : "Hali kelmagan"}</dd></div>
    </dl> : <p className="bk-muted">Akkaunt ulanmagan. Instagram professional (Business / Creator) akkauntingiz bilan kiring.</p>}
    <div className="bk-actions">
      <button type="button" className="bk-btn is-primary" disabled={!!busy || status.missingEnv.length > 0 || !status.vault} onClick={() => run("connect", connectInstagramAction)}><BusyLabel busy={busy === "connect"} busyText="Yo‘naltirilmoqda…">{account ? "Qayta ulash" : "Instagram’ni ulash"}</BusyLabel></button>
      {account && <>
        <button type="button" className="bk-btn" disabled={!!busy} onClick={() => run("refresh", refreshInstagramTokenAction)}><BusyLabel busy={busy === "refresh"} busyText="Yangilanmoqda…">Tokenni yangilash</BusyLabel></button>
        <button type="button" className="bk-btn" disabled={!!busy} onClick={() => run("webhook", resubscribeWebhookAction)}><BusyLabel busy={busy === "webhook"} busyText="Ulanmoqda…">Webhookni qayta ulash</BusyLabel></button>
        <button type="button" className="bk-btn is-danger-ghost" disabled={!!busy} onClick={() => run("disconnect", disconnectInstagramAction, `@${account.username} uzilsinmi? Avto-javoblar to‘xtaydi (post sozlamalari va jurnal saqlanadi).`)}><BusyLabel busy={busy === "disconnect"} busyText="Uzilmoqda…">Uzish</BusyLabel></button>
      </>}
    </div>
    <p className="bk-muted">Token har kuni tekshiriladi va muddati tugashiga 20 kun qolganda avtomatik yangilanadi.</p>
    {message && <p className={message.ok ? "ig-ok" : "ig-error"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
  </section>;
}
