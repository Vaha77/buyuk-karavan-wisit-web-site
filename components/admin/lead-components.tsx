"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronRight, MapPin, MessageCircle, Phone, Search, X } from "lucide-react";
import { leadStatusLabels, type ConversationMessage, type Lead, type LeadStatus } from "@/data/leads";

const statuses = Object.entries(leadStatusLabels) as [LeadStatus,string][];
export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <span className={`lead-status lead-status-${status}`}><i aria-hidden="true"/>{leadStatusLabels[status]}</span>;
}
export function LeadStats({ leads }: { leads: Lead[] }) {
  const items = [
    ["Yangi so‘rovlar",leads.filter(lead=>lead.status==="new").length],
    ["Bugungi so‘rovlar",leads.filter(lead=>lead.dateGroup==="today").length],
    ["Bog‘lanildi",leads.filter(lead=>lead.status==="contacted").length],
    ["Yakunlandi",leads.filter(lead=>lead.status==="completed").length],
  ] as const;
  return <div className="admin-summary-grid lead-stats">{items.map(([label,count])=><div className="admin-summary-card" key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>;
}
export type LeadFiltersState = { query: string; status: LeadStatus | "all"; date: Lead["dateGroup"] | "all"; region: string; requestType: string };
export function LeadFilters({ value, onChange, leads }: { value: LeadFiltersState; onChange: (value: LeadFiltersState) => void; leads: Lead[] }) {
  const regions=[...new Set(leads.map(lead=>lead.region))].sort();
  const requestTypes=[...new Set(leads.map(lead=>lead.requestType))].sort();
  const update=<K extends keyof LeadFiltersState>(key:K,next:LeadFiltersState[K])=>onChange({...value,[key]:next});
  return <div className="lead-filters">
    <label className="admin-filter-search lead-filter-search"><Search size={17}/><span className="sr-only">So‘rovlarni qidirish</span><input value={value.query} onChange={event=>update("query",event.target.value)} placeholder="Mijoz, telefon yoki so‘rov bo‘yicha qidirish..."/></label>
    <label><span className="sr-only">Holati</span><select value={value.status} onChange={event=>update("status",event.target.value as LeadFiltersState["status"])}><option value="all">Barchasi</option>{statuses.map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
    <label><span className="sr-only">Sana</span><select value={value.date} onChange={event=>update("date",event.target.value as LeadFiltersState["date"])}><option value="all">Barcha sanalar</option><option value="today">Bugun</option><option value="yesterday">Kecha</option><option value="week">Oldinroq</option></select></label>
    <label><span className="sr-only">Hudud</span><select value={value.region} onChange={event=>update("region",event.target.value)}><option value="all">Barcha hududlar</option>{regions.map(region=><option key={region}>{region}</option>)}</select></label>
    <label><span className="sr-only">So‘rov turi</span><select value={value.requestType} onChange={event=>update("requestType",event.target.value)}><option value="all">Barcha so‘rovlar</option>{requestTypes.map(type=><option key={type}>{type}</option>)}</select></label>
  </div>;
}
export function LeadTable({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  return <div className="lead-table-wrap"><table className="lead-table"><thead><tr><th>Mijoz</th><th>Telefon</th><th>So‘rov turi</th><th>Mahsulot</th><th>Hajmi</th><th>Harorat</th><th>Hudud</th><th>Sana</th><th>Holati</th><th>Action</th></tr></thead><tbody>{leads.map(lead=><tr key={lead.id} className={lead.isUnread?"is-unread":""} onClick={()=>onOpen(lead.id)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onOpen(lead.id);}}} tabIndex={0} aria-label={`${lead.customerName} so‘rovini ochish`}>
    <td><span className="lead-customer-cell">{lead.isUnread&&<i className="lead-unread-dot" aria-label="O‘qilmagan"/>}<strong>{lead.customerName}</strong></span></td><td>{lead.phone}</td><td>{lead.requestType}</td><td>{lead.product}</td><td>{lead.dimensions}</td><td>{lead.temperature}</td><td>{lead.region}</td><td>{lead.dateLabel}</td><td><LeadStatusBadge status={lead.status}/></td><td><button type="button" aria-label={`${lead.customerName} tafsilotlari`} onClick={event=>{event.stopPropagation();onOpen(lead.id);}}><ChevronRight size={17}/></button></td>
  </tr>)}</tbody></table></div>;
}
export function LeadMobileCard({ lead, onOpen }: { lead: Lead; onOpen: (id: string) => void }) {
  return <button className={`lead-mobile-card ${lead.isUnread?"is-unread":""}`} type="button" onClick={()=>onOpen(lead.id)}><span className="lead-mobile-top"><strong>{lead.isUnread&&<i className="lead-unread-dot" aria-label="O‘qilmagan"/>}{lead.customerName}</strong><ChevronRight size={17}/></span><span className="lead-mobile-phone">{lead.phone}</span><span className="lead-mobile-request">{lead.requestType} · {lead.product}</span><span className="lead-mobile-facts"><span>{lead.temperature}</span><span>{lead.region}</span></span><span className="lead-mobile-bottom"><LeadStatusBadge status={lead.status}/><small>{lead.dateLabel}</small></span></button>;
}
export function LeadRequirements({ lead }: { lead: Lead }) {
  const items=[["So‘rov",lead.requestType],["Mahsulot",lead.product],["Kamera o‘lchami",lead.dimensions],["Taxminiy sig‘im",lead.capacity],["Kerakli harorat",lead.temperature],["Hudud",lead.region],["Qo‘shimcha",lead.additional]];
  return <section className="lead-detail-card"><h3>So‘rov tafsilotlari</h3><dl>{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||"—"}</dd></div>)}</dl></section>;
}
export function MadinaSummary({ text }: { text: string }) { return <section className="lead-summary"><span className="lead-summary-icon"><MessageCircle size={17}/></span><div><h3>Madina AI xulosasi</h3><p>{text}</p></div></section>; }
export function LeadConversation({ messages }: { messages: ConversationMessage[] }) {
  return <section className="lead-conversation"><h3>Madina bilan suhbat</h3><div>{messages.map(message=><div className={`lead-message lead-message-${message.role}`} key={message.id}><span>{message.role==="madina"?"Madina":"Mijoz"}</span><p>{message.text}</p></div>)}</div></section>;
}
export function LeadManagerNotes({ initial, onSave }: { initial: string; onSave: (note: string) => void }) {
  const [note,setNote]=useState(initial);
  const [saved,setSaved]=useState(false);
  return <section className="lead-notes"><h3>Menejer izohi</h3><textarea rows={4} placeholder="Mijoz haqida izoh yozing..." value={note} onChange={event=>{setNote(event.target.value);setSaved(false);}}/><div><span role="status">{saved?"Izoh demo ro‘yxatida saqlandi.":""}</span><button type="button" className="admin-primary-button" onClick={()=>{onSave(note);setSaved(true);}}><Check size={15}/>Saqlash</button></div></section>;
}
export function LeadDrawer({ lead, onClose, onStatusChange, onSaveNote }: { lead: Lead; onClose: () => void; onStatusChange: (status: LeadStatus) => void; onSaveNote: (note: string) => void }) {
  const [quickMessage,setQuickMessage]=useState("");
  const selectRef=useRef<HTMLSelectElement>(null);
  useEffect(()=>{const before=document.body.style.overflow;document.body.style.overflow="hidden";const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};window.addEventListener("keydown",onKey);return()=>{document.body.style.overflow=before;window.removeEventListener("keydown",onKey);};},[onClose]);
  return <><button className="lead-drawer-backdrop" type="button" aria-label="Mijoz so‘rovini yopish" onClick={onClose}/><aside className="lead-drawer" role="dialog" aria-modal="true" aria-label="Mijoz so‘rovi"><div className="lead-drawer-header"><div><span>MADINA AI · MIJOZ MUROJAATI</span><h2>Mijoz so‘rovi</h2></div><button type="button" aria-label="Yopish" onClick={onClose}><X size={20}/></button></div>
    <div className="lead-drawer-scroll"><div className="lead-contact"><div className="lead-contact-title"><div><h3>{lead.customerName}</h3><p>{lead.requestType} · {lead.product}</p></div><LeadStatusBadge status={lead.status}/></div><div className="lead-contact-details"><span><Phone size={14}/>{lead.phone}</span>{lead.telegram&&<span><MessageCircle size={14}/>{lead.telegram}</span>}<span><MapPin size={14}/>{lead.region}</span><span><CalendarDays size={14}/>{lead.dateLabel}</span></div><label className="lead-status-field">Holati<select ref={selectRef} value={lead.status} onChange={event=>onStatusChange(event.target.value as LeadStatus)}>{statuses.map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><div className="lead-quick-actions"><button type="button" onClick={()=>setQuickMessage("Qo‘ng‘iroq qilish backend ulanmaguncha demo amal.")}><Phone size={15}/>Qo‘ng‘iroq qilish</button><button type="button" onClick={()=>setQuickMessage("Telegram integratsiyasi keyingi bosqichda ulanadi.")}><MessageCircle size={15}/>Telegram</button><button type="button" onClick={()=>selectRef.current?.focus()}>Holatni o‘zgartirish</button></div>{quickMessage&&<p className="lead-quick-message" role="status">{quickMessage}</p>}</div>
      <LeadRequirements lead={lead}/><MadinaSummary text={lead.summary}/><LeadConversation messages={lead.conversation}/><LeadManagerNotes initial={lead.managerNote} onSave={onSaveNote}/>
    </div></aside></>;
}
