/* eslint-disable react/no-unescaped-entities */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProductImageUploader, type ProductImagePreview } from "./product-image-uploader";
import { prepareProjectUploadAction, saveProjectAction } from "@/app/admin/(protected)/projects/actions";
import { PROJECT_UPLOAD_CONCURRENCY } from "@/lib/projects/image-constants";
import type { Project } from "@/lib/projects/types";

const slugify=(s:string)=>s.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const empty={title:"",slug:"",shortDescription:"",description:"",location:"",temperature:"",capacity:"",category:"",isVisible:true,isFeatured:false,order:0};
type UploadProgress={state:string;total:number;completed:number;percent:number;failed:number};

function uploadWithProgress(url:string,headers:Record<string,string>,file:File,onProgress:(loaded:number)=>void){
  return new Promise<void>((resolve,reject)=>{const request=new XMLHttpRequest();request.open("PUT",url);Object.entries(headers).forEach(([key,value])=>request.setRequestHeader(key,value));request.upload.onprogress=event=>onProgress(event.loaded);request.onload=()=>request.status>=200&&request.status<300?resolve():reject(new Error(`Storage HTTP ${request.status}`));request.onerror=()=>reject(new Error("Storage upload failed"));request.send(file);});
}

async function responseJson<T>(response:Response):Promise<T>{const value=await response.json().catch(()=>({error:"Server javobi noto'g'ri."})) as {error?:unknown};if(!response.ok)throw new Error(typeof value.error==="string"?value.error:"Rasmni yuklab bo'lmadi.");return value as T;}

