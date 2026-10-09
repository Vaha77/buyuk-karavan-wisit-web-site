"use client";
import { useState, useTransition } from "react";
import { Dialog } from "@/components/admin/bklead/dialog";
import { forceLogoutAllAction } from "./actions";

/** Ends everyone's sessions except yours (after a confirmation). */
export function ForceLogoutAllButton() {
  const [open, setOpen] = useState(false), [result, setResult] = useState(""), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const confirm = () => startTransition(async () => {
    setError("");
    const response = await forceLogoutAllAction();
    if (!response.ok) { setError(response.error); return; }
    setOpen(false); setResult(`✅ ${response.count} ta sessiya yopildi — hamma qaytadan kiradi.`);
  });
  return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 16 }}>
    <button type="button" className="admin-user-button is-danger" onClick={() => { setResult(""); setError(""); setOpen(true); }}>Hammani qayta kirishga majburlash</button>
    {result && <span role="status" style={{ color: "#1B6B43", fontWeight: 700, fontSize: 13 }}>{result}</span>}
    {open && <Dialog title="Hammani qayta kirishga majburlash" onClose={() => setOpen(false)} busy={pending}>
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ fontSize: 14 }}>Sizdan boshqa barcha foydalanuvchilar tizimdan chiqariladi va qaytadan kirishi kerak bo‘ladi. Davom etilsinmi?</p>
        {error && <p className="bk-note is-soft" role="alert">{error}</p>}
        <div className="bk-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="bk-btn" onClick={() => setOpen(false)} disabled={pending}>Yo‘q</button>
          <button type="button" className="bk-btn is-danger" onClick={confirm} disabled={pending}>{pending ? "Yopilmoqda…" : "Ha, hammani chiqarish"}</button>
        </div>
      </div>
    </Dialog>}
  </div>;
}
