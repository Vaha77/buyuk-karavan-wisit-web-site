"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, FileText, Paperclip, Send, X } from "lucide-react";
import type { ProductAgentStatus } from "@/lib/ai-office/product-agent";
import type { PreviewPayload } from "@/lib/ai-office/product-agent-preview";

type Message = { role: "user" | "assistant"; content: string; attachments?: string[] };
type Props = { open: boolean; onClose: () => void; status: ProductAgentStatus; onStatus: (status: ProductAgentStatus) => void };
const ACCEPT = ".jpg,.jpeg,.png,.webp,.xlsx,.csv,.pdf,.docx";

export function ProductAgentChat({ open, onClose, status, onStatus }: Props) {
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Assalomu alaykum, Vaha. Mahsulot qo‘shish yoki mavjud mahsulotni yangilash uchun ma’lumot yuboring." }]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [previewToken, setPreviewToken] = useState("");
  const [result, setResult] = useState<{ counts: { created: number; updated: number; skipped: number; failed: number }; results: Array<{ name: string; model: string; action: string; price: string; link?: string; error?: string }> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "reading" || status === "analyzing" || status === "writing";

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: "end" }); }, [open, messages]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close);
  }, [open, onClose]);

  const addFiles = (next: FileList | null) => {
    if (!next) return;
    const combined = [...files, ...Array.from(next)].slice(0, 4);
    if (combined.some(file => file.size > 10 * 1024 * 1024)) { setError("Har bir fayl 10 MB dan oshmasin."); return; }
    if (combined.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) { setError("Umumiy hajm 20 MB dan oshmasin."); return; }
    setFiles(combined); setError("");
  };
  const send = async () => {
    const value = input.trim(); if (!value || busy) return;
    const outgoing: Message = { role: "user", content: value, attachments: files.map(file => file.name) };
    setMessages(current => [...current, outgoing]); setInput(""); setError(""); onStatus(files.length ? "reading" : "analyzing");
    const form = new FormData(); form.set("message", value); form.set("history", JSON.stringify(messages.slice(-12).map(({ role, content }) => ({ role, content })))); files.forEach(file => form.append("files", file)); setFiles([]);
    try {
      const response = await fetch("/api/admin/ai-office/product-agent", { method: "POST", body: form });
      const body = await response.json() as { reply?: string; error?: string; status?: ProductAgentStatus; preview?: PreviewPayload; previewToken?: string };
      if (!response.ok || !body.reply) throw new Error(body.error || "Agent javob bera olmadi.");
      setMessages(current => [...current, { role: "assistant", content: body.reply! }]); if (body.preview && body.previewToken) { setPreview(body.preview); setPreviewToken(body.previewToken); setResult(null); } onStatus(body.status || "success");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Agent javob bera olmadi."); onStatus("error"); }
  };
  const confirm = async () => {
    if (!preview || !previewToken || preview.rows.some(row => row.status === "TEKSHIRING") || busy) return;
    onStatus("writing"); setError("");
    try {
      const response = await fetch("/api/admin/ai-office/product-agent/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewToken, confirmationAction: "confirm-product-preview", agentId: "product-agent-01" }) });
      const body = await response.json() as typeof result & { error?: string }; if (!response.ok || !body?.counts || !body.results) throw new Error(body?.error || "Tasdiqlash bajarilmadi.");
      setResult({ counts: body.counts, results: body.results }); setPreview(null); setPreviewToken(""); setMessages(current => [...current, { role: "assistant", content: `Natija\nYaratildi: ${body.counts.created}\nYangilandi: ${body.counts.updated}\nO‘tkazib yuborildi: ${body.counts.skipped}\nXato: ${body.counts.failed}` }]); onStatus("idle");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Tasdiqlash bajarilmadi."); onStatus("error"); }
  };
  if (!open) return null;
  return <div className="product-agent-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="product-agent-chat" role="dialog" aria-modal="true" aria-labelledby="product-agent-title">
      <header><span className="product-agent-avatar"><Bot size={20}/></span><div><h2 id="product-agent-title">Mahsulot agenti · 01</h2><span><i className={`is-${status}`}/> {busy ? "Ishlamoqda" : status === "error" ? "Xatolik" : status === "awaiting_confirmation" ? "Tasdiq kutilmoqda" : "Tayyor"}</span></div><button type="button" onClick={onClose} aria-label="Chatni yopish"><X size={20}/></button></header>
      <div className="product-agent-messages" aria-live="polite">
        {messages.map((message, index) => <article className={`is-${message.role}`} key={`${message.role}-${index}`}><p>{message.content}</p>{message.attachments?.map(name => <small key={name}><FileText size={13}/>{name}</small>)}</article>)}
        {preview && <section className="product-agent-preview" aria-label="Mahsulotlar preview"><div className="product-agent-preview-scroll"><table><thead><tr><th>Nomi</th><th>Model</th><th>Kategoriya</th><th>Fayldagi narx</th><th>Ustama %</th><th>Yakuniy narx</th><th>Holat</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.id}><td>{row.name || "—"}</td><td>{row.model || "—"}</td><td>{row.categoryName || "—"}</td><td>{row.sourcePrice || "—"} {row.currency}</td><td>{row.markupPercent}%</td><td>{row.oldPrice && <small>{row.oldPrice} → </small>}{row.finalPrice || "—"}</td><td><span className={`is-${row.status === "TEKSHIRING" ? "check" : row.status === "YANGI" ? "new" : "existing"}`}>{row.status}</span></td></tr>)}</tbody></table></div><div className="product-agent-preview-actions"><p>{preview.rows.some(row => row.status === "TEKSHIRING") ? "TEKSHIRING qatorlarini aniqlashtiring. Tasdiqlash hozir bloklangan." : `Ustama: ${preview.rows[0]?.markupPercent || "0"}% · Yaxlitlash: ${preview.rows[0]?.rounding || "none"}`}</p><button type="button" onClick={() => void confirm()} disabled={busy || preview.rows.some(row => row.status === "TEKSHIRING")}>Tasdiqlash</button></div></section>}
        {result && <section className="product-agent-result"><strong>Natija</strong><p>Yaratildi: {result.counts.created} · Yangilandi: {result.counts.updated} · O‘tkazib yuborildi: {result.counts.skipped} · Xato: {result.counts.failed}</p>{result.results.map((item, index) => <div key={`${item.model}-${index}`}><span>{item.name} · {item.model} — {item.action} · ${item.price || "—"}</span>{item.link && <a href={item.link}>Mahsulotni ochish</a>}{item.error && <small>{item.error}</small>}</div>)}</section>}
        {busy && <article className="is-assistant is-typing" aria-label="Agent yozmoqda"><i/><i/><i/></article>}<div ref={endRef}/>
      </div>
      <div className="product-agent-attachments">{files.map((file, index) => <span key={`${file.name}-${index}`}><FileText size={13}/>{file.name}<button type="button" aria-label={`${file.name} faylini olib tashlash`} onClick={() => setFiles(current => current.filter((_, item) => item !== index))}><X size={12}/></button></span>)}</div>
      {error && <p className="product-agent-error" role="alert">{error}</p>}
      <footer><div><button type="button" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Fayl biriktirish"><Paperclip size={19}/></button><textarea rows={2} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Mahsulot ma’lumotini yozing..." disabled={busy}/><button className="is-send" type="button" onClick={() => void send()} disabled={busy || !input.trim()} aria-label="Xabarni yuborish"><Send size={18}/></button></div><small>JPG, PNG, WEBP, XLSX, CSV, PDF, DOCX · har biri 10 MB · jami 20 MB</small><input ref={fileRef} type="file" multiple accept={ACCEPT} onChange={event => { addFiles(event.target.files); event.target.value = ""; }}/></footer>
    </section>
  </div>;
}
