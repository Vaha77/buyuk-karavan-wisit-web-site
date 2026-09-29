"use client";

import { useState } from "react";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bot, Boxes, Calculator, CalendarDays, Camera, ChevronLeft, FolderKanban, History, Home, LayoutDashboard, Link2, LogOut, Menu, MessageSquare, Package, Search, Settings, ShoppingBag, UserCheck, Users, X } from "lucide-react";
import { logoutAction } from "@/app/admin/login/actions";

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; superOnly?: boolean; badge?: "leads" | "new"; soon?: boolean };
// Grouped as in the BKLead design; items without a page yet are shown disabled with "Tez orada".
const navigation: Array<{ group: string; items: NavItem[] }> = [
  { group: "ASOSIY", items: [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { label: "Mahsulotlar", href: "/admin/products", icon: Package },
    { label: "Loyihalar", href: "/admin/projects", icon: FolderKanban },
    { label: "Foto Studio", href: "/admin/photo-studio", icon: Camera },
    { label: "AI Ofis", href: "/admin/ai-office", icon: Bot },
  ] },
  { group: "CRM", items: [
    { label: "Mijoz so‘rovlari", href: "/admin/leads", icon: MessageSquare, badge: "leads" },
    { label: "Referal linklar", href: "/admin/links", icon: Link2, badge: "new" },
    { label: "Mijozlar", href: "/admin/customers", icon: Users },
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

const roleLabels = { SUPER_ADMIN: "Super Admin", ADMIN: "Administrator", MANAGER: "Menejer" };

function NavigationPending() {
  const { pending } = useLinkStatus();
  return <span className={`admin-nav-pending ${pending ? "is-pending" : ""}`} aria-hidden />;
}

export function AdminShell({ children, user, newLeads = 0, linksBadge = false }: { children: React.ReactNode; user: { name: string; role: keyof typeof roleLabels }; newLeads?: number; linksBadge?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const homeContentRoute = pathname.startsWith("/admin/content/home");
  const leadsRoute = pathname.startsWith("/admin/leads");
  const photoStudioRoute = pathname.startsWith("/admin/photo-studio");
  const aiOfficeRoute = pathname.startsWith("/admin/ai-office");
  const projectsRoute = pathname.startsWith("/admin/projects");
  const salesAgentsRoute = pathname.startsWith("/admin/sales-agents");
  const salesRoute = pathname === "/admin/sales" || pathname.startsWith("/admin/sales/");
  const rewardsRoute = pathname.startsWith("/admin/rewards");
  const backupsRoute = pathname.startsWith("/admin/backups");
  const settingsRoute = pathname.startsWith("/admin/settings");
  const calculationsRoute = pathname.startsWith("/admin/calculations");
  const calculationTitle = pathname === "/admin/calculations" ? "Hisob-kitob" : pathname === "/admin/calculations/new" ? "Hisob-kitob / Yangi tijorat taklifi" : "Hisob-kitob / Tijorat taklifi";
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
        <div className="admin-topbar-title"><strong>{pathname.startsWith("/admin/links") ? "Referal linklar" : pathname.startsWith("/admin/customers") ? "Doimiy mijozlar" : calculationsRoute ? calculationTitle : aiOfficeRoute ? "AI Ofis" : settingsRoute ? "Sozlamalar" : salesRoute ? "Sotuvlar" : rewardsRoute ? "Mukofotlar" : backupsRoute ? "Backup" : salesAgentsRoute ? "Sotuvchilar" : projectsRoute ? "Loyihalar" : photoStudioRoute ? "AI Foto Studio" : leadsRoute ? "Mijoz so‘rovlari" : homeContentRoute ? "Home Page" : pathname==="/admin"?"BKLead Dashboard":"Mahsulotlar"}</strong><span>{calculationsRoute ? "Tijorat takliflarini tayyorlash va boshqarish" : aiOfficeRoute ? "AI operatsiyalar uchun vizual makon" : settingsRoute ? "Markaziy sayt sozlamalari" : salesRoute?"Savdolarni tasdiqlash":rewardsRoute?"Marja mukofotlarini boshqarish":backupsRoute?"CRM ma’lumotlarini himoyalash":salesAgentsRoute ? "BKLead sotuvchilarini boshqarish" : projectsRoute ? "Saytdagi loyihalarni boshqarish" : photoStudioRoute ? "Mahsulot vizuallarini tayyorlash" : leadsRoute ? "Madina orqali kelgan mijoz murojaatlari" : homeContentRoute ? "Bosh sahifa kontentini boshqarish" : "Saytdagi mahsulotlarni boshqarish"}</span></div>
        <div className="admin-topbar-actions"><div className="admin-topbar-search"><Search size={14}/><span>Qidirish...</span></div><Bell className="admin-bell" size={18}/><span className="admin-user"><span className="admin-avatar">{user.name.trim().charAt(0).toUpperCase()}</span><span className="admin-user-details"><strong>{user.name}</strong><small>{roleLabels[user.role]}</small></span></span><form action={logoutAction}><button className="admin-logout" type="submit" aria-label="Chiqish"><LogOut size={16}/><span>Chiqish</span></button></form><button className="admin-mobile-menu" aria-label="Menyuni ochish" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={21}/></button></div>
      </header>
      <div className="admin-workspace">{children}</div>
    </div>
  </div>;
}
