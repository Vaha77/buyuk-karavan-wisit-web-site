"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Pencil, Save, X } from "lucide-react";
import { homeSectionMeta, initialHomeContent, type HomeContent, type HomeSectionKey } from "@/data/admin-home";
import { VisibilityToggle } from "./home-controls";
import { HomeSectionEditor } from "./home-section-editors";

function preview(content: HomeContent, key: HomeSectionKey): string {
  switch(key){
    case "hero": return content.hero.headline;
    case "selector": return `${content.selector.title} · ${content.selector.items.length} variant`;
    case "solutions": return `${content.solutions.items.length} yechim`;
    case "featuredProducts": return `${content.featuredProducts.items.length} tanlangan mahsulot`;
    case "temperature": return `${content.temperature.minimum} → ${content.temperature.maximum}`;
    case "projects": return `${content.projects.items.length} loyiha`;
    case "reasons": return `${content.reasons.items.length} sabab`;
    case "cta": return content.cta.headline;
    case "footer": return content.footer.location;
  }
}
export function HomeSectionCard({ section, index, content, onEdit, onVisibility }: { section:HomeSectionKey; index:number; content:HomeContent; onEdit:()=>void; onVisibility:(value:boolean)=>void }) {
  const meta=homeSectionMeta.find(item=>item.key===section)!;
  const item=content[section];
  return <article className="home-section-card"><span className="home-section-index">{String(index+1).padStart(2,"0")}</span><div className="home-section-copy"><h2>{meta.name}</h2><p>{meta.description}</p><span className="home-section-preview">{preview(content,section)}</span></div><div className="home-section-actions"><VisibilityToggle visible={item.isVisible} onChange={onVisibility}/><button className="home-edit-button" type="button" onClick={onEdit}><Pencil size={15}/>Tahrirlash</button></div></article>;
}
export function AdminHomePage() {
  const [content,setContent]=useState<HomeContent>(initialHomeContent);
  const [active,setActive]=useState<HomeSectionKey|null>(null);
  const [dirty,setDirty]=useState(false);
  const [saved,setSaved]=useState(false);
  const update=<K extends HomeSectionKey>(key:K,value:HomeContent[K])=>{setContent(current=>({...current,[key]:value}));setDirty(true);setSaved(false);};
  useEffect(()=>{
    if(!active)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setActive(null);};
    window.addEventListener("keydown",onKey);
    return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",onKey);};
  },[active]);
  const save=()=>{setDirty(false);setSaved(true);};
  const currentMeta=homeSectionMeta.find(item=>item.key===active);
  return <div className="admin-home-page">
    <div className="admin-page-heading home-page-heading"><div><h1>Home Page</h1><p>Bosh sahifadagi matnlar, rasmlar va bo‘limlarni boshqarish</p></div><div className="home-page-actions"><Link className="home-view-button" href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Saytda ko‘rish</Link><button className="admin-primary-button" type="button" onClick={save}><Save size={16}/>Saqlash</button></div></div>
    <div className="home-save-status" role="status"><CheckCircle2 size={16}/><span>{dirty?"Saqlanmagan o‘zgarishlar":saved?"Barcha o‘zgarishlar saqlangan (demo)":"Barcha o‘zgarishlar saqlangan"}</span><small>Demo tahrirlar hozircha ommaviy saytga ta’sir qilmaydi.</small></div>
    <div className="home-section-list">{homeSectionMeta.map((item,index)=><HomeSectionCard key={item.key} section={item.key} index={index} content={content} onEdit={()=>setActive(item.key)} onVisibility={isVisible=>update(item.key,{...content[item.key],isVisible} as HomeContent[typeof item.key])}/>)}</div>
    {active&&<><button type="button" className="home-editor-backdrop" aria-label="Tahrirlash oynasini yopish" onClick={()=>setActive(null)}/><aside className="home-editor-drawer" role="dialog" aria-modal="true" aria-label={`${currentMeta?.name} tahrirlash`}><div className="home-editor-header"><div><span>{String(content[active].order).padStart(2,"0")} — HOME PAGE</span><h2>{currentMeta?.name}</h2><p>{currentMeta?.description}</p></div><button type="button" aria-label="Yopish" onClick={()=>setActive(null)}><X size={20}/></button></div><div className="home-editor-body"><div className="home-editor-visibility"><span>Bo‘lim ko‘rinishi</span><VisibilityToggle visible={content[active].isVisible} onChange={isVisible=>update(active,{...content[active],isVisible} as HomeContent[typeof active])}/></div><HomeSectionEditor section={active} content={content} onChange={update}/></div><div className="home-editor-footer"><button type="button" onClick={()=>setActive(null)}>Yopish</button><button type="button" className="admin-primary-button" onClick={()=>{save();setActive(null);}}>Saqlash</button></div></aside></>}
  </div>;
}
