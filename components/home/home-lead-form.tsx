"use client";

import { useRef, useState } from "react";
import { submitLeadAction } from "@/app/lead-actions";

type LeadFormProps = {
  compact?: boolean;
  initialProduct?: string;
};

export function HomeLeadForm({ compact = false, initialProduct = "" }: LeadFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    const data = new FormData(event.currentTarget);
    setStatus("submitting");
    setMessage("");
    const idempotencyKey = crypto.randomUUID();
    try {
      const result = await submitLeadAction({
        customerName: String(data.get("customerName") || ""),
        phone: String(data.get("phone") || ""),
        requestType: "Bepul loyiha hisob-kitobi",
        product: String(data.get("product") || initialProduct),
        capacity: String(data.get("capacity") || ""),
        temperature: String(data.get("temperature") || ""),
        notes: String(data.get("notes") || ""),
        source: "HOME_CTA",
        website: String(data.get("website") || ""),
        idempotencyKey,
      });
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error);
        return;
      }
      setStatus("success");
      setMessage("So‘rovingiz qabul qilindi. Mutaxassisimiz siz bilan bog‘lanadi.");
    } catch {
      setStatus("error");
      setMessage("So‘rov yuborilmadi. Iltimos, qayta urinib ko‘ring.");
    }
  }

  return (
    <form ref={formRef} className={`home-lead-form${compact ? " is-compact" : ""}`} onSubmit={submit} noValidate>
      <div className="home-lead-fields">
        <label><span>Ism *</span><input name="customerName" autoComplete="name" required maxLength={120} /></label>
        <label><span>Telefon *</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+998 91 637 77 77" required maxLength={40} /></label>
        <label><span>Mahsulot / yechim turi</span><input name="product" defaultValue={initialProduct} maxLength={200} /></label>
        <label><span>Sig‘im yoki tonna</span><input name="capacity" placeholder="Masalan: 100 tonna yoki 5 × 12 × 4 m" maxLength={120} /></label>
        {compact && <label><span>Kerakli harorat</span><input name="temperature" placeholder="Masalan: −18°C ... −5°C" maxLength={120} /></label>}
        <label className="is-wide"><span>Izoh</span><textarea name="notes" rows={compact ? 2 : 4} maxLength={2000} /></label>
      </div>
      <label className="home-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <button className="button button-blue" type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Yuborilmoqda…" : "So‘rov yuborish"}
      </button>
      {message && <p className={`home-form-message is-${status}`} role={status === "error" ? "alert" : "status"}>{message}</p>}
    </form>
  );
}

export function ContactSection() {
  return (
    <section className="home-contact-section" id="aloqa">
      <div className="container home-contact-layout">
        <div>
          <p className="eyebrow">Loyiha bo‘yicha maslahat</p>
          <h2>Bepul hisob-kitob oling</h2>
          <p>Loyihangiz haqida qisqacha ma’lumot qoldiring. Mutaxassisimiz siz bilan bog‘lanib, kerakli sovutish yechimini aniqlashga yordam beradi.</p>
        </div>
        <HomeLeadForm />
      </div>
    </section>
  );
}
