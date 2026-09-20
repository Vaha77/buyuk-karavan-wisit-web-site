"use client";

import Image from "next/image";
import { useRef } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Trash2, Upload } from "lucide-react";

export function VisibilityToggle({ visible, onChange }: { visible: boolean; onChange: (visible: boolean) => void }) {
  return <button className="home-visibility" type="button" role="switch" aria-checked={visible} onClick={() => onChange(!visible)}><span className={`admin-switch ${visible ? "is-on" : ""}`}/>{visible ? <><Eye size={14}/>Ko‘rinadi</> : <><EyeOff size={14}/>Yashirilgan</>}</button>;
}
export function OrderControls({ index, count, onMove }: { index: number; count: number; onMove: (direction: -1 | 1) => void }) {
  return <span className="home-order-controls"><button type="button" aria-label="Yuqoriga ko‘chirish" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={14}/></button><button type="button" aria-label="Pastga ko‘chirish" disabled={index === count-1} onClick={() => onMove(1)}><ArrowDown size={14}/></button></span>;
}
export function HomeTextField({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <label className="home-editor-field"><span>{label}</span>{multiline ? <textarea rows={3} value={value} onChange={event=>onChange(event.target.value)}/> : <input value={value} onChange={event=>onChange(event.target.value)}/>}</label>;
}
export function AdminImageField({ label, value, ratio, onChange }: { label: string; value: string | null; ratio: string; onChange: (value: string | null) => void }) {
  const inputRef=useRef<HTMLInputElement>(null);
  const choose=(file?:File)=>{if(!file||!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>10*1024*1024)return;const reader=new FileReader();reader.onload=()=>{if(typeof reader.result==="string")onChange(reader.result);};reader.readAsDataURL(file);};
  const remove=()=>onChange(null);
  return <div className="home-image-field"><div className="home-image-heading"><strong>{label}</strong><span>Tavsiya etilgan nisbat: {ratio}</span></div>
    <input ref={inputRef} className="sr-only" type="file" accept="image/*" onChange={event=>{choose(event.target.files?.[0]);event.target.value="";}}/>
    <div className="home-image-preview" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();choose(event.dataTransfer.files[0]);}}>{value ? <Image unoptimized src={value} alt={label} fill sizes="400px"/> : <><ImagePlus size={24}/><span>Rasm hali tanlanmagan</span></>}</div>
    <div className="home-image-actions"><button type="button" onClick={()=>inputRef.current?.click()}><Upload size={15}/>{value ? "Rasmni almashtirish" : "Rasm yuklash"}</button>{value&&<button type="button" className="is-danger" onClick={remove}><Trash2 size={15}/>O‘chirish</button>}</div>
  </div>;
}
