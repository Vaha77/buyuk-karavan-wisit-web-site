"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, UploadCloud, X } from "lucide-react";
import { productCategories, type Product, type ProductAvailability, type ProductCategory } from "@/data/products";

type Specification = { id: string; name: string; value: string };
type Preview = { id: string; url: string; name: string };
type FormState = {
  name: string; brand: string; model: string; category: ProductCategory;
  shortDescription: string; description: string; specifications: Specification[];
  tags: string[]; availability: ProductAvailability; isVisible: boolean; order: number;
  slug: string; seoTitle: string; seoDescription: string;
};
const blank: FormState = { name: "", brand: "", model: "", category: "compressors", shortDescription: "", description: "", specifications: [{ id: "spec-1", name: "", value: "" }], tags: [], availability: "available", isVisible: true, order: 1, slug: "", seoTitle: "", seoDescription: "" };
const slugify = (text: string) => text.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
function fromProduct(product?: Product): FormState {
  if (!product) return blank;
  return { name: product.name, brand: product.brand, model: product.model, category: product.category,
    shortDescription: product.shortDescription || "", description: product.description || "",
    specifications: product.specifications?.length ? product.specifications : product.id === "p01" ? [{ id:"power", name:"Quvvat", value:"20 HP" },{ id:"refrigerant",name:"Sovutgich",value:"R404A" }] : product.specs.map((value,index)=>({id:`spec-${index}`,name:"Xususiyat",value})),
    tags: product.tags || product.specs, availability: product.availability, isVisible: product.isVisible, order: product.order,
    slug: product.slug, seoTitle: product.seoTitle || "", seoDescription: product.seoDescription || "" };
}
function FormField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="admin-form-field"><span>{label}</span>{children}</label>; }
export function ProductSpecificationsEditor({ rows, onChange }: { rows: Specification[]; onChange: (rows: Specification[]) => void }) {
  const update = (id: string, key: "name"|"value", value: string) => onChange(rows.map(row=>row.id===id?{...row,[key]:value}:row));
  const move = (index: number, direction: number) => { const next=[...rows]; const target=index+direction; if(target<0||target>=next.length)return; [next[index],next[target]]=[next[target],next[index]];onChange(next); };
  return <section className="admin-form-card"><div className="admin-form-card-heading"><h2>Texnik xususiyatlar</h2><p>Har qanday mahsulot toifasi uchun nom va qiymat kiriting.</p></div>
    <div className="admin-spec-headers"><span>Xususiyat nomi</span><span>Qiymati</span></div>
    {rows.map((row,index)=><div className="admin-spec-row" key={row.id}><input aria-label={`${index+1}-xususiyat nomi`} placeholder="Masalan: Quvvat" value={row.name} onChange={e=>update(row.id,"name",e.target.value)}/><input aria-label={`${index+1}-xususiyat qiymati`} placeholder="Masalan: 20 HP" value={row.value} onChange={e=>update(row.id,"value",e.target.value)}/><div className="admin-row-tools"><button type="button" aria-label="Yuqoriga" disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={15}/></button><button type="button" aria-label="Pastga" disabled={index===rows.length-1} onClick={()=>move(index,1)}><ArrowDown size={15}/></button><button type="button" aria-label="O‘chirish" onClick={()=>onChange(rows.filter(item=>item.id!==row.id))}><Trash2 size={16}/></button></div></div>)}
    <button className="admin-add-inline" type="button" onClick={()=>onChange([...rows,{id:`spec-${Date.now()}-${Math.random()}`,name:"",value:""}])}><Plus size={17}/>Xususiyat qo‘shish</button>
  </section>;
}
export function ProductTagsEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input,setInput]=useState("");
  const add=()=>{const value=input.trim();if(value&&!tags.includes(value))onChange([...tags,value]);setInput("");};
  return <section className="admin-form-card"><div className="admin-form-card-heading"><h2>Mahsulot teglari</h2><p>Saytdagi kartochkada ko‘rinadigan qisqa teglar.</p></div><div className="admin-tags">{tags.map(tag=><span key={tag}>{tag}<button type="button" aria-label={`${tag} tegini o‘chirish`} onClick={()=>onChange(tags.filter(item=>item!==tag))}><X size={13}/></button></span>)}</div><div className="admin-tag-input"><input aria-label="Yangi teg" value={input} placeholder="Masalan: 20 HP" onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add();}}}/><button type="button" onClick={add}><Plus size={16}/>Teg qo‘shish</button></div></section>;
}
export function ProductImageUploader() {
  const [images,setImages]=useState<Preview[]>([]);
  const fileRef=useRef<HTMLInputElement>(null);
  const urlsRef=useRef<string[]>([]);
  useEffect(()=>()=>{urlsRef.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  const addFiles=(files: FileList | File[])=>{const incoming=Array.from(files).filter(file=>file.type.startsWith("image/")).map(file=>{const url=URL.createObjectURL(file);urlsRef.current.push(url);return{id:`image-${Date.now()}-${Math.random()}`,url,name:file.name};});setImages(current=>[...current,...incoming]);};
  const remove=(id:string)=>setImages(current=>{const target=current.find(item=>item.id===id);if(target){URL.revokeObjectURL(target.url);urlsRef.current=urlsRef.current.filter(url=>url!==target.url);}return current.filter(item=>item.id!==id);});
  const move=(index:number,direction:number)=>setImages(current=>{const next=[...current],target=index+direction;if(target<0||target>=next.length)return current;[next[index],next[target]]=[next[target],next[index]];return next;});
  return <section className="admin-form-card"><div className="admin-form-card-heading"><h2>Mahsulot rasmlari</h2><p>Birinchi rasm katalogdagi asosiy rasm bo‘ladi. Rasmlar faqat shu sahifada vaqtincha ko‘rsatiladi.</p></div>
    <input className="sr-only" ref={fileRef} type="file" accept="image/*" multiple onChange={e=>{if(e.target.files)addFiles(e.target.files);e.target.value="";}}/>
    <div className="admin-upload-zone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files);}}><UploadCloud size={29}/><strong>Rasmlarni shu yerga tashlang</strong><span>yoki kompyuterdan tanlang</span><button type="button" onClick={()=>fileRef.current?.click()}>Rasm yuklash</button></div>
    {images.length ? <div className="admin-image-grid">{images.map((image,index)=><div className="admin-image-preview" key={image.id}><Image unoptimized src={image.url} alt={image.name} width={160} height={100}/>{index===0&&<span>Asosiy rasm</span>}<div><button type="button" aria-label="Oldinga" disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={15}/></button><button type="button" aria-label="Keyinga" disabled={index===images.length-1} onClick={()=>move(index,1)}><ArrowDown size={15}/></button><button type="button" aria-label="Rasmni o‘chirish" onClick={()=>remove(image.id)}><X size={15}/></button></div></div>)}</div> : <div className="admin-empty-images"><ImagePlus size={19}/> Hozircha rasm qo‘shilmagan</div>}
  </section>;
}
export function ProductSeoFields({ state, update }: { state: FormState; update: (key: keyof FormState, value: string) => void }) {
  return <details className="admin-form-card admin-seo"><summary>SEO / URL <span>Qidiruv tizimlari uchun ixtiyoriy ma’lumotlar</span></summary><div className="admin-form-grid"><FormField label="Slug"><input value={state.slug} onChange={e=>update("slug",e.target.value)} placeholder="xue-ying-br-20pg"/></FormField><FormField label="SEO title"><input value={state.seoTitle} onChange={e=>update("seoTitle",e.target.value)}/></FormField><FormField label="SEO description"><textarea value={state.seoDescription} onChange={e=>update("seoDescription",e.target.value)} rows={3}/></FormField></div></details>;
}
export function AdminSaveBar({ onSave, onDraft }: { onSave: () => void; onDraft: () => void }) {
  return <div className="admin-save-bar"><Link href="/admin/products">Bekor qilish</Link><div><button type="button" onClick={onDraft}>Qoralama saqlash</button><button className="admin-primary-button" type="button" onClick={onSave}>Mahsulotni saqlash</button></div></div>;
}
export function ProductForm({ product }: { product?: Product }) {
  const [state,setState]=useState<FormState>(()=>fromProduct(product));
  const [slugEdited,setSlugEdited]=useState(Boolean(product));
  const [feedback,setFeedback]=useState("");
  const update=(key:keyof FormState,value:string|number|boolean|Specification[]|string[])=>setState(current=>({...current,[key]:value}));
  const updateIdentity=(key:"name"|"model",value:string)=>setState(current=>{const next={...current,[key]:value};return slugEdited?next:{...next,slug:slugify(`${next.name} ${next.model}`)};});
  const save=(draft:boolean)=>{setFeedback(draft?"Qoralama vaqtincha saqlandi — backend hali ulanmagan.":"Mahsulot ma’lumotlari tekshirildi. Saqlash backend ulanmaguncha vaqtinchalik.");};
  return <div className="admin-form-page"><div className="admin-page-heading"><div><Link className="admin-back-link" href="/admin/products">← Mahsulotlarga qaytish</Link><h1>{product?"Mahsulotni tahrirlash":"Yangi mahsulot"}</h1><p>{product?"Mahsulot ma’lumotlarini yangilash":"Sayt katalogiga yangi mahsulot qo‘shish"}</p></div></div>
    <div className="admin-form-layout"><div className="admin-form-main">
      <section className="admin-form-card"><div className="admin-form-card-heading"><h2>Asosiy ma’lumotlar</h2></div><div className="admin-form-grid">
        <FormField label="Mahsulot nomi"><input value={state.name} onChange={e=>updateIdentity("name",e.target.value)} placeholder="Masalan: XUE YING"/></FormField>
        <FormField label="Brend"><input value={state.brand} onChange={e=>update("brand",e.target.value)} placeholder="Masalan: XUE YING"/></FormField>
        <FormField label="Model"><input value={state.model} onChange={e=>updateIdentity("model",e.target.value)} placeholder="Masalan: BR +20PG"/></FormField>
        <FormField label="Kategoriya"><select value={state.category} onChange={e=>update("category",e.target.value)}>{productCategories.filter(item=>item.id!=="all").map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></FormField>
        <FormField label="Qisqa tavsif"><textarea value={state.shortDescription} onChange={e=>update("shortDescription",e.target.value)} rows={3}/></FormField>
        <FormField label="Mahsulot haqida"><textarea value={state.description} onChange={e=>update("description",e.target.value)} rows={5}/></FormField>
      </div></section>
      <ProductImageUploader/>
      <ProductSpecificationsEditor rows={state.specifications} onChange={rows=>update("specifications",rows)}/>
      <ProductTagsEditor tags={state.tags} onChange={tags=>update("tags",tags)}/>
      <ProductSeoFields state={state} update={(key,value)=>{if(key==="slug")setSlugEdited(true);update(key,value);}}/>
    </div><aside className="admin-form-side">
      <section className="admin-form-card"><div className="admin-form-card-heading"><h2>Holati</h2></div><label className="admin-radio"><input type="radio" name="availability" checked={state.availability==="available"} onChange={()=>update("availability","available")}/>Mavjud</label><label className="admin-radio"><input type="radio" name="availability" checked={state.availability==="order"} onChange={()=>update("availability","order")}/>Buyurtma asosida</label></section>
      <section className="admin-form-card"><div className="admin-form-card-heading"><h2>Saytda ko‘rinishi</h2></div><label className="admin-form-switch"><input type="checkbox" checked={state.isVisible} onChange={e=>update("isVisible",e.target.checked)}/><span>Saytda ko‘rsatish</span></label></section>
      <section className="admin-form-card"><div className="admin-form-card-heading"><h2>Tartib</h2></div><FormField label="Ko‘rsatish tartibi"><input type="number" min={1} value={state.order} onChange={e=>update("order",Number(e.target.value))}/></FormField></section>
    </aside></div>
    {feedback&&<p className="admin-form-feedback" role="status">{feedback}</p>}
    <AdminSaveBar onDraft={()=>save(true)} onSave={()=>save(false)}/>
  </div>;
}
