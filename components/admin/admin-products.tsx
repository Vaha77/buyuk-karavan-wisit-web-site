"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Edit3, Eye, EyeOff, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { productCategories, type Product } from "@/lib/products/types";
import { copyProductAction, deleteProductAction, toggleVisibilityAction } from "@/app/admin/(protected)/products/actions";

const categoryNames: Record<Product["category"], string> = {
  compressors: "Kompressor", evaporators: "Evaporator", condensers: "Kondensator", chillers: "Chiller",
  panels: "Sandwich panel", doors: "Sovutish eshigi", pipes: "Mis quvur", accessories: "Aksessuar",
};

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
    <td><strong>{product.name}</strong></td><td>{categoryNames[product.category]}</td><td>{product.model}</td>
    <td><ProductStatusBadge product={product}/></td><td><ProductVisibilityToggle product={product} onChange={() => onVisibility(product.id)}/></td>
    <td>{String(product.order).padStart(2,"0")}</td><td>{product.updatedAt || "Bugun"}</td>
    <td><RowActions product={product} selected={selected.includes(product.id)} onSelect={() => onSelect(product.id)} onVisibility={() => onVisibility(product.id)} onCopy={() => onCopy(product.id)} onDelete={() => onDelete(product.id)}/></td>
  </tr>)}</tbody></table></div>;
}
function PackageGlyph() { return <span aria-hidden="true">▣</span>; }
export function ProductManagementCard({ product, selected, onSelect, onVisibility, onCopy, onDelete }: RowProps) {
  return <article className="admin-product-card">
    <div className="admin-product-card-top"><input type="checkbox" aria-label={`${product.name} tanlash`} checked={selected} onChange={onSelect}/><span className="admin-product-thumb"><PackageGlyph/></span><div><strong>{product.name}</strong><span>{product.model}</span></div><ProductActionsMenu product={product} onHide={onVisibility} onCopy={onCopy} onDelete={onDelete}/></div>
    <div className="admin-product-card-meta"><span>{categoryNames[product.category]}</span><ProductStatusBadge product={product}/></div>
    <div className="admin-product-card-bottom"><ProductVisibilityToggle product={product} onChange={onVisibility}/><span>#{String(product.order).padStart(2,"0")}</span><Link href={`/admin/products/${product.id}/edit`}>Tahrirlash →</Link></div>
  </article>;
}
export function ProductFilters({ query, onQuery, category, onCategory, status, onStatus }: {
  query: string; onQuery: (value: string) => void; category: string; onCategory: (value: string) => void; status: string; onStatus: (value: string) => void;
}) {
  return <div className="admin-filters"><label className="admin-filter-search"><Search size={17}/><span className="sr-only">Mahsulot qidirish</span><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Mahsulot, brend yoki model qidirish..."/></label>
    <label><span className="sr-only">Kategoriya</span><select value={category} onChange={event => onCategory(event.target.value)}>{productCategories.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
    <label><span className="sr-only">Holati</span><select value={status} onChange={event => onStatus(event.target.value)}><option value="all">Barchasi</option><option value="available">Mavjud</option><option value="order">Buyurtma asosida</option><option value="hidden">Yashirilgan</option></select></label>
  </div>;
}
export function AdminProductsPage({ products, saved }: { products: Product[]; saved?: "created" | "updated" }) {
  const records = products;
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(saved ? "Mahsulot saqlandi." : "");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const rows = useMemo(() => records.filter(p => (category === "all" || p.category === category) && (status === "all" || (status === "hidden" ? !p.isVisible : p.availability === status)) && `${p.name} ${p.brand} ${p.model}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b) => a.order-b.order), [records, query, category, status]);
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
    <div className="admin-summary-grid">
      {[["Jami mahsulotlar",records.length],["Mavjud",records.filter(p=>p.availability==="available").length],["Buyurtma asosida",records.filter(p=>p.availability==="order").length],["Yashirilgan",records.filter(p=>!p.isVisible).length]].map(([label,value]) => <div className="admin-summary-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
    {feedback && <p className="admin-form-feedback" role="status">{feedback}</p>}
    <section className="admin-panel admin-management-panel"><div className="admin-panel-heading"><h2>Mahsulotlar ro‘yxati</h2><span>{rows.length} ta mahsulot</span></div>
      <ProductFilters query={query} onQuery={setQuery} category={category} onCategory={setCategory} status={status} onStatus={setStatus}/>
      {rows.length ? <><ProductManagementTable rows={rows} selected={selected} onSelect={toggleSelected} onSelectAll={() => setSelected(rows.every(p=>selected.includes(p.id)) ? [] : rows.map(p=>p.id))} onVisibility={toggleVisibility} onCopy={copyProduct} onDelete={setDeleting}/>
        <div className="admin-mobile-products">{rows.map(p=><ProductManagementCard key={p.id} product={p} selected={selected.includes(p.id)} onSelect={()=>toggleSelected(p.id)} onVisibility={()=>toggleVisibility(p.id)} onCopy={()=>copyProduct(p.id)} onDelete={()=>setDeleting(p.id)}/>)}</div></> : <p className="admin-empty">Mos mahsulot topilmadi.</p>}
    </section>
    {deleting && <div className="admin-dialog-backdrop" role="presentation"><div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-delete-title"><h2 id="admin-delete-title">Mahsulotni o‘chirish</h2><p>Mahsulot bazadan butunlay o‘chiriladi. Davom etasizmi?</p><div><button type="button" onClick={()=>setDeleting(null)}>Bekor qilish</button><button type="button" className="is-danger" disabled={pending} onClick={()=>{const id=deleting;setDeleting(null);run(deleteProductAction,id,"Mahsulot o‘chirildi.")}}>O‘chirish</button></div></div></div>}
  </div>;
}
