"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Edit3, Eye, EyeOff, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import type { Product } from "@/lib/products/types";
import type { ProductCategoryRecord } from "@/lib/product-categories/types";
import { copyProductAction, deleteProductAction, toggleVisibilityAction } from "@/app/admin/(protected)/products/actions";

export function ProductStatusBadge({ product }: { product: Product }) {
  return <span className={`admin-status admin-status-${product.availability}`}><i/>{product.availability === "available" ? "Mavjud" : "Buyurtma asosida"}</span>;
}
export function ProductVisibilityToggle({ product, onChange }: { product: Product; onChange: () => void }) {
  return <button className="admin-visibility" type="button" role="switch" aria-checked={product.isVisible} aria-label={`${product.name}: saytda ko‘rsatish`} onClick={onChange}><span className={`admin-switch ${product.isVisible ? "is-on" : ""}`}/><span>{product.isVisible ? "Ko‘rinadi" : "Yashirilgan"}</span></button>;
}
export function ProductActionsMenu({ product, onCopy, onHide, onDelete }: { product: Product; onCopy: () => void; onHide: () => void; onDelete: () => void }) {
  return <details className="admin-actions-menu"><summary aria-label={`${product.name} amallari`}><MoreHorizontal size={20}/></summary><div className="admin-actions-popover">
    <Link href={`/admin/products/${product.id}/edit`}><Edit3 size={15}/>Tahrirlash</Link>
    <Link href={`/products/${product.slug}`} target="_blank"><Eye size={15}/>Saytda ko‘rish</Link>
    <button type="button" onClick={onCopy}><Copy size={15}/>Nusxa olish</button>
    <button type="button" onClick={onHide}><EyeOff size={15}/>{product.isVisible ? "Yashirish" : "Ko‘rsatish"}</button>
    <button className="is-danger" type="button" onClick={onDelete}><Trash2 size={15}/>O‘chirish</button>
  </div></details>;
}
type RowProps = { product: Product; selected: boolean; onSelect: () => void; onVisibility: () => void; onCopy: () => void; onDelete: () => void };
function RowActions({ product, onVisibility, onCopy, onDelete }: RowProps) {
  return <ProductActionsMenu product={product} onHide={onVisibility} onCopy={onCopy} onDelete={onDelete}/>;
}
export function ProductManagementTable({ rows, selected, onSelect, onSelectAll, onVisibility, onCopy, onDelete }: {
  rows: Product[]; selected: string[]; onSelect: (id: string) => void; onSelectAll: () => void;
  onVisibility: (id: string) => void; onCopy: (id: string) => void; onDelete: (id: string) => void;
}) {
  return <div className="admin-table-wrap"><table className="admin-products-table"><thead><tr>
    <th><input type="checkbox" aria-label="Barchasini tanlash" checked={rows.length > 0 && rows.every(p => selected.includes(p.id))} onChange={onSelectAll}/></th>
    <th>Rasm</th><th>Mahsulot</th><th>Kategoriya</th><th>Model</th><th>Holati</th><th>Saytda</th><th>Tartib</th><th>Yangilangan</th><th>Amallar</th>
  </tr></thead><tbody>{rows.map(product => <tr key={product.id}>
    <td><input type="checkbox" aria-label={`${product.name} tanlash`} checked={selected.includes(product.id)} onChange={() => onSelect(product.id)}/></td>
    <td><span className="admin-product-thumb"><PackageGlyph/></span></td>
    <td><strong>{product.name}</strong></td><td>{product.categoryName}</td><td>{product.model}</td>
    <td><ProductStatusBadge product={product}/></td><td><ProductVisibilityToggle product={product} onChange={() => onVisibility(product.id)}/></td>
    <td>{String(product.order).padStart(2,"0")}</td><td>{product.updatedAt || "Bugun"}</td>
    <td><RowActions product={product} selected={selected.includes(product.id)} onSelect={() => onSelect(product.id)} onVisibility={() => onVisibility(product.id)} onCopy={() => onCopy(product.id)} onDelete={() => onDelete(product.id)}/></td>
  </tr>)}</tbody></table></div>;
}
function PackageGlyph() { return <span aria-hidden="true">▣</span>; }
export function ProductManagementCard({ product, selected, onSelect, onVisibility, onCopy, onDelete }: RowProps) {
  return <article className="admin-product-card">
    <div className="admin-product-card-top"><input type="checkbox" aria-label={`${product.name} tanlash`} checked={selected} onChange={onSelect}/><span className="admin-product-thumb"><PackageGlyph/></span><div><strong>{product.name}</strong><span>{product.model}</span></div><ProductActionsMenu product={product} onHide={onVisibility} onCopy={onCopy} onDelete={onDelete}/></div>
    <div className="admin-product-card-meta"><span>{product.categoryName}</span><ProductStatusBadge product={product}/></div>
    <div className="admin-product-card-bottom"><ProductVisibilityToggle product={product} onChange={onVisibility}/><span>#{String(product.order).padStart(2,"0")}</span><Link href={`/admin/products/${product.id}/edit`}>Tahrirlash →</Link></div>
  </article>;
}
export function ProductFilters({ filters, categories }: {
  filters: { q: string; category: string; status: string }; categories: ProductCategoryRecord[];
}) {
  return <form className="admin-filters" method="get"><label className="admin-filter-search"><Search size={17}/><span className="sr-only">Mahsulot qidirish</span><input name="q" defaultValue={filters.q} placeholder="Mahsulot, brend yoki model qidirish..."/></label>
    <label><span className="sr-only">Kategoriya</span><select name="category" defaultValue={filters.category}><option value="all">Barchasi</option>{categories.map(item => <option value={item.id} key={item.id}>{item.name} ({item.productCount})</option>)}</select></label>
    <label><span className="sr-only">Holati</span><select name="status" defaultValue={filters.status}><option value="all">Barchasi</option><option value="available">Mavjud</option><option value="order">Buyurtma asosida</option><option value="hidden">Yashirilgan</option></select></label><button className="admin-primary-button" type="submit">Qidirish</button>
  </form>;
}
export function AdminProductsPage({ products, categories, saved, total, page, pageCount, summary, filters }: { products: Product[]; categories: ProductCategoryRecord[]; saved?: "created" | "updated"; total: number; page: number; pageCount: number; summary: { total: number; available: number; order: number; hidden: number }; filters: { q: string; category: string; status: string } }) {
  const records = products;
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(saved ? "Mahsulot saqlandi." : "");
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const rows = records;
  const pageHref = (target: number) => { const params = new URLSearchParams(); if (filters.q) params.set("q", filters.q); if (filters.category !== "all") params.set("category", filters.category); if (filters.status !== "all") params.set("status", filters.status); params.set("page", String(target)); return `/admin/products?${params}`; };
  const run = (action: (id: string) => Promise<{ error?: string }>, id: string, success: string) => startTransition(async () => {
    const result = await action(id);
    if (result.error) { setFeedback(result.error); return; }
    setFeedback(success);
    router.refresh();
  });
  const toggleVisibility = (id: string) => run(toggleVisibilityAction, id, "Ko‘rinish holati yangilandi.");
  const copyProduct = (id: string) => run(copyProductAction, id, "Mahsulot nusxasi yaratildi.");
  const toggleSelected = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  return <div className="admin-products-page" aria-busy={pending}>
    <div className="admin-page-heading"><div><h1>Mahsulotlar</h1><p>Saytdagi mahsulotlarni boshqarish</p></div><Link className="admin-primary-button" href="/admin/products/new"><Plus size={18}/>Yangi mahsulot</Link></div>
    <div className="admin-summary-grid is-five">
      {[["Jami mahsulotlar",summary.total],["Mavjud",summary.available],["Buyurtma asosida",summary.order],["Yashirilgan",summary.hidden]].map(([label,value]) => <div className="admin-summary-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      <div className="admin-summary-card"><span>Kategoriyalar</span><strong>{categories.length}</strong><small>{categories.filter(item => item.productCount > 0).length} tasida mahsulot bor</small></div>
    </div>
    {feedback && <p className="admin-form-feedback" role="status">{feedback}</p>}
    <section className="admin-panel admin-management-panel"><div className="admin-panel-heading"><h2>Mahsulotlar ro‘yxati</h2><span>{rows.length} / {total} ta mahsulot</span></div>
      <ProductFilters filters={filters} categories={categories}/>
      {rows.length ? <><ProductManagementTable rows={rows} selected={selected} onSelect={toggleSelected} onSelectAll={() => setSelected(rows.every(p=>selected.includes(p.id)) ? [] : rows.map(p=>p.id))} onVisibility={toggleVisibility} onCopy={copyProduct} onDelete={setDeleting}/>
        <div className="admin-mobile-products">{rows.map(p=><ProductManagementCard key={p.id} product={p} selected={selected.includes(p.id)} onSelect={()=>toggleSelected(p.id)} onVisibility={()=>toggleVisibility(p.id)} onCopy={()=>copyProduct(p.id)} onDelete={()=>setDeleting(p.id)}/>)}</div><nav className="admin-pagination" aria-label="Mahsulotlar sahifalari">{page > 1 && <Link href={pageHref(page - 1)}>Oldingi</Link>}<span>{page} / {pageCount}</span>{page < pageCount && <Link href={pageHref(page + 1)}>Keyingi</Link>}</nav></> : <p className="admin-empty">Mos mahsulot topilmadi.</p>}
    </section>
    {deleting && <div className="admin-dialog-backdrop" role="presentation"><div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-delete-title"><h2 id="admin-delete-title">Mahsulotni o‘chirish</h2><p>Mahsulot bazadan butunlay o‘chiriladi. Davom etasizmi?</p><div><button type="button" onClick={()=>setDeleting(null)}>Bekor qilish</button><button type="button" className="is-danger" disabled={pending} onClick={()=>{const id=deleting;setDeleting(null);run(deleteProductAction,id,"Mahsulot o‘chirildi.")}}>O‘chirish</button></div></div></div>}
  </div>;
}