export function ProjectForm({project}:{project?:Project}){
  const [state,setState]=useState(project?{title:project.title,slug:project.slug,shortDescription:project.shortDescription,description:project.description,location:project.location,temperature:project.temperature,capacity:project.capacity,category:project.category,isVisible:project.isVisible,isFeatured:project.isFeatured,order:project.order}:empty);
  const [images,setImages]=useState<ProductImagePreview[]>(()=>(project?.images||[]).map((url,i)=>({id:`old-${i}`,url,name:`${i+1}-rasm`})));
  const [edited,setEdited]=useState(Boolean(project)),[feedback,setFeedback]=useState(""),[busy,setBusy]=useState(false),[progress,setProgress]=useState<UploadProgress|null>(null);
  const objectUrls=useRef<string[]>([]),busyRef=useRef(false),draftId=useRef(project?.id||null),createdDraft=useRef(false);
  useEffect(()=>{objectUrls.current=images.filter(x=>x.file).map(x=>x.url)},[images]);
  useEffect(()=>()=>objectUrls.current.forEach(URL.revokeObjectURL),[]);
  const update=(key:keyof typeof state,value:string|number|boolean)=>setState(current=>({...current,[key]:value}));

  const save=async()=>{
    if(busyRef.current)return;
    if(!images.length){setFeedback("Kamida bitta rasm kiriting.");return;}
    busyRef.current=true;setBusy(true);setFeedback("");
    try{
      setProgress({state:"Tayyorlanmoqda...",total:0,completed:0,percent:0,failed:0});
      const prepared=await prepareProjectUploadAction(draftId.current,state);
      if("error" in prepared){setFeedback(prepared.error||"Loyihani tayyorlab bo'lmadi.");setProgress(null);return;}
      draftId.current=prepared.id;if(prepared.created)createdDraft.current=true;
      const snapshot=[...images],pending=snapshot.filter((image):image is ProductImagePreview&{file:File}=>Boolean(image.file));
      const completed=new Map<string,string>(),failed=new Map<string,string>();
      if(pending.length){
        const loaded=new Map<string,number>();let finished=0,next=0;
        const updateProgress=(uploadState:string)=>{const bytes=pending.reduce((sum,image)=>sum+(loaded.get(image.id)||0),0),totalBytes=pending.reduce((sum,image)=>sum+image.file.size,0);setProgress({state:uploadState,total:pending.length,completed:finished,percent:totalBytes?Math.min(100,Math.round(bytes/totalBytes*100)):0,failed:failed.size});};
        setImages(current=>current.map(image=>image.file?{...image,uploadState:"pending",uploadError:undefined}:image));
        updateProgress("Rasmlar yuklanmoqda...");
        const uploadOne=async(image:ProductImagePreview&{file:File})=>{
          setImages(current=>current.map(item=>item.id===image.id?{...item,uploadState:"uploading"}:item));
          try{
            const presign=await responseJson<{key:string;uploadUrl:string;headers:Record<string,string>}>(await fetch(`/api/admin/projects/${prepared.id}/images`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"presign",type:image.file.type,size:image.file.size})}));
            await uploadWithProgress(presign.uploadUrl,presign.headers,image.file,value=>{loaded.set(image.id,value);updateProgress("Rasmlar yuklanmoqda...")});
            setProgress(current=>current?{...current,state:"Rasm tekshirilmoqda..."}:current);
            const result=await responseJson<{url:string}>(await fetch(`/api/admin/projects/${prepared.id}/images`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"complete",key:presign.key,type:image.file.type,size:image.file.size})}));
            completed.set(image.id,result.url);loaded.set(image.id,image.file.size);URL.revokeObjectURL(image.url);
          }catch(error){failed.set(image.id,error instanceof Error?error.message:"Rasmni yuklab bo'lmadi.");}
          finally{finished++;updateProgress("Rasmlar yuklanmoqda...");}
        };
        const worker=async()=>{while(true){const index=next++;if(index>=pending.length)return;await uploadOne(pending[index]);}};
        await Promise.all(Array.from({length:Math.min(PROJECT_UPLOAD_CONCURRENCY,pending.length)},worker));
        setImages(current=>current.map(image=>completed.has(image.id)?{...image,url:completed.get(image.id)!,file:undefined,uploadState:undefined,uploadError:undefined}:failed.has(image.id)?{...image,uploadState:"failed",uploadError:failed.get(image.id)}:image));
        if(failed.size){setProgress({state:"Yuklash yakunlandi",total:pending.length,completed:completed.size,percent:Math.round(completed.size/pending.length*100),failed:failed.size});setFeedback(`${completed.size} ta rasm yuklandi, ${failed.size} ta rasmda xatolik. Xatolikdagi rasmlarni qayta yuklash mumkin.`);return;}
      }
      const finalImages=snapshot.map(image=>completed.has(image.id)?{...image,url:completed.get(image.id)!,file:undefined,uploadState:undefined,uploadError:undefined}:image);
      setImages(finalImages);setProgress(current=>current?{...current,state:"Saqlanmoqda...",completed:current.total,percent:100,failed:0}:{state:"Saqlanmoqda...",total:0,completed:0,percent:100,failed:0});
      const result=await saveProjectAction(prepared.id,state,finalImages.map(image=>({url:image.url})),createdDraft.current);
      if(result?.error){setFeedback(result.error);setProgress(null);}
    }catch(error){setFeedback(error instanceof Error?error.message:"Loyihani saqlab bo'lmadi.");setProgress(null);}
    finally{busyRef.current=false;setBusy(false);}
  };

  return <div className="admin-form-page"><div className="admin-page-heading"><div><Link className="admin-back-link" href="/admin/projects">← Loyihalarga qaytish</Link><h1>{project?"Loyihani tahrirlash":"Yangi loyiha"}</h1><p>Saytda ko'rsatiladigan real loyiha ma'lumotlari</p></div></div><div className="admin-form-layout"><div className="admin-form-main"><section className="admin-form-card"><div className="admin-form-card-heading"><h2>Asosiy ma'lumotlar</h2></div><div className="admin-form-grid">
  {[["title","Loyiha nomi"],["slug","Slug"],["category","Kategoriya"],["location","Manzil"],["temperature","Harorat"],["capacity","Quvvat / sig'im"]].map(([key,label])=><label className="admin-form-field" key={key}><span>{label}</span><input value={String(state[key as keyof typeof state])} onChange={event=>{const value=event.target.value;update(key as keyof typeof state,value);if(key==="title"&&!edited)update("slug",slugify(value));if(key==="slug")setEdited(true)}}/></label>)}
  <label className="admin-form-field"><span>Qisqa tavsif</span><textarea rows={3} value={state.shortDescription} onChange={event=>update("shortDescription",event.target.value)}/></label><label className="admin-form-field"><span>To'liq tavsif</span><textarea rows={7} value={state.description} onChange={event=>update("description",event.target.value)}/></label></div></section><ProductImageUploader title="Loyiha rasmlari" projectLabels disabled={busy} images={images} onChange={setImages} onError={setFeedback}/>{progress&&<section className="project-upload-progress" aria-live="polite"><div><strong>{progress.state}</strong><span>{progress.completed} / {progress.total}</span></div><div className="project-upload-track"><span style={{width:`${progress.percent}%`}}/></div><div><small>{progress.failed?`${progress.failed} ta xatolik`:"Fayllar xavfsiz yuklanmoqda"}</small><b>{progress.percent}%</b></div></section>}</div><aside className="admin-form-side"><section className="admin-form-card"><h2>Ko'rinish</h2><label className="admin-form-switch"><input type="checkbox" checked={state.isVisible} onChange={event=>update("isVisible",event.target.checked)}/><span>Saytda ko'rsatish</span></label><label className="admin-form-switch"><input type="checkbox" checked={state.isFeatured} onChange={event=>update("isFeatured",event.target.checked)}/><span>Tanlangan loyiha</span></label></section><section className="admin-form-card"><label className="admin-form-field"><span>Tartib</span><input type="number" min={0} value={state.order} onChange={event=>update("order",Number(event.target.value))}/></label></section></aside></div>{feedback&&<p className="admin-form-feedback" role="status">{feedback}</p>}<div className="admin-save-bar"><Link href="/admin/projects">Bekor qilish</Link><button className="admin-primary-button" disabled={busy} onClick={save}>{busy?"Rasmlar yuklanmoqda...":images.some(image=>image.uploadState==="failed")?"Xatolikdagi rasmlarni qayta yuklash":"Loyihani saqlash"}</button></div></div>;
}
