/* eslint-disable @next/next/no-img-element -- the QR code is a locally generated data URL */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { checkSlugAction, createLinkAction, updateLinkAction } from "@/app/admin/(protected)/links/actions";
import { REFERRAL_SOURCES, SOURCE_LABELS, suggestSlug, TARGETS, type ReferralSourceKey } from "@/lib/referrals/rules";
import { CopyButton, SourceIcon } from "./bits";

type Initial = { id: string; name: string; source: ReferralSourceKey; slug: string; targetPath: string; cost: string; costCurrency: "USD" | "UZS"; ownerAgentId: string };
type Props = { initial?: Initial; siteHost: string; agents: Array<{ id: string; name: string }>; products: Array<{ slug: string; label: string }> };

export function LinkForm({ initial, siteHost, agents, products }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? ""), [source, setSource] = useState<ReferralSourceKey>(initial?.source ?? "YOUTUBE");
  const [slug, setSlug] = useState(initial?.slug ?? ""), [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const initialTarget = initial ? (TARGETS.find(target => target.path === initial.targetPath)?.key ?? (initial.targetPath.startsWith("/products/") ? "product" : "home")) : "form";
  const [target, setTarget] = useState<string>(initialTarget), [productSlug, setProductSlug] = useState(initial?.targetPath.startsWith("/products/") ? initial.targetPath.slice(10) : "");
  const [cost, setCost] = useState(initial?.cost ?? ""), [currency, setCurrency] = useState<"USD" | "UZS">(initial?.costCurrency ?? "USD"), [owner, setOwner] = useState(initial?.ownerAgentId ?? "");
  const [available, setAvailable] = useState<boolean | null>(null), [error, setError] = useState(""), [qr, setQr] = useState("");
  const [pending, startTransition] = useTransition();

  const effectiveSlug = slugTouched ? slug : suggestSlug(name);
  const targetPath = target === "product" ? (productSlug ? `/products/${productSlug}` : "") : TARGETS.find(item => item.key === target)?.path ?? "/";
  const url = `${siteHost}/r/${effectiveSlug || "…"}`;
  const valid = name.trim().length >= 3 && /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(effectiveSlug) && !!targetPath && available !== false;

  // Live uniqueness check (debounced).
  useEffect(() => {
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(effectiveSlug)) return;
    let active = true;
    const timer = window.setTimeout(() => { void checkSlugAction(effectiveSlug, initial?.id).then(result => { if (active) setAvailable(result); }); }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [effectiveSlug, initial?.id]);
  useEffect(() => {
    let active = true;
    if (effectiveSlug) void QRCode.toDataURL(`https://${siteHost}/r/${effectiveSlug}`, { margin: 1, width: 360, color: { dark: "#0F1E33", light: "#FFFFFF" } }).then(data => { if (active) setQr(data); });
    return () => { active = false; };
  }, [effectiveSlug, siteHost]);
  const slugStatus = useMemo(() => !effectiveSlug ? "" : !/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(effectiveSlug) ? "3–40 belgi: a–z, 0–9 va chiziqcha" : available === false ? "Bu nom band" : available ? "Bo‘sh" : "", [effectiveSlug, available]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || pending) return;
    const input = { name, source, slug: effectiveSlug, targetPath, cost, costCurrency: currency, ownerAgentId: owner };
    startTransition(async () => {
      setError("");
      const result = initial ? await updateLinkAction(initial.id, input) : await createLinkAction(input);
      if (!result.ok) { setError(result.error); return; }
      router.push(`/admin/links/${result.id}`);
    });
  };

  return <div className="bk-form-layout">
    <form onSubmit={submit} noValidate>
      <div><h1>{initial ? "Linkni tahrirlash" : "Yangi referal link"}</h1><p className="bk-muted">Link qayerga joylashtirilishini belgilang — natijalar shu nom bilan ko‘rinadi</p></div>
      <label className="bk-field"><span>Link nomi</span><input value={name} onChange={event => setName(event.target.value)} placeholder="YouTube — MrBeast videosi" maxLength={120} required/></label>
      <div className="bk-field"><span id="bk-source-label">Manba</span><div className="bk-tiles-pick" role="group" aria-labelledby="bk-source-label">
        {REFERRAL_SOURCES.map(key => <button type="button" key={key} aria-pressed={source === key} onClick={() => setSource(key)}><SourceIcon source={key}/>{SOURCE_LABELS[key]}</button>)}
      </div></div>
      <div className="bk-row">
        <label className="bk-field"><span>Qaysi sahifaga olib boradi</span><select value={target} onChange={event => setTarget(event.target.value)}>{TARGETS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}<option value="product">Aniq mahsulot</option></select></label>
        <label className="bk-field"><span>Qisqa nom</span><span className="bk-prefix"><span>/r/</span><input value={effectiveSlug} onChange={event => { setSlugTouched(true); setAvailable(null); setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} maxLength={40} aria-invalid={available === false} aria-describedby="bk-slug-status" required/></span><small id="bk-slug-status" className={`bk-status-line ${available === false || slugStatus.startsWith("3") ? "is-bad" : "is-ok"}`} aria-live="polite">{slugStatus}</small></label>
      </div>
      {target === "product" && <label className="bk-field"><span>Mahsulot</span><select value={productSlug} onChange={event => setProductSlug(event.target.value)} required><option value="">Mahsulotni tanlang</option>{products.map(product => <option key={product.slug} value={product.slug}>{product.label}</option>)}</select></label>}
      <div className="bk-row">
        <label className="bk-field"><span>Xarajat (ixtiyoriy)</span><input inputMode="decimal" value={cost} onChange={event => setCost(event.target.value.replace(/[^\d.,]/g, ""))} placeholder="500"/></label>
        <label className="bk-field"><span>Valyuta</span><select value={currency} onChange={event => setCurrency(event.target.value as "USD" | "UZS")}><option value="USD">USD</option><option value="UZS">UZS</option></select></label>
        <label className="bk-field"><span>Mas’ul sotuvchi</span><select value={owner} onChange={event => setOwner(event.target.value)}><option value="">Avtomatik taqsimlash</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
      </div>
      {error && <p className="bk-note is-soft" role="alert">{error}</p>}
      <div className="bk-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="bk-btn" onClick={() => router.back()}>Bekor qilish</button><button type="submit" className="bk-btn is-primary" disabled={!valid || pending}>{pending ? "Saqlanmoqda…" : initial ? "Saqlash" : "Link yaratish"}</button></div>
    </form>
    <aside className="bk-form-side" aria-label="Tayyor link">
      <span className="bk-eyebrow">Tayyor link</span>
      <div className="bk-url-box"><strong>{url}</strong>{effectiveSlug ? <CopyButton text={`https://${siteHost}/r/${effectiveSlug}`} label="Nusxa olish"/> : null}</div>
      {qr && <div className="bk-qr"><img src={qr} alt={`${url} uchun QR-kod`}/><div><strong>QR-kod</strong><small>Banner, katalog, vizitka uchun</small><a href={qr} download={`bk-${effectiveSlug}.png`}>PNG yuklab olish</a></div></div>}
      <div><strong>Nimalar kuzatiladi</strong><ul><li>Klik va sahifada qolish vaqti</li><li>Ko‘rilgan mahsulotlar</li><li>Telefon, Telegram, Madina AI bosilishi</li><li>Zayavka va keyingi sotuv</li><li>Viloyat / davlat va qurilma</li></ul></div>
      <small style={{ marginTop: "auto" }}>Tashrifchi zayavka qoldirmaguncha anonim qoladi.</small>
    </aside>
  </div>;
}
