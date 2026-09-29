/* eslint-disable @next/next/no-img-element -- local object URLs and signed in-memory previews are not optimizer URLs */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ImagePlus, RefreshCw, Send, Sparkles, X } from "lucide-react";
import type { ProductAgentStatus } from "@/lib/ai-office/product-agent";

type Choice = { id: string; name: string; model: string; category: string; hasMainImage: boolean; recommended: boolean };
type PreviewItem = { placement: "main" | "gallery"; width: number; height: number; original: string; image: string };
type Preview = { product: { id: string; name: string; model: string; category: string }; previousMainImage: string | null; items: PreviewItem[] };
type Message = { role: "user" | "assistant"; content: string; attachments?: string[] };
type Phase = "idle" | "reading" | "processing" | "awaiting" | "saving" | "saved";
type Props = { open: boolean; onClose: () => void; status: ProductAgentStatus; onStatus: (status: ProductAgentStatus) => void };
const MAX_FILES = 6, MAX_BYTES = 10 * 1024 * 1024, BUDGET_SECONDS = 90;
const PHASE_LABEL: Record<Phase, string> = { idle: "Tayyor", reading: "O‘qilmoqda", processing: "Ishlov berilmoqda", awaiting: "Tasdiq kutilmoqda", saving: "Saqlanmoqda", saved: "Saqlandi" };

function useObjectUrls(files: File[]) {
  const urls = useMemo(() => files.map(file => URL.createObjectURL(file)), [files]);
  useEffect(() => () => urls.forEach(url => URL.revokeObjectURL(url)), [urls]);
  return urls;
}

