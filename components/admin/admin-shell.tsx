"use client";

import { useState } from "react";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bot, Boxes, Calculator, CalendarDays, Camera, ChevronLeft, FolderKanban, Handshake, History, Home, LayoutDashboard, Link2, LogOut, Menu, MessageSquare, Package, Search, Settings, ShoppingBag, UserCheck, Users, X } from "lucide-react";
import { logoutAction } from "@/app/admin/login/actions";

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; superOnly?: boolean; badge?: "leads" | "new"; soon?: boolean };
// Grouped as in the BKLead design; items without a page yet are shown disabled with "Tez orada".
const navigation: Array<{ group: string; items: NavItem[] }> = [
  { group: "ASOSIY", items: [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { label: "Doimiy mijozlar", href: "/admin/customers", icon: Handshake },
    { label: "Mahsulotlar", href: "/admin/products", icon: Package },
    { label: "Loyihalar", href: "/admin/projects", icon: FolderKanban },
    { label: "Foto Studio", href: "/admin/photo-studio", icon: Camera },
    { label: "AI Ofis", href: "/admin/ai-office", icon: Bot },
  ] },
  { group: "CRM", items: [
    { label: "Mijoz so‘rovlari", href: "/admin/leads", icon: MessageSquare, badge: "leads" },
    { label: "Referal linklar", href: "/admin/links", icon: Link2, badge: "new" },
    { label: "Buyurtmalar", href: "#", icon: ShoppingBag, soon: true },
    { label: "Sotuvchilar", href: "/admin/sales-agents", icon: UserCheck },
    { label: "Sotuvlar", href: "/admin/sales", icon: ShoppingBag },
    { label: "Hisob-kitob", href: "/admin/calculations", icon: Calculator },
    { label: "Mukofotlar", href: "/admin/rewards", icon: CalendarDays },
  ] },
  { group: "KONTENT VA TIZIM", items: [
    { label: "Kontent", href: "/admin/content/home", icon: Boxes },
    { label: "Foydalanuvchilar", href: "/admin/users", icon: Users, superOnly: true },
    { label: "Faoliyat tarixi", href: "/admin/activity", icon: History, superOnly: true },
    { label: "Backup", href: "/admin/backups", icon: Settings },
    { label: "Sozlamalar", href: "/admin/settings", icon: Settings },
  ] },
];

// Top bar title and subtitle per section; the first matching prefix wins ("/admin" itself is exact).
const SECTIONS: Array<{ match: (path: string) => boolean; title: string | ((path: string) => string); subtitle: string }> = [
  { match: path => path === "/admin", title: "BKLead Dashboard", subtitle: "Lidlar, sotuvlar va hududlar bo‘yicha umumiy holat" },
  { match: path => path.startsWith("/admin/customers"), title: "Doimiy mijozlar", subtitle: "Viloyatlar bo‘yicha savdo va yillik reyting" },
  { match: path => path.startsWith("/admin/links"), title: "Referal linklar", subtitle: "Havolalar, kliklar va ulardan kelgan lidlar" },
  { match: path => path.startsWith("/admin/calculations"), title: path => path === "/admin/calculations" ? "Hisob-kitob" : path === "/admin/calculations/new" ? "Hisob-kitob / Yangi tijorat taklifi" : "Hisob-kitob / Tijorat taklifi", subtitle: "Tijorat takliflarini tayyorlash va boshqarish" },
  { match: path => path.startsWith("/admin/ai-office"), title: "AI Ofis", subtitle: "AI operatsiyalar uchun vizual makon" },
  { match: path => path.startsWith("/admin/settings"), title: "Sozlamalar", subtitle: "Markaziy sayt sozlamalari" },
  { match: path => path === "/admin/sales" || path.startsWith("/admin/sales/"), title: "Sotuvlar", subtitle: "Savdolarni tasdiqlash" },
  { match: path => path.startsWith("/admin/rewards"), title: "Mukofotlar", subtitle: "Marja mukofotlarini boshqarish" },
  { match: path => path.startsWith("/admin/backups"), title: "Backup", subtitle: "CRM ma’lumotlarini himoyalash" },
  { match: path => path.startsWith("/admin/sales-agents"), title: "Sotuvchilar", subtitle: "BKLead sotuvchilarini boshqarish" },
  { match: path => path.startsWith("/admin/projects"), title: "Loyihalar", subtitle: "Saytdagi loyihalarni boshqarish" },
  { match: path => path.startsWith("/admin/photo-studio"), title: "AI Foto Studio", subtitle: "Mahsulot vizuallarini tayyorlash" },
  { match: path => path.startsWith("/admin/leads"), title: "Mijoz so‘rovlari", subtitle: "Madina orqali kelgan mijoz murojaatlari" },
  { match: path => path.startsWith("/admin/content/home"), title: "Home Page", subtitle: "Bosh sahifa kontentini boshqarish" },
  { match: path => path.startsWith("/admin/content"), title: "Kontent", subtitle: "Sayt kontentini boshqarish" },
  { match: path => path.startsWith("/admin/users"), title: "Foydalanuvchilar", subtitle: "Admin panel foydalanuvchilari va rollari" },
  { match: path => path.startsWith("/admin/activity"), title: "Faoliyat tarixi", subtitle: "Admin amallari jurnali" },
  { match: path => path.startsWith("/admin/products"), title: "Mahsulotlar", subtitle: "Saytdagi mahsulotlarni boshqarish" },
];
function sectionOf(path: string) {
  const section = SECTIONS.find(item => item.match(path));
  if (!section) return { title: "Admin", subtitle: "BUYUK KARAVAN boshqaruv paneli" };
  return { title: typeof section.title === "function" ? section.title(path) : section.title, subtitle: section.subtitle };
}

