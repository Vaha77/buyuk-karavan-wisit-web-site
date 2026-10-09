"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUserTelegramLinkAction, unlinkUserTelegramAction } from "./actions";

/** WORKSHOP row: "✅ Telegram ulangan" + "Uzish", or "Telegram bog‘lash" → a one-time t.me link to hand to the person. */
export function WorkshopTelegramCell({ userId, linked }: { userId: string; linked: boolean }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const makeLink = () => startTransition(async () => {
    setError(""); setCopied(false);
    const result = await createUserTelegramLinkAction(userId);
    if (!result.ok) { setError(result.error); return; }
    setLink(result.url ?? `/start ${result.code}`);
  });
  const unlink = () => startTransition(async () => {
    setError("");
    const result = await unlinkUserTelegramAction(userId);
    if (!result.ok) { setError(result.error); return; }
    setLink(null); router.refresh();
  });
  const copy = async () => { if (!link) return; try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } };
  return <div className="admin-user-seller" style={{ display: "grid", gap: 4, fontSize: 12 }}>
    {linked
      ? <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><b style={{ color: "#1B6B43" }}>✅ Telegram ulangan</b><button type="button" className="admin-user-button is-danger" onClick={unlink} disabled={pending}>{pending ? "…" : "Uzish"}</button></span>
      : <button type="button" className="admin-user-button" onClick={makeLink} disabled={pending}>{pending ? "Tayyorlanmoqda…" : "Telegram bog‘lash"}</button>}
    {link && <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {link.startsWith("http") ? <a href={link} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>{link}</a> : <code>{link}</code>}
      <button type="button" className="admin-user-button" onClick={copy}>{copied ? "Nusxalandi ✓" : "Nusxalash"}</button>
      <small style={{ color: "#5B6B82" }}>Seh mas’uliga yuboring · 15 daqiqa amal qiladi · u botda START bosadi</small>
    </span>}
    {error && <span role="alert" style={{ color: "#B42318" }}>{error}</span>}
  </div>;
}