export function FotoAgentChat({ open, onClose, status, onStatus }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null), galleryRef = useRef<HTMLInputElement>(null), endRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Assalomu alaykum, Vaha. Mahsulot rasmini yuboring va modelini yozing, masalan: “br +20pg”. Oq fonli katalog rasmini tayyorlab, tasdiqlaganingizdan keyin mahsulotga saqlayman." }]);
  const [input, setInput] = useState(""), [files, setFiles] = useState<File[]>([]), [error, setError] = useState("");
  const [sent, setSent] = useState<{ message: string; files: File[] } | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]), [preview, setPreview] = useState<Preview | null>(null), [token, setToken] = useState("");
  const [phase, setPhase] = useState<Phase>("idle"), [elapsed, setElapsed] = useState(0), [savedProductId, setSavedProductId] = useState("");
  const busy = phase === "reading" || phase === "processing" || phase === "saving";
  const pendingThumbs = useObjectUrls(files), sentThumbs = useObjectUrls(sent?.files ?? []);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: "end" }); }, [open, messages, choices, preview, phase]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close);
  }, [open, busy, onClose]);
  useEffect(() => {
    if (phase !== "reading" && phase !== "processing") return;
    const started = Date.now();
    const timer = window.setInterval(() => { const seconds = Math.round((Date.now() - started) / 1000); setElapsed(seconds); if (seconds >= 2) setPhase(current => current === "reading" ? "processing" : current); }, 500);
    return () => window.clearInterval(timer);
  }, [phase]);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...files, ...Array.from(list)];
    if (next.length > MAX_FILES) { setError(`Bir xabarda ko‘pi bilan ${MAX_FILES} ta rasm.`); return; }
    if (next.some(file => file.size > MAX_BYTES)) { setError("Har bir rasm 10 MB dan oshmasin."); return; }
    setFiles(next); setError("");
  };

  const request = async (message: string, images: File[], productId?: string) => {
    setError(""); setChoices([]); setPreview(null); setToken(""); setElapsed(0); setPhase("reading"); onStatus("reading");
    const form = new FormData(); form.set("message", message); images.forEach(file => form.append("images", file)); if (productId) form.set("productId", productId);
    try {
      const response = await fetch("/api/admin/ai-office/photo-agent", { method: "POST", body: form });
      const body = await response.json().catch(() => ({})) as { reply?: string; error?: string; question?: { choices: Choice[] }; preview?: Preview; previewToken?: string };
      if (!response.ok || !body.reply) throw new Error(body.error || "Foto agent javob bera olmadi.");
      setMessages(current => [...current, { role: "assistant", content: body.reply! }]);
      if (body.question?.choices.length) { setChoices(body.question.choices); setPhase("idle"); onStatus("idle"); }
      else if (body.preview && body.previewToken) { setPreview(body.preview); setToken(body.previewToken); setPhase("awaiting"); onStatus("awaiting_confirmation"); }
      else { setPhase("idle"); onStatus("idle"); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Foto agent javob bera olmadi."); setPhase("idle"); onStatus("error"); }
  };

  const send = async () => {
    const message = input.trim(); if (busy || (!message && !files.length)) return;
    const images = files;
    setMessages(current => [...current, { role: "user", content: message || "(izohsiz rasm)", attachments: images.map(file => file.name) }]);
    setSent({ message, files: images }); setInput(""); setFiles([]); setSavedProductId("");
    await request(message, images);
  };
  const choose = async (choice: Choice) => {
    if (!sent || busy) return;
    setMessages(current => [...current, { role: "user", content: `${choice.name} · ${choice.model}` }]);
    await request(sent.message, sent.files, choice.id);
  };
  const reprocess = async () => { if (sent && preview && !busy) await request(sent.message, sent.files, preview.product.id); };
  const cancel = () => { setPreview(null); setToken(""); setChoices([]); setPhase("idle"); onStatus("idle"); setMessages(current => [...current, { role: "assistant", content: "Bekor qilindi. Bazada hech narsa o‘zgarmadi." }]); };

  const confirm = async () => {
    if (!preview || !token || busy) return;
    setPhase("saving"); onStatus("writing"); setError("");
    try {
      for (let index = 0; index < preview.items.length; index++) {
        setElapsed(index);
        const response = await fetch("/api/admin/ai-office/photo-agent/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewToken: token, confirmationAction: "confirm-photo-preview", index, image: preview.items[index].image }) });
        const body = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(`${index ? `${index} ta rasm saqlandi. ` : ""}${body.error || "Saqlab bo‘lmadi."}`);
      }
      const main = preview.items.some(item => item.placement === "main");
      setMessages(current => [...current, { role: "assistant", content: `✅ Saqlandi: ${preview.product.name} · ${preview.product.model} — ${preview.items.length} ta rasm (${main ? "1-rasm asosiy" : "galereyaga"}).` }]);
      setSavedProductId(preview.product.id); setPreview(null); setToken(""); setSent(null); setPhase("saved"); onStatus("success");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Saqlab bo‘lmadi."); setPhase("awaiting"); onStatus("error"); }
  };

  if (!open) return null;
  const headerLabel = phase === "idle" && status === "error" ? "Xatolik" : phase === "processing" ? `${PHASE_LABEL.processing} · ${elapsed} s` : phase === "saving" && preview ? `${PHASE_LABEL.saving} ${Math.min(elapsed + 1, preview.items.length)}/${preview.items.length}` : PHASE_LABEL[phase];
  return <div className="product-agent-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="product-agent-chat photo-agent-chat" role="dialog" aria-modal="true" aria-labelledby="photo-agent-title">
      <header><span className="product-agent-avatar"><Camera size={20}/></span><div><h2 id="photo-agent-title">Foto agent · 02</h2><span><i className={`is-${busy ? "analyzing" : status}`}/> {headerLabel}</span></div><button type="button" onClick={onClose} disabled={busy} aria-label="Chatni yopish"><X size={20}/></button></header>
      <div className="product-agent-messages" aria-live="polite">
        {messages.map((message, index) => <article className={`is-${message.role}`} key={`${message.role}-${index}`}><p>{message.content}</p>{message.attachments?.map(name => <small key={name}><ImagePlus size={13}/>{name}</small>)}</article>)}
        {choices.length > 0 && <section className="photo-agent-choices" aria-label="Mahsulotni tanlang">{choices.map(choice => <button type="button" key={choice.id} onClick={() => void choose(choice)} disabled={busy} className={choice.recommended ? "is-recommended" : ""}>{choice.recommended && <em><Sparkles size={12}/>Rasmga ko‘ra tavsiya</em>}<strong>{choice.name}</strong><span>{choice.model} · {choice.category} · {choice.hasMainImage ? "asosiy rasm bor → galereyaga" : "asosiy rasm yo‘q → asosiy"}</span></button>)}</section>}
        {(phase === "reading" || phase === "processing") && <section className="photo-agent-progress" role="status"><strong>{phase === "reading" ? "Rasm o‘qilmoqda…" : "Orqa fon olib tashlanmoqda, oq fon, markazlash, 1500px…"}</strong><div><i style={{ width: `${Math.min(95, Math.round((elapsed / BUDGET_SECONDS) * 100))}%` }}/></div><small>{elapsed} s · odatda 30–60 s, ko‘pi bilan {BUDGET_SECONDS} s</small></section>}
        {preview && <section className="photo-agent-preview" aria-label="Rasm preview">
          <h3>{preview.product.name}<small>{preview.product.model} · {preview.product.category}</small></h3>
          {preview.items.map((item, index) => <div className="photo-agent-pair" key={index}>
            <figure><figcaption>Oldin</figcaption>{sentThumbs[index] ? <img src={sentThumbs[index]} alt={`${item.original} — asl rasm`}/> : <span>{item.original}</span>}</figure>
            <figure><figcaption>Keyin</figcaption><img src={`data:image/png;base64,${item.image}`} alt={`${preview.product.name} — tayyor rasm ${index + 1}`}/></figure>
            <p className={item.placement === "main" ? "is-main" : ""}>{item.placement === "main" ? (preview.previousMainImage ? "Asosiy rasm bo‘ladi · eskisi galereyaga o‘tadi" : "Asosiy rasm bo‘ladi") : "Galereyaga qo‘shiladi"} · {item.width}×{item.height}</p>
          </div>)}
          <button type="button" className="photo-agent-confirm" onClick={() => void confirm()} disabled={busy}><Check size={20}/>{phase === "saving" ? "Saqlanmoqda…" : "Tasdiqlash"}</button>
          <div className="photo-agent-secondary"><button type="button" onClick={() => void reprocess()} disabled={busy}><RefreshCw size={16}/>Qayta ishlash</button><button type="button" onClick={cancel} disabled={busy}><X size={16}/>Bekor qilish</button></div>
        </section>}
        {phase === "saved" && savedProductId && <p className="photo-agent-saved"><Check size={16}/>Saqlandi · <a href={`/admin/products/${savedProductId}/edit`}>Mahsulotni ochish</a></p>}
        <div ref={endRef}/>
      </div>
      {files.length > 0 && <div className="photo-agent-thumbs">{files.map((file, index) => <span key={`${file.name}-${index}`}><img src={pendingThumbs[index]} alt={file.name}/><button type="button" aria-label={`${file.name} rasmini olib tashlash`} onClick={() => setFiles(current => current.filter((_, item) => item !== index))}><X size={12}/></button></span>)}</div>}
      {error && <p className="product-agent-error" role="alert">{error}</p>}
      <footer><div>
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy} aria-label="Kamera bilan suratga olish"><Camera size={19}/></button>
        <button type="button" onClick={() => galleryRef.current?.click()} disabled={busy} aria-label="Galereyadan rasm tanlash"><ImagePlus size={19}/></button>
        <textarea rows={2} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Model: br +20pg" disabled={busy} enterKeyHint="send"/>
        <button className="is-send" type="button" onClick={() => void send()} disabled={busy || (!input.trim() && !files.length)} aria-label="Yuborish"><Send size={18}/></button>
      </div><small>1–6 ta rasm · JPG, PNG, WEBP, HEIC · har biri 10 MB gacha</small>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={event => { addFiles(event.target.files); event.target.value = ""; }}/>
        <input ref={galleryRef} type="file" accept="image/*" multiple onChange={event => { addFiles(event.target.files); event.target.value = ""; }}/>
      </footer>
    </section>
  </div>;
}
