"use client";

import { useRef, useState } from "react";
import { CheckCircle2, MessageCircle, Phone, Send } from "lucide-react";
import { submitLandingLeadAction } from "@/app/lead-actions";
import { newMetaEventId, trackMeta } from "@/components/tracking/meta-pixel";
import { trackGa } from "@/components/tracking/google-analytics";
import { UZ_REGIONS, checkLandingInput, formatLocalPhone, localDigits } from "@/lib/leads/landing-rules";

const freshKey = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? `landing-${crypto.randomUUID()}` : `landing-${Date.now()}-${Math.random().toString(36).slice(2)}`;
type Field = "customerName" | "regionCode" | "phone";
type Props = { productSlug: string; productName: string; handoff: string | null; phone: { label: string; href: string }; telegram: string | null; priceBefore: string | null };

/**
 * The lead page form (Ism · Viloyat · +998 telefon → "Narxini bilish"). After sending, the page stays and the form is
 * replaced by the thank-you card with the live price and the contact buttons; no redirect.
 */
export function LandingForm({ productSlug, productName, handoff, phone, telegram, priceBefore }: Props) {
  const [name, setName] = useState(""), [regionCode, setRegion] = useState(""), [digits, setDigits] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({}), [error, setError] = useState("");
  const [pending, setPending] = useState(false), [done, setDone] = useState<{ name: string; price: string | null } | null>(null);
  const key = useRef(freshKey()), eventId = useRef(newMetaEventId());

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const checked = checkLandingInput({ customerName: name, regionCode, phone: digits });
    if (!checked.ok) { setErrors({ [checked.field]: checked.error }); document.getElementById(`landing-${checked.field}`)?.focus(); return; }
    setErrors({}); setError(""); setPending(true);
    try {
      const form = new FormData(event.currentTarget);
      const result = await submitLandingLeadAction({ productSlug, customerName: name, regionCode, phone: digits, handoff, website: String(form.get("website") || ""), idempotencyKey: key.current, metaEventId: eventId.current });
      if (!result.ok) { if (result.field) setErrors({ [result.field]: result.error }); else setError(result.error); return; }
      if (!result.repeat) { trackMeta("Lead", { content_name: productName }, eventId.current); trackGa("generate_lead", { form: "landing", product: productName }); }
      setDone({ name: result.customerName, price: result.priceText ?? priceBefore });
    } catch {
      setError("So‘rovni yuborib bo‘lmadi. Internet aloqasini tekshirib, qayta urinib ko‘ring.");
    } finally { setPending(false); }
  }

  if (done) return <div className="landing-card landing-done" role="status" aria-live="polite">
    <span className="landing-done-icon"><CheckCircle2 size={26} aria-hidden="true"/></span>
    <h2>Rahmat, {done.name}! Mutaxassisimiz tez orada qo‘ng‘iroq qiladi</h2>
    <div className="landing-price"><small>Narxi</small>{done.price ? <><strong>{done.price}</strong><span>Prays bo‘yicha, CBU kursida</span></> : <strong className="is-ask">Narxni mutaxassis aytadi</strong>}</div>
    <div className="landing-actions">
      <a className="landing-btn is-primary" href={phone.href}><Phone size={17} aria-hidden="true"/>Qo‘ng‘iroq qilish</a>
      {telegram && <a className="landing-btn" href={telegram} target="_blank" rel="noreferrer"><Send size={17} aria-hidden="true"/>Telegram</a>}
      <button type="button" className="landing-btn" onClick={() => window.dispatchEvent(new Event("madina:open"))}><MessageCircle size={17} aria-hidden="true"/>Madina AI</button>
    </div>
  </div>;

  const invalid = (field: Field) => errors[field] ? { "aria-invalid": true, "aria-describedby": `landing-${field}-error` } : {};
  return <form className="landing-card landing-form" onSubmit={submit} noValidate aria-label="Narxini bilish">
    <p className="landing-form-title">Narxini bilish uchun ma’lumot qoldiring</p>
    <label className="landing-field"><span>Ismingiz</span>
      <input id="landing-customerName" value={name} onChange={event => setName(event.target.value)} autoComplete="given-name" maxLength={80} placeholder="Ismingiz" disabled={pending} {...invalid("customerName")}/>
      {errors.customerName && <small id="landing-customerName-error" role="alert">{errors.customerName}</small>}
    </label>
    <label className="landing-field"><span>Viloyat</span>
      <select id="landing-regionCode" value={regionCode} onChange={event => setRegion(event.target.value)} disabled={pending} {...invalid("regionCode")}>
        <option value="">Viloyatni tanlang</option>
        {UZ_REGIONS.map(region => <option key={region.code} value={region.code}>{region.name}</option>)}
      </select>
      {errors.regionCode && <small id="landing-regionCode-error" role="alert">{errors.regionCode}</small>}
    </label>
    <label className="landing-field"><span>Telefon</span>
      <span className="landing-phone"><b aria-hidden="true">+998</b><input id="landing-phone" value={formatLocalPhone(digits)} onChange={event => setDigits(localDigits(event.target.value))} inputMode="tel" autoComplete="tel-national" placeholder="90 123 45 67" aria-label="Telefon raqami, +998 dan keyin" disabled={pending} {...invalid("phone")}/></span>
      {errors.phone && <small id="landing-phone-error" role="alert">{errors.phone}</small>}
    </label>
    <input className="landing-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"/>
    {error && <p className="landing-error" role="alert">{error}</p>}
    <button type="submit" className="landing-submit" disabled={pending}>{pending ? "Yuborilmoqda…" : "Narxini bilish"}</button>
  </form>;
}
