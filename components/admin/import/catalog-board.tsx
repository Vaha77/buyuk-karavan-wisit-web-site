"use client";
/* eslint-disable @next/next/no-img-element -- catalog images are plain stored URLs, shown as-is */

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { submitImportOrderAction } from "@/app/admin/(import)/import/actions";
import type { listProducts } from "@/lib/import/service";
import { TYPE_LABEL, cartSet, cartStep, cartTotal, parseCart, type Cart, type ProductView } from "@/lib/import/rules";
import { BusyLabel } from "@/components/admin/feedback";

type Data = Awaited<ReturnType<typeof listProducts>>;
type Filters = { q: string; cat: string; group: string; type: string };
type Edit = { orderId: string; number: string; note: string | null; client: string; neededBy: string; comment: string; cart: Cart } | null;

const STORE = "bk-import-cart";
const noSubscribe = () => () => {};
const readStore = () => { try { return localStorage.getItem(STORE); } catch { return null; } };
const save = (cart: Cart) => { try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch { /* private mode: cart lives in memory only */ } };

export function CatalogBoard({ data, filters, edit }: { data: Data; filters: Filters; edit: Edit }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState(false);
  const editId = edit?.orderId;
  // Stored cart is read after hydration (server snapshot null); a returned order being edited replaces it, and its edits stay off localStorage.
  const stored = useSyncExternalStore(noSubscribe, readStore, () => null);
  const [changed, setChanged] = useState<{ editId?: string; cart: Cart } | null>(null);
  const cart = changed && changed.editId === editId ? changed.cart : edit?.cart ?? parseCart(stored);
  const setCart = (next: Cart) => { setChanged({ editId, cart: next }); if (!editId) save(next); };

  const hrefWith = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    if (key === "cat") next.delete("group"); // toifa list differs per catalog
    const text = next.toString();
    return text ? `${pathname}?${text}` : pathname;
  };
  const setParam = (key: string, value: string) => router.replace(hrefWith(key, value), { scroll: false });
  useEffect(() => {
    if (q.trim() === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => router.replace(hrefWith("q", q.trim()), { scroll: false }), 300);
    return () => clearTimeout(timer);
  }); // shortcut: runs every render; cheap (one compare), avoids a stale hrefWith closure.

  const lineOf = (product: ProductView) => ({ code: product.code, name: product.nameUz, model: product.model });
  const catalogTitle = new Map(data.tree.catalogs.map(catalog => [catalog.id, catalog.title]));
  const total = cartTotal(cart);

  return <div className="imp-layout">
    <nav className="imp-tree bk-card" aria-label="Kataloglar">
      <Link href={hrefWith("cat", "")} className={filters.cat ? undefined : "is-on"}>Hammasi</Link>
      <Tree parentId={null} data={data} active={filters.cat} hrefWith={hrefWith}/>
    </nav>
    <div>
      <div className="imp-bar">
        <label className="bk-field"><span>Qidirish</span><input type="search" value={q} onChange={event => setQ(event.target.value)} placeholder="Kod, model, EN/UZ nom"/></label>
        <label className="bk-field"><span>Toifa</span><select value={filters.group} onChange={event => setParam("group", event.target.value)}>
          <option value="">Hammasi</option>{data.groups.map(group => <option key={group} value={group}>{group}</option>)}
        </select></label>
        <label className="bk-field"><span>Turi</span><select value={filters.type} onChange={event => setParam("type", event.target.value)}>
          <option value="">Hammasi</option>{Object.entries(TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
      </div>
      <p className="imp-count">{data.products.length} ta tovar</p>
      {data.products.length ? <div className="imp-grid">{data.products.map(product => {
        const qty = cart[product.id]?.qty ?? 0;
        return <article key={product.id} className="imp-card">
          <div className="imp-im">{product.imageUrl ? <img src={product.imageUrl} alt={product.nameUz} loading="lazy"/> : "rasm yo‘q"}<i>{TYPE_LABEL[product.type] ?? product.type}</i></div>
          <div className="imp-b">
            <div className="imp-cd">{product.code}</div>
            <div className="imp-n">{product.nameEn}</div>
            <div className="imp-nu">{product.nameUz}</div>
            <div className="imp-m">Model: <b>{product.model}</b> · {catalogTitle.get(product.catalogId)}{product.catPage ? ` · sahifa ${product.catPage}` : ""}</div>
            {product.specs.map((spec, index) => <div key={index}>
              <div className="imp-e">{spec.en}: <b>{spec.value}</b></div>
              <div className="imp-u">{spec.uz}: <b>{spec.value_uz}</b></div>
            </div>)}
            {product.flag && <div className="imp-fl">⚠ {product.flag}</div>}
            {product.price != null && <div className="imp-price">{product.price.toLocaleString("ru-RU")} {product.priceCurrency}{product.moq ? ` · MOQ ${product.moq}` : ""}</div>}
            <div className="imp-cart">{qty
              ? <><Stepper qty={qty} name={product.nameUz} onStep={delta => setCart(cartStep(cart, product.id, delta))} onSet={value => setCart(cartSet(cart, product.id, value))}/><span className="imp-in">✓ Savatchada: {qty} dona</span></>
              : <button type="button" className="imp-add" onClick={() => setCart(cartStep(cart, product.id, 1, lineOf(product)))}>🛒 Savatchaga joylash</button>}</div>
          </div>
        </article>;
      })}</div> : <div className="bk-empty">Tovar topilmadi.</div>}
    </div>
    <button type="button" className="imp-fab" onClick={() => setOpen(true)}>🛒 Savatcha <b>{total}</b></button>
    {open && <CartDrawer cart={cart} setCart={setCart} edit={edit} onClose={() => setOpen(false)}/>}
  </div>;
}

function Tree({ parentId, data, active, hrefWith }: { parentId: string | null; data: Data; active: string; hrefWith: (key: string, value: string) => string }) {
  const categories = data.tree.categories.filter(category => category.parentId === parentId);
  if (!categories.length) return null;
  return <ul>{categories.map(category => <li key={category.id}>
    <Link href={hrefWith("cat", category.id)} className={`imp-cat${active === category.id ? " is-on" : ""}`}>{category.nameUz}</Link>
    <ul>{data.tree.catalogs.filter(catalog => catalog.categoryId === category.id).map(catalog => <li key={catalog.id}>
      <Link href={hrefWith("cat", catalog.id)} className={active === catalog.id ? "is-on" : undefined}>{catalog.title} <small>{catalog.code} · {catalog.agent.name}</small></Link>
    </li>)}</ul>
    <Tree parentId={category.id} data={data} active={active} hrefWith={hrefWith}/>
  </li>)}</ul>;
}

function Stepper({ qty, name, onStep, onSet }: { qty: number; name: string; onStep: (delta: number) => void; onSet: (value: string) => void }) {
  return <div className="imp-st">
    <button type="button" onClick={() => onStep(-1)} aria-label={`${name}: bittaga kamaytirish`}>−</button>
    <input inputMode="numeric" value={qty} onChange={event => { if (event.target.value.trim()) onSet(event.target.value); }} aria-label={`${name}: soni`}/>
    <button type="button" className="p" onClick={() => onStep(1)} aria-label={`${name}: bittaga ko‘paytirish`}>+</button>
  </div>;
}

function CartDrawer({ cart, setCart, edit, onClose }: { cart: Cart; setCart: (cart: Cart) => void; edit: Edit; onClose: () => void }) {
  const [client, setClient] = useState(edit?.client ?? ""), [neededBy, setNeededBy] = useState(edit?.neededBy ?? ""), [comment, setComment] = useState(edit?.comment ?? "");
  const [done, setDone] = useState<{ number: string; lines: number; pieces: number } | null>(null), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const lines = Object.entries(cart);

  const submit = () => startTransition(async () => {
    setError("");
    const result = await submitImportOrderAction({ orderId: edit?.orderId, requestId, items: lines.map(([productId, line]) => ({ productId, qty: line.qty })), client, neededBy, comment });
    if (!result.ok) { setError(result.error); return; }
    setDone({ number: result.number, lines: lines.length, pieces: cartTotal(cart) });
    setCart({}); setClient(""); setNeededBy(""); setComment(""); setRequestId(crypto.randomUUID());
  });

  return <div className="imp-dr" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="imp-pn" role="dialog" aria-modal="true" aria-label="Savatcha">
      <div className="imp-pn-head"><h2>🛒 Savatcha</h2><button type="button" className="imp-close" onClick={onClose} aria-label="Yopish">×</button></div>
      {edit?.note && <div className="imp-note">Qaytarish sababi: {edit.note}</div>}
      {done && <div className="imp-ok">✅ Zayavka {done.number} yuborildi — {done.lines} pozitsiya, {done.pieces} dona. Holat: Tasdiq kutilmoqda. <Link href="/admin/import/my">Mening zayavkalarim</Link></div>}
      {lines.length ? <>
        <div>{lines.map(([productId, line]) => <div key={productId} className="imp-ri">
          <div className="x">{line.name}<span>{line.code} · {line.model}</span></div>
          <Stepper qty={line.qty} name={line.name} onStep={delta => setCart(cartStep(cart, productId, delta))} onSet={value => setCart(cartSet(cart, productId, value))}/>
          <button type="button" className="imp-del" onClick={() => setCart(cartSet(cart, productId, 0))} aria-label={`${line.name}: o‘chirish`}>🗑</button>
        </div>)}</div>
        <label className="bk-field"><span>Mijoz (ixtiyoriy)</span><input value={client} onChange={event => setClient(event.target.value)} maxLength={200}/></label>
        <label className="bk-field"><span>Kerakli muddat</span><input type="date" value={neededBy} onChange={event => setNeededBy(event.target.value)}/></label>
        <label className="bk-field"><span>Izoh</span><textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={1000}/></label>
        {error && <p className="imp-err" role="alert">{error}</p>}
        <button type="button" className="imp-send" onClick={submit} disabled={pending}>
          <BusyLabel busy={pending} busyText="Yuborilmoqda…">{edit ? `↩ Qayta yuborish ${edit.number}` : "✓ Rasmiylashtirish → tasdiqlovchiga"}</BusyLabel>
        </button>
      </> : !done && <p className="bk-muted">Savatcha bo‘sh.</p>}
    </aside>
  </div>;
}
