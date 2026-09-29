"use client";

import { useId, useRef, useState } from "react";
import { submitLeadAction } from "@/app/lead-actions";
import type { HomeLeadOption } from "@/lib/home/lead-options";
import { LocationFields } from "@/components/leads/location-fields";

type LeadFormProps = {
  compact?: boolean;
  initialProduct?: string;
  initialTemperature?: string;
  initialCapacity?: string;
  options: HomeLeadOption[];
};

type FieldErrors = Partial<Record<"customerName" | "phone" | "product", string>>;

export function HomeLeadForm({ compact = false, initialProduct = "", initialTemperature = "", initialCapacity = "", options }: LeadFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const errorId = useId();
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    const data = new FormData(event.currentTarget);
    const nextErrors: FieldErrors = {};
    const name = String(data.get("customerName") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const product = String(data.get("product") || initialProduct).trim();
    if (!name) nextErrors.customerName = "Ismingizni kiriting.";
    if (!/^[+\d][\d\s().-]*$/.test(phone) || phone.replace(/\D/g, "").length < 9)
      nextErrors.phone = "Telefon raqamini tekshiring.";
    if (!product) nextErrors.product = "Mahsulot yoki yechim turini tanlang.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setStatus("error");
      setMessage("Belgilangan maydonlarni tekshiring.");
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setStatus("submitting");
    setMessage("");
    const idempotencyKey = crypto.randomUUID();
    try {
      const result = await submitLeadAction({
        customerName: name,
        phone,
        requestType: "Bepul loyiha hisob-kitobi",
        product,
        capacity: String(data.get("capacity") || initialCapacity),
        temperature: String(data.get("temperature") || initialTemperature),
        notes: String(data.get("notes") || ""),
        region: String(data.get("region") || ""),
        country: String(data.get("country") || "") || undefined,
        regionCode: String(data.get("regionCode") || ""),
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
        <label><span>Ism *</span><input name="customerName" autoComplete="name" required maxLength={120} aria-invalid={Boolean(errors.customerName)} aria-describedby={errors.customerName ? `${errorId}-name` : undefined} />{errors.customerName&&<small className="field-error" id={`${errorId}-name`}>{errors.customerName}</small>}</label>
        <label><span>Telefon *</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+998 91 637 77 77" required maxLength={40} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? `${errorId}-phone` : undefined} />{errors.phone&&<small className="field-error" id={`${errorId}-phone`}>{errors.phone}</small>}</label>
        <label><span>Mahsulot / yechim turi *</span><select name="product" defaultValue={initialProduct} required aria-invalid={Boolean(errors.product)} aria-describedby={errors.product ? `${errorId}-product` : undefined}><option value="">Tanlang</option>{options.map((option)=><option value={option.label} key={option.id}>{option.label}</option>)}</select>{errors.product&&<small className="field-error" id={`${errorId}-product`}>{errors.product}</small>}</label>
        {!compact&&<label><span>Sig‘im yoki tonna</span><input name="capacity" placeholder="Masalan: 100 tonna yoki 5 × 12 × 4 m" maxLength={120} /></label>}
        <LocationFields variant="home"/>
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

export function ContactSection({ options }: { options: HomeLeadOption[] }) {
  return (
    <section className="home-contact-section" id="aloqa">
      <div className="container home-contact-layout">
        <div>
          <p className="eyebrow">Loyiha bo‘yicha maslahat</p>
          <h2>Bepul hisob-kitob oling</h2>
          <p>Loyihangiz haqida qisqacha ma’lumot qoldiring. Mutaxassisimiz siz bilan bog‘lanib, kerakli sovutish yechimini aniqlashga yordam beradi.</p>
        </div>
        <HomeLeadForm options={options} />
      </div>
    </section>
  );
}