const roleLabels = { SUPER_ADMIN: "Super Admin", ADMIN: "Administrator", MANAGER: "Menejer" };

function NavigationPending() {
  const { pending } = useLinkStatus();
  return <span className={`admin-nav-pending ${pending ? "is-pending" : ""}`} aria-hidden />;
}

export function AdminShell({ children, user, newLeads = 0, linksBadge = false }: { children: React.ReactNode; user: { name: string; role: keyof typeof roleLabels }; newLeads?: number; linksBadge?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const section = sectionOf(pathname);
  const homeContentRoute = pathname.startsWith("/admin/content/home");
  return <div className="admin-shell">
    <button className={`admin-drawer-backdrop ${open ? "is-open" : ""}`} aria-label="Menyuni yopish" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}/>
    <aside className={`admin-sidebar ${open ? "is-open" : ""}`}>
      <div className="admin-sidebar-brand"><span className="admin-brand-mark">✳</span><strong>BUYUK KARAVAN</strong><button className="admin-sidebar-close" onClick={() => setOpen(false)} aria-label="Menyuni yopish"><X size={18}/></button><span className="admin-sidebar-collapse"><ChevronLeft size={15}/></span></div>
      <span className="admin-sidebar-label">ADMIN</span>
      <nav aria-label="Admin navigatsiya">{navigation.map(section => <div className="admin-nav-group" key={section.group}><span className="admin-nav-group-label">{section.group}</span>{section.items.filter(item => !item.superOnly || user.role === "SUPER_ADMIN").map(item => {
        const Icon = item.icon;
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const badge = item.badge === "leads" && newLeads > 0 ? <span className="admin-nav-badge is-count">{newLeads}</span> : item.badge === "new" && linksBadge ? <span className="admin-nav-badge">YANGI</span> : null;
        return <div key={item.label}>{item.soon ? <span className="admin-nav-item is-disabled" aria-disabled="true"><Icon size={17}/>{item.label}<span className="admin-nav-badge is-soon">Tez orada</span></span> : <Link className={`admin-nav-item ${active ? "is-active" : ""}`} href={item.href} onClick={() => setOpen(false)}><Icon size={17}/>{item.label}{badge}<NavigationPending/></Link>}{item.label === "Kontent" && <Link className={`admin-nav-child ${homeContentRoute ? "is-active" : ""}`} href="/admin/content/home" onClick={() => setOpen(false)}><Home size={14}/>Home Page<NavigationPending/></Link>}</div>;
      })}</div>)}</nav>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar">
        <div className="admin-mobile-brand"><span className="admin-brand-mark">✳</span><strong>BUYUK KARAVAN</strong></div>
        <div className="admin-topbar-title"><strong>{section.title}</strong><span>{section.subtitle}</span></div>
        <div className="admin-topbar-actions"><div className="admin-topbar-search"><Search size={14}/><span>Qidirish...</span></div><Bell className="admin-bell" size={18}/><span className="admin-user"><span className="admin-avatar">{user.name.trim().charAt(0).toUpperCase()}</span><span className="admin-user-details"><strong>{user.name}</strong><small>{roleLabels[user.role]}</small></span></span><form action={logoutAction}><button className="admin-logout" type="submit" aria-label="Chiqish"><LogOut size={16}/><span>Chiqish</span></button></form><button className="admin-mobile-menu" aria-label="Menyuni ochish" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={21}/></button></div>
      </header>
      <div className="admin-workspace">{children}</div>
    </div>
  </div>;
}
