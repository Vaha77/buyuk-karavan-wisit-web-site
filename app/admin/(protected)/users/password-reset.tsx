"use client";
import { useState, useTransition } from "react";
import { Dialog } from "@/components/admin/bklead/dialog";
import { resetUserPasswordAction, sendTempPasswordTelegramAction } from "./actions";

type Step = { kind: "confirm" } | { kind: "done"; password: string; telegramLinked: boolean } | null;

/** "🔑 Parolni tiklash": confirm → the temporary password is shown once (copy / send to Telegram) → gone when closed. */
export function PasswordResetButton({ userId, name }: { userId: string; name: string }) {
  const [step, setStep] = useState<Step>(null);
  const [error, setError] = useState(""), [note, setNote] = useState(""), [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const close = () => { setStep(null); setError(""); setNote(""); setCopied(false); };
  const reset = () => startTransition(async () => {
    setError("");
    const result = await resetUserPasswordAction(userId);
    if (!result.ok) { setError(result.error); return; }
    setStep({ kind: "done", password: result.password, telegramLinked: result.telegramLinked });
  });
  const copy = async (password: string) => { try { await navigator.clipboard.writeText(password); setCopied(true); } catch { setCopied(false); } };
  const send = (password: string) => startTransition(async () => {
    setError(""); setNote("");
    const result = await sendTempPasswordTelegramAction(userId, password);
    if (result.ok) setNote("✅ Telegramga yuborildi"); else setError(result.error);
  });
  return <>
    <button type="button" className="admin-user-button is-outline" onClick={() => setStep({ kind: "confirm" })}>🔑 Parolni tiklash</button>
    {step?.kind === "confirm" && <Dialog title="Parolni tiklash" onClose={close} busy={pending}>
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ fontSize: 14 }}><b>{name}</b> uchun yangi parol yaratilsinmi?</p>
        <p className="bk-note">Eski parol ishlamay qoladi, foydalanuvchining barcha sessiyalari yopiladi. Keyingi kirishda u yangi parol o‘rnatishi shart.</p>
        {error && <p className="bk-note is-soft" role="alert">{error}</p>}
        <div className="bk-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="bk-btn" onClick={close} disabled={pending}>Yo‘q</button>
          <button type="button" className="bk-btn is-primary" onClick={reset} disabled={pending}>{pending ? "Yaratilmoqda…" : "Ha, yangi parol"}</button>
        </div>
      </div>
    </Dialog>}
    {step?.kind === "done" && <Dialog title={`${name} — vaqtinchalik parol`} onClose={close} busy={pending}>
      <div style={{ display: "grid", gap: 12 }}>
        <div className="admin-temp-password"><span>{step.password}</span><button type="button" className="bk-btn" onClick={() => copy(step.password)}>{copied ? "Nusxalandi ✓" : "Nusxalash"}</button></div>
        <p className="bk-note is-soft">⚠️ Oyna yopilgach qayta ko‘rinmaydi. Parolni foydalanuvchiga hoziroq bering — u kirgach o‘z parolini o‘rnatadi.</p>
        {step.telegramLinked && <button type="button" className="bk-btn" onClick={() => send(step.password)} disabled={pending}>{pending ? "Yuborilmoqda…" : "Telegramga yuborish"}</button>}
        {note && <p className="bk-note" role="status">{note}</p>}
        {error && <p className="bk-note is-soft" role="alert">{error}</p>}
        <div className="bk-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="bk-btn is-primary" onClick={close} disabled={pending}>Yopish</button></div>
      </div>
    </Dialog>}
  </>;
}
