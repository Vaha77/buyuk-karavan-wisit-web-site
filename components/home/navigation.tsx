"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, Phone, X } from "lucide-react";

const links = [["Bosh sahifa", "#top"], ["Mahsulotlar", "/products"], ["Sovutish kameralari", "#yechimlar"], ["Loyihalar", "#loyihalar"], ["Biz haqimizda", "#biz-haqimizda"], ["Aloqa", "#aloqa"]] as const;
function Brand() { return <span className="brand"><span className="brand-mark" aria-hidden="true">BK</span> BUYUK KARAVAN</span>; }
function BrandHomeLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    onNavigate?.();
    if (pathname === "/") { event.preventDefault(); history.pushState(null, "", "#top"); window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  };
  return <Link href="/#top" scroll aria-label="Bosh sahifaga qaytish" onClick={handleClick}><Brand/></Link>;
}
export function Header({ onProducts = false, phone = "" }: { onProducts?: boolean; phone?: string }) {
  const [open, setOpen] = useState(false);
  const [configuredPhone, setConfiguredPhone] = useState(phone);
  const destination = (href: string) => href.startsWith("/") ? href : onProducts ? `/${href}` : href;
  const validPhone = configuredPhone && !configuredPhone.includes("[") ? configuredPhone : "";
  const phoneHref = validPhone ? `tel:${validPhone.replace(/[^+\d]/g, "")}` : "";
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  useEffect(() => {
    if (configuredPhone) return;
    const footerPhone = document.querySelector<HTMLAnchorElement>('.footer-contact a[href^="tel:"]');
    if (!footerPhone?.textContent) return;
    const value = footerPhone.textContent.trim();
    const frame = requestAnimationFrame(() => setConfiguredPhone(value));
    return () => cancelAnimationFrame(frame);
  }, [configuredPhone]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  return <><header className="site-header"><div className="header-inner glass-blur"><BrandHomeLink/><nav className="desktop-nav" aria-label="Asosiy navigatsiya">{links.map(([label, href]) => <a key={label} href={destination(href)}>{label}</a>)}</nav>{validPhone&&<a className="header-phone" href={phoneHref} aria-label={`Qo‘ng‘iroq qilish: ${validPhone}`}><Phone size={16}/><span>{validPhone}</span></a>}<a className="btn-g header-cta" href={destination("#aloqa")}>Bepul hisob-kitob <ArrowRight size={16}/></a><button className="menu-toggle" type="button" onClick={() => setOpen(true)} aria-label="Menyuni ochish" aria-expanded={open}><Menu size={21}/></button></div></header><span id="top" className="page-top-anchor" aria-hidden="true"/><div className={`mobile-menu ${open ? "is-open" : ""}`} aria-hidden={!open}><div className="mobile-menu-top"><BrandHomeLink onNavigate={() => setOpen(false)}/><button type="button" onClick={() => setOpen(false)} aria-label="Menyuni yopish"><X size={26}/></button></div><nav aria-label="Mobil navigatsiya">{links.map(([label, href]) => <a href={destination(href)} key={label} onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>{label}<ArrowRight size={17}/></a>)}</nav><div className="mobile-menu-bottom">{validPhone&&<a href={phoneHref} className="mobile-phone" tabIndex={open ? 0 : -1}><Phone size={18}/>{validPhone}</a>}<a href={destination("#aloqa")} className="btn-g btn-lg" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>Bepul hisob-kitob <ArrowRight size={17}/></a></div></div></>;
}
