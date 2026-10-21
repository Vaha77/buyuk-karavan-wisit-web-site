"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Send, UserRound, X } from "lucide-react";
import { fieldLabels, fieldOrder, suggestions } from "./madina-mock-flow";
import { useMadinaChat } from "./use-madina-chat";
import type { LeadField } from "./madina-types";

function Avatar({ small = false }: { small?: boolean }) {
  return <span className={`madina-avatar${small ? " madina-avatar-small" : ""}`} aria-hidden="true"><UserRound size={small ? 15 : 19} strokeWidth={1.5}/><i/></span>;
}

export function ChatContent({ onMinimize, onClose }: { onMinimize: () => void; onClose: () => void }) {
  const { messages, lead, stage, typing, submitting, submitError, send, chooseEdit, edit, confirm, reset } = useMadinaChat();
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
      {!typing && stage === "confirm" && <div className="madina-confirmation"><h3>Ma’lumotlarni tekshirib oling</h3><dl>{fieldOrder.map(field => <div key={field}><dt>{fieldLabels[field]}</dt><dd>{lead[field] || "—"}</dd></div>)}</dl>{submitError&&<p className="madina-submit-error" role="alert">{submitError}</p>}<div className="madina-confirm-actions"><button type="button" onClick={confirm} disabled={submitting}>{submitting?"Yuborilmoqda...":"Tasdiqlash"}</button><button type="button" onClick={edit} disabled={submitting}>O‘zgartirish</button></div></div>}
      {!typing && stage === "edit" && <div className="madina-quick-actions madina-edit-actions">{fieldOrder.map(field => <button type="button" key={field} onClick={() => chooseEdit(field)}>{fieldLabels[field]}</button>)}</div>}
      {!typing && stage === "success" && <div className="madina-success"><Check size={19} aria-hidden="true"/><span>Rahmat! Ma’lumotlaringiz qabul qilindi.<br/>Mutaxassisimiz siz bilan bog‘lanadi.</span><button type="button" onClick={reset}>Yangi savol boshlash</button></div>}
      {!typing && quick && stage !== "edit" && stage !== "confirm" && stage !== "success" && <div className="madina-quick-actions">{quick.map(action => <button type="button" key={action} onClick={() => send(action)}>{action}</button>)}</div>}
      <div ref={bottom}/>
    </div>
    <form className="madina-input-wrap" onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="madina-input-shell"><Avatar small/><textarea ref={inputRef} rows={1} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="Savolingizni yozing..." aria-label="Madina uchun xabar" disabled={typing || stage === "confirm" || stage === "edit" || stage === "success"}/><button type="submit" aria-label="Xabarni yuborish" disabled={typing || !input.trim() || stage === "confirm" || stage === "edit" || stage === "success"}><Send size={17}/></button></div>
    </form>
  </section>;
}
