"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Boxes, CalendarDays, ChevronLeft, LayoutDashboard, Menu, MessageSquare, Package, Search, Settings, ShoppingBag, Users, X } from "lucide-react";

const navigation = [
  { label: "Dashboard", href: "#", icon: LayoutDashboard },
  { label: "Mahsulotlar", href: "/admin/products", icon: Package },
  { label: "Buyurtmalar", href: "#", icon: ShoppingBag },
  { label: "Mijozlar", href: "#", icon: Users },
  { label: "AI Chat", href: "#", icon: MessageSquare },
  { label: "Hisob-kitoblar", href: "#", icon: CalendarDays },
  { label: "Kontent", href: "#", icon: Boxes },
  { label: "Foydalanuvchilar", href: "#", icon: Users },
  { label: "Sozlamalar", href: "#", icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return <div className="admin-shell">
    <button className={`admin-drawer-backdrop ${open ? "is-open" : ""}`} aria-label="Menyuni yopish" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}/>
    <aside className={`admin-sidebar ${open ? "is-open" : ""}`}>
      <div className="admin-sidebar-brand"><span className="admin-brand-mark">✳</span><strong>BUYUK KARAVAN</strong><button className="admin-sidebar-close" onClick={() => setOpen(false)} aria-label="Menyuni yopish"><X size={18}/></button><span className="admin-sidebar-collapse"><ChevronLeft size={15}/></span></div>
      <span className="admin-sidebar-label">ADMIN</span>
      <nav aria-label="Admin navigatsiya">{navigation.map(item => {
        const Icon = item.icon;
        const active = item.href === "/admin/products" && pathname.startsWith("/admin/products");
        return item.href === "#" ? <span className="admin-nav-item is-disabled" key={item.label}><Icon size={17}/>{item.label}</span> : <Link className={`admin-nav-item ${active ? "is-active" : ""}`} href={item.href} key={item.label} onClick={() => setOpen(false)}><Icon size={17}/>{item.label}</Link>;
      })}</nav>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar">
        <div className="admin-mobile-brand"><span className="admin-brand-mark">✳</span><strong>BUYUK KARAVAN</strong></div>
        <div className="admin-topbar-title"><strong>Mahsulotlar</strong><span>Saytdagi mahsulotlarni boshqarish</span></div>
        <div className="admin-topbar-actions"><div className="admin-topbar-search"><Search size={14}/><span>Qidirish...</span></div><Bell className="admin-bell" size={18}/><span className="admin-avatar">A</span><button className="admin-mobile-menu" aria-label="Menyuni ochish" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={21}/></button></div>
      </header>
      <div className="admin-workspace">{children}</div>
    </div>
  </div>;
}
