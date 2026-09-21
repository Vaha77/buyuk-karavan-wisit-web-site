"use client";
import { useEffect, useState, useTransition } from "react";
import { Eye, EyeOff, Pencil, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ProductCategoryRecord } from "@/lib/product-categories/types";
import { deleteCategoryAction, updateCategoryAction } from "@/app/admin/(protected)/products/category-actions";

type CategoryActionResult = { error?: string; category?: { id: string; name: string; slug: string; isActive: boolean; order: number } };
export function ProductCategoriesManager({ categories, onClose, onCategoriesChange }: { categories: ProductCategoryRecord[]; onClose?: () => void; onCategoriesChange?: (categories: ProductCategoryRecord[]) => void }) {
  const [feedback,setFeedback]=useState(""),[deleting,setDeleting]=useState<ProductCategoryRecord|null>(null),[moveTo,setMoveTo]=useState("");
  const [pending,start]=useTransition(); const router=useRouter();
  useEffect(()=>{if(!onClose)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!deleting)onClose();};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[deleting,onClose]);
  const run=(work:()=>Promise<CategoryActionResult>,success:string,onSuccess?:(result:CategoryActionResult)=>void)=>start(async()=>{const result=await work();setFeedback(result.error||success);if(!result.error){onSuccess?.(result);setDeleting(null);setMoveTo("");router.refresh();}});
  const saveCategory=(category:ProductCategoryRecord,input:{name:string;isActive:boolean;order:number})=>run(()=>updateCategoryAction(category.id,input),"Kategoriya yangilandi.",result=>{const updated=result.category;if(!updated)return;onCategoriesChange?.(categories.map(item=>item.id===category.id?{...item,...updated}:item));});
  const content=<section className="admin-panel admin-category-panel" aria-busy={pending}>
    <div className="admin-panel-heading"><div><h2>Kategoriyalarni boshqarish</h2><span>Nomini o‘zgartiring, saytdagi holatini belgilang yoki xavfsiz o‘chiring</span></div>{onClose&&<button className="admin-category-close" type="button" aria-label="Yopish" onClick={onClose}><X size={19}/></button>}</div>
    {feedback&&<p className="admin-form-feedback" role="status">{feedback}</p>}
    <div className="admin-category-list">{categories.map(category=><CategoryRow key={`${category.id}-${category.name}-${category.isActive}-${category.order}`} category={category} pending={pending} onSave={input=>saveCategory(category,input)} onDelete={()=>{setDeleting(category);setFeedback("");}}/>)}</div>
    {deleting&&<div className="admin-dialog-backdrop"><div className="admin-dialog" role="alertdialog" aria-modal="true"><h2>Kategoriyani o‘chirish</h2>{deleting.productCount>0?<><p>Bu kategoriyada {deleting.productCount} ta mahsulot mavjud.</p><p className="admin-category-delete-note">Mahsulotlar o‘chirilmaydi. Davom etish uchun ularni boshqa kategoriyaga ko‘chiring.</p><label className="admin-form-field"><span>Mahsulotlarni ko‘chirish</span><select value={moveTo} onChange={e=>setMoveTo(e.target.value)}><option value="">Kategoriyani tanlang</option>{categories.filter(x=>x.id!==deleting.id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></>:<p>“{deleting.name}” kategoriyasini o‘chirmoqchimisiz?</p>}<div><button onClick={()=>{setDeleting(null);setMoveTo("");}}>Bekor qilish</button><button className="is-danger" disabled={pending||(deleting.productCount>0&&!moveTo)} onClick={()=>run(()=>deleteCategoryAction(deleting.id,moveTo||undefined),"Kategoriya o‘chirildi.",()=>onCategoriesChange?.(categories.filter(item=>item.id!==deleting.id).map(item=>item.id===moveTo?{...item,productCount:item.productCount+deleting.productCount}:item)))}>O‘chirish</button></div></div></div>}
  </section>;
  return onClose?<div className="admin-category-manager-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div className="admin-category-manager-dialog" role="dialog" aria-modal="true" aria-label="Kategoriyalarni boshqarish">{content}</div></div>:content;
}

function CategoryRow({category,pending,onSave,onDelete}:{category:ProductCategoryRecord;pending:boolean;onSave:(input:{name:string;isActive:boolean;order:number})=>void;onDelete:()=>void}) {
  const [editing,setEditing]=useState(false),[name,setName]=useState(category.name);
  const save=()=>{onSave({name,isActive:category.isActive,order:category.order});setEditing(false);};
  return <article className={`admin-category-row${category.isActive?"":" is-hidden"}`}>
    <div className="admin-category-identity">{editing?<input autoFocus aria-label="Kategoriya nomi" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();save();}else if(e.key==="Escape"){setName(category.name);setEditing(false);}}}/>:<><strong>{category.name}</strong><span>{category.productCount} ta mahsulot</span></>}</div>
    <span className={`admin-category-badge ${category.isActive?"is-visible":"is-hidden"}`}>{category.isActive?"Saytda ko‘rinadi":"Yashirilgan"}</span>
    <div className="admin-category-actions">{editing?<><button disabled={pending||!name.trim()} onClick={save}><Save size={15}/>Saqlash</button><button disabled={pending} onClick={()=>{setName(category.name);setEditing(false);}}>Bekor qilish</button></>:<button disabled={pending} onClick={()=>setEditing(true)}><Pencil size={15}/>Tahrirlash</button>}<button disabled={pending} onClick={()=>onSave({name:category.name,isActive:!category.isActive,order:category.order})}>{category.isActive?<><EyeOff size={15}/>Yashirish</>:<><Eye size={15}/>Ko‘rsatish</>}</button><button className="is-danger" aria-label={`${category.name} kategoriyasini o‘chirish`} disabled={pending} onClick={onDelete}><Trash2 size={15}/></button></div>
  </article>;
}
