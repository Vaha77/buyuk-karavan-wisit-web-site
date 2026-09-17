"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, MessageSquare, Minus, Send, UserRound, X } from "lucide-react";
import { fieldLabels, fieldOrder, suggestions } from "./madina-mock-flow";
import { useMadinaChat } from "./use-madina-chat";
import type { LeadField } from "./madina-types";

type View = "greeting" | "minimized" | "open";
const greetingKey = "buyuk-karavan-madina-greeting-dismissed";

function Avatar({ small = false }: { small?: boolean }) {
  return <span className={`madina-avatar${small ? " madina-avatar-small" : ""}`} aria-hidden="true"><UserRound size={small ? 15 : 19} strokeWidth={1.5}/><i/></span>;
}

function ChatContent({ onMinimize, onClose }: { onMinimize: () => void; onClose: () => void }) {
  const { messages, lead, stage, typing, send, chooseEdit, edit, confirm, reset } = useMadinaChat();
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousStage = useRef(stage);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [messages, typing, stage]);
  useEffect(() => {
    if (previousStage.current !== stage && stage !== "confirm" && stage !== "edit" && stage !== "success") inputRef.current?.focus({ preventScroll: true });
    previousStage.current = stage;
  }, [stage]);

  const submit = () => { if (send(input)) setInput(""); };
  const quick = stage === "requestType" && messages.length === 1 ? suggestions.requestType : suggestions[stage as LeadField];

  return <section className="madina-chat" role="dialog" aria-label="Madina AI bilan suhbat" aria-modal="false">
    <header className="madina-chat-header">
      <Avatar small/>
      <div className="madina-header-copy"><strong>Madina</strong><span><i/> BUYUK KARAVAN · Online</span></div>
      <div className="madina-header-actions">
        <button type="button" onClick={onMinimize} aria-label="Suhbatni kichraytirish"><Minus size={17}/></button>
        <button type="button" onClick={onClose} aria-label="Suhbatni yopish"><X size={17}/></button>
      </div>
    </header>
    <div className="madina-chat-body" aria-live="polite" aria-relevant="additions text">
      {messages.map(message => <div className={`madina-message-row ${message.role}`} key={message.id}>
        {message.role === "madina" && <Avatar small/>}
        <div className="madina-bubble">{message.text}</div>
      </div>)}
      {typing && <div className="madina-message-row madina"><Avatar small/><div className="madina-bubble madina-typing" aria-label="Madina yozmoqda"><i/><i/><i/></div></div>}
      {!typing && stage === "confirm" && <div className="madina-confirmation"><h3>Ma’lumotlarni tekshirib oling</h3><dl>{fieldOrder.map(field => <div key={field}><dt>{fieldLabels[field]}</dt><dd>{lead[field] || "—"}</dd></div>)}</dl><div className="madina-confirm-actions"><button type="button" onClick={confirm}>Tasdiqlash</button><button type="button" onClick={edit}>O‘zgartirish</button></div></div>}
      {!typing && stage === "edit" && <div className="madina-quick-actions madina-edit-actions">{fieldOrder.map(field => <button type="button" key={field} onClick={() => chooseEdit(field)}>{fieldLabels[field]}</button>)}</div>}
      {!typing && stage === "success" && <div className="madina-success"><Check size={19} aria-hidden="true"/><span>So‘rov tayyor</span><button type="button" onClick={reset}>Yangi savol boshlash</button></div>}
      {!typing && quick && stage !== "edit" && stage !== "confirm" && stage !== "success" && <div className="madina-quick-actions">{quick.map(action => <button type="button" key={action} onClick={() => send(action)}>{action}</button>)}</div>}
      <div ref={bottom}/>
    </div>
    <form className="madina-input-wrap" onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="madina-input-shell"><Avatar small/><textarea ref={inputRef} rows={1} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="Savolingizni yozing..." aria-label="Madina uchun xabar" disabled={typing || stage === "confirm" || stage === "edit" || stage === "success"}/><button type="submit" aria-label="Xabarni yuborish" disabled={typing || !input.trim() || stage === "confirm" || stage === "edit" || stage === "success"}><Send size={17}/></button></div>
    </form>
  </section>;
}

export function MadinaWidget() {
  const pathname = usePathname();
  const [view, setView] = useState<View>("greeting");
  const [hasOpened, setHasOpened] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (sessionStorage.getItem(greetingKey) === "1") setView("minimized"); });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const open = () => { setHasOpened(true); setView("open"); };
    window.addEventListener("madina:open", open);
    return () => window.removeEventListener("madina:open", open);
  }, []);
  useEffect(() => {
    if (view !== "open" || isAdmin) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setView("minimized"); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [view, isAdmin]);
  useEffect(() => {
    if (!mobile || view !== "open" || isAdmin) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const viewport = window.visualViewport;
    const updateViewport = () => setKeyboardOffset(viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0);
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    return () => { document.body.style.overflow = previous; setKeyboardOffset(0); viewport?.removeEventListener("resize", updateViewport); viewport?.removeEventListener("scroll", updateViewport); };
  }, [mobile, view, isAdmin]);

  if (isAdmin) return null;
  const dismiss = () => { sessionStorage.setItem(greetingKey, "1"); setView("minimized"); };
  const open = () => { setHasOpened(true); setView("open"); };
  return <div className={`madina-widget madina-view-${view}`} style={{ "--madina-keyboard": `${keyboardOffset}px` } as React.CSSProperties}>
    {hasOpened && <div hidden={view !== "open"}><ChatContent onMinimize={() => setView("minimized")} onClose={dismiss}/></div>}
    {view !== "open" && <>
      {view === "greeting" && <div className="madina-greeting"><button className="madina-greeting-main" type="button" onClick={open} aria-label="Madina bilan suhbatni boshlash"><Avatar/><span><strong>Madina 👋</strong><span>Assalomu alaykum!<br/>Sizga nima yordam bera olaman?</span></span></button><button className="madina-greeting-close" type="button" onClick={dismiss} aria-label="Salomlashuvni yopish"><X size={15}/></button></div>}
      <button className="madina-launcher" type="button" onClick={open} aria-label="Madina AI suhbatini ochish"><MessageSquare size={23} strokeWidth={1.7}/></button>
    </>}
  </div>;
}
