"use client";

import { useEffect,useRef,useState } from "react";
import { CheckCircle2,Phone,X } from "lucide-react";
import { submitLeadAction } from "@/app/lead-actions";

const regions=["Toshkent shahri","Toshkent viloyati","Andijon viloyati","Buxoro viloyati","Farg‘ona viloyati","Jizzax viloyati","Xorazm viloyati","Namangan viloyati","Navoiy viloyati","Qashqadaryo viloyati","Qoraqalpog‘iston Respublikasi","Samarqand viloyati","Sirdaryo viloyati","Surxondaryo viloyati"];
const freshKey=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?`product-consultation-${crypto.randomUUID()}`:`product-consultation-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function ProductConsultation({productId,productName,productSlug,className,label}:{productId:string;productName:string;productSlug:string;className:string;label:string}){
  const [open,setOpen]=useState(false),[sent,setSent]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState("");
  const [submissionKey,setSubmissionKey]=useState(freshKey),firstInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!open)return;const prior=document.body.style.overflow;document.body.style.overflow="hidden";const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!pending)setOpen(false);};window.addEventListener("keydown",onKey);requestAnimationFrame(()=>firstInput.current?.focus());return()=>{document.body.style.overflow=prior;window.removeEventListener("keydown",onKey);};},[open,pending]);
  function show(){setError("");setSent(false);setSubmissionKey(freshKey());setOpen(true);}
  function close(){if(!pending)setOpen(false);}
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(pending)return;setPending(true);setError("");
    const form=new FormData(event.currentTarget);
    try{
      const result=await submitLeadAction({customerName:String(form.get("customerName")||""),phone:String(form.get("phone")||""),region:String(form.get("region")||""),notes:String(form.get("notes")||""),productId,productSlug,source:"PRODUCT_CONSULTATION",requestType:"Mahsulot bo‘yicha maslahat",website:String(form.get("website")||""),idempotencyKey:submissionKey});
      if(!result.ok){setError(result.error);return;}setSent(true);
    }catch{setError("So‘rovni yuborib bo‘lmadi. Internet aloqasini tekshirib, qayta urinib ko‘ring.");}
    finally{setPending(false);}
  }
  return <>
    <button type="button" className={className} onClick={show}>{label}</button>
    {open&&<div className="consultation-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
      <section className="consultation-dialog" role="dialog" aria-modal="true" aria-labelledby="consultation-title">
        <button type="button" className="consultation-close" onClick={close} disabled={pending} aria-label="Oynani yopish"><X size={20}/></button>
        {sent?<div className="consultation-success"><span><CheckCircle2 size={27}/></span><h2 id="consultation-title">So‘rovingiz qabul qilindi!</h2><p>Mutaxassisimiz tez orada siz bilan telefon orqali bog‘lanadi.</p><p>Kutishni istamasangiz, <a href="tel:+998916377777">+998 91 637 77 77</a> raqamiga hoziroq qo‘ng‘iroq qilib maslahat olishingiz mumkin.</p><div className="consultation-actions"><a className="consultation-call" href="tel:+998916377777"><Phone size={17}/>Qo‘ng‘iroq qilish</a><button type="button" className="consultation-ok" onClick={close}>OK</button></div></div>:
        <><header className="consultation-heading"><span>Mutaxassis maslahati</span><h2 id="consultation-title">Mahsulot bo‘yicha maslahat olish</h2><p>Ma’lumotlaringizni qoldiring. Mutaxassisimiz siz bilan bog‘lanib, mos yechimni tanlashga yordam beradi.</p></header>
        <div className="consultation-product"><small>Tanlangan mahsulot</small><strong>{productName}</strong></div>
        <form onSubmit={submit} className="consultation-form">
          <label>Ismingiz <em>*</em><input ref={firstInput} name="customerName" required maxLength={120} autoComplete="name" placeholder="Ismingiz" disabled={pending}/></label>
          <label>Telefon raqamingiz <em>*</em><input name="phone" required minLength={9} maxLength={40} inputMode="tel" autoComplete="tel" placeholder="+998 90 123 45 67" disabled={pending}/></label>
          <label>Hudud / viloyat <em>*</em><select name="region" required defaultValue="" disabled={pending}><option value="" disabled>Hududni tanlang</option>{regions.map(region=><option value={region} key={region}>{region}</option>)}</select></label>
          <label>Qo‘shimcha izoh <small>(ixtiyoriy)</small><textarea name="notes" maxLength={2000} rows={3} placeholder="Savolingiz yoki talablaringiz" disabled={pending}/></label>
          <input className="consultation-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"/>
          {error&&<p className="consultation-error" role="alert">{error}</p>}
          <button type="submit" className="consultation-submit" disabled={pending}>{pending?<><i/>Yuborilmoqda…</>:"So‘rov yuborish"}</button>
        </form></>}
      </section>
    </div>}
  </>;
}
