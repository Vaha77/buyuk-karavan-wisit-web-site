"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { globalSearchAction } from "@/app/admin/search-action";
import type { SearchHit } from "@/lib/search/service";

/** Topbar "Qidirish": click, Ctrl+K or "/" opens it; the server searches what the role may see, pages are matched here. */
export function AdminSearch({ pages }: { pages: Array<{ label: string; href: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [hits, setHits] = useState<SearchHit[]>([]), [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) { event.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  // 300 ms after the last key, at least 2 characters.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const timer = setTimeout(() => startTransition(async () => { setHits(await globalSearchAction(text)); setActive(0); }), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const text = query.trim().toLowerCase();
  const pageHits: SearchHit[] = text.length < 2 ? [] : pages.filter(page => page.label.toLowerCase().includes(text)).slice(0, 5).map(page => ({ group: "Sahifalar", title: page.label, detail: page.href, href: page.href }));
  const results = text.length < 2 ? [] : [...hits, ...pageHits];
  const close = () => { setOpen(false); setQuery(""); setHits([]); };
  const go = (hit: SearchHit | undefined) => { if (!hit) return; close(); router.push(hit.href); };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") close();
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(index => (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(results.length, 1)); }
    else if (event.key === "Enter") { event.preventDefault(); go(results[active]); }
  };

  return <>
    <button type="button" className="admin-topbar-search" onClick={() => setOpen(true)} aria-label="Qidirish (Ctrl+K)"><Search size={14}/><span>Qidirish...</span><kbd>Ctrl K</kbd></button>
    {open && <div className="admin-search-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="admin-search" role="dialog" aria-modal="true" aria-label="Qidirish">
        <div className="admin-search-field"><Search size={18} aria-hidden="true"/>
          <input ref={input} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder="Mijoz, telefon, #zakaz, model, KP…" role="combobox" aria-expanded={results.length > 0} aria-controls="admin-search-list" aria-activedescendant={results.length ? `admin-search-${active}` : undefined}/>
          <button type="button" onClick={close} aria-label="Yopish"><X size={18}/></button>
        </div>
        <ul id="admin-search-list" role="listbox" className="admin-search-list">
          {results.map((hit, index) => <li key={`${hit.group}-${hit.href}-${index}`}>
            {(index === 0 || results[index - 1].group !== hit.group) && <span className="admin-search-group">{hit.group}</span>}
            <button type="button" id={`admin-search-${index}`} role="option" aria-selected={index === active} className={index === active ? "is-active" : undefined} onMouseEnter={() => setActive(index)} onClick={() => go(hit)}><b>{hit.title}</b>{hit.detail && <small>{hit.detail}</small>}</button>
          </li>)}
        </ul>
        {text.length >= 2 && !results.length && <p className="admin-search-empty">{pending ? "Qidirilmoqda…" : "Hech narsa topilmadi"}</p>}
        {text.length < 2 && <p className="admin-search-empty">Kamida 2 ta belgi yozing · ↑ ↓ Enter · Esc</p>}
      </div>
    </div>}
  </>;
}
