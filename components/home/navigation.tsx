"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Camera as Instagram, Menu, Send, X } from "lucide-react";
const links = [["Bosh sahifa", "#top"], ["Mahsulotlar", "/products"], ["Sovutish kameralari", "#yechimlar"], ["Loyihalar", "#loyihalar"], ["Biz haqimizda", "#biz-haqimizda"], ["Aloqa", "#aloqa"]] as const;
function Brand({ light = false }: { light?: boolean }) { return <span className={`brand ${light ? "light" : ""}`}><span className="brand-mark" aria-hidden="true">✳</span> BUYUK KARAVAN</span>; }
function BrandHomeLink({ light = false, onNavigate }: { light?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    onNavigate?.();
    if (pathname === "/") { event.preventDefault(); window.dispatchEvent(new Event("buyuk-karavan:home-top")); return; }
    sessionStorage.setItem("buyuk-karavan:force-home-top", "1");
  };
  return <Link href="/" scroll aria-label="Bosh sahifaga qaytish" onClick={handleClick}><Brand light={light}/></Link>;
}
export function Header({ onProducts = false }: { onProducts?: boolean }) {
  const [open, setOpen] = useState(false);
  const destination = (href: string) => href.startsWith("/") ? href : onProducts ? `/${href}` : href;
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  return <><header className="site-header" id="top"><div className="header-inner"><BrandHomeLink/><nav className="desktop-nav" aria-label="Asosiy navigatsiya">{links.map(([label, href]) => <a key={label} href={destination(href)}>{label}</a>)}</nav><a className="button button-blue header-cta" href={destination("#aloqa")}>Bepul hisob-kitob <ArrowRight size={16}/></a><button className="menu-toggle" type="button" onClick={() => setOpen(true)} aria-label="Menyuni ochish" aria-expanded={open}><Menu size={23}/></button></div></header><div className={`mobile-menu ${open ? "is-open" : ""}`} aria-hidden={!open}><div className="mobile-menu-top"><BrandHomeLink light onNavigate={() => setOpen(false)}/><button type="button" onClick={() => setOpen(false)} aria-label="Menyuni yopish"><X size={29}/></button></div><nav aria-label="Mobil navigatsiya">{links.map(([label, href]) => <a href={destination(href)} key={label} onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>{label}<ArrowRight size={17}/></a>)}</nav><div className="mobile-menu-bottom"><a href={destination("#aloqa")} className="button button-white" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>Bepul hisob-kitob <ArrowRight size={17}/></a><div className="socials"><a href="https://instagram.com/buyuk_karavan" aria-label="Instagram" tabIndex={open ? 0 : -1}><Instagram size={18}/></a><a href="https://t.me/buyuk_karavan" aria-label="Telegram" tabIndex={open ? 0 : -1}><Send size={18}/></a></div></div></div></>;
}
