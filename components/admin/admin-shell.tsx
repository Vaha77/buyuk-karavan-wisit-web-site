"use client";

import { useState } from "react";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, Bell, Bot, Boxes, Calculator, CalendarDays, Camera, ChevronLeft, ClipboardList, FolderKanban, Handshake, History, Home, LayoutDashboard, Link2, LogOut, Menu, MessageSquare, Package, PhoneCall, PlusCircle, Search, Settings, ShoppingBag, Tags, Target, UserCheck, Users, Wrench, X } from "lucide-react";
import { logoutAction } from "@/app/admin/login/actions";
import { homeFor } from "@/lib/auth/seller-access";

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; superOnly?: boolean; adminOnly?: boolean; badge?: "leads" | "new" | "purchases" | "due" | "sex"; soon?: boolean };
// Grouped as in the BKLead design; items without a page yet are shown disabled with "Tez orada".
const navigation: Array<{ group: string; items: NavItem[] }> = [
  { group: "ASOSIY", items: [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { label: "Doimiy mijozlar", href: "/admin/customers", icon: Handshake },
    { label: "Tasdiqlash kerak", href: "/admin/customers/purchases", icon: BadgeCheck, adminOnly: true, badge: "purchases" },
    { label: "Nazorat", href: "/admin/customers/control", icon: ClipboardList, adminOnly: true },
    { label: "Mahsulotlar", href: "/admin/products", icon: Package },
    { label: "Prays", href: "/admin/prays", icon: Tags, superOnly: true },
    { label: "Loyihalar", href: "/admin/projects", icon: FolderKanban },
    { label: "Foto Studio", href: "/admin/photo-studio", icon: Camera },
    { label: "AI Ofis", href: "/admin/ai-office", icon: Bot },
  ] },
  { group: "CRM", items: [
    { label: "Mijoz so‘rovlari", href: "/admin/leads", icon: MessageSquare, badge: "leads" },
    { label: "Referal linklar", href: "/admin/links", icon: Link2, badge: "new" },
    { label: "Buyurtmalar", href: "#", icon: ShoppingBag, soon: true },
    { label: "Sex zakazlari", href: "/admin/sex", icon: Wrench, badge: "sex" },
    { label: "Sotuvchilar", href: "/admin/sales-agents", icon: UserCheck },
    { label: "Sotuv rejasi", href: "/admin/sales-plan", icon: Target, adminOnly: true },
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
  { match: path => path.startsWith("/admin/customers/purchases"), title: "Tasdiqlash kerak", subtitle: "Sotuvchilar kiritgan xaridlarni tasdiqlash yoki rad etish" },
  { match: path => path.startsWith("/admin/customers/control"), title: "Nazorat", subtitle: "Sotuvchilar bo‘yicha muddati o‘tgan qo‘ng‘iroqlar" },
  { match: path => path === "/admin/my", title: "Mening mijozlarim", subtitle: "Sizga biriktirilgan doimiy mijozlar" },
  { match: path => path.startsWith("/admin/sex/new"), title: "Sex / Yangi zakaz", subtitle: "Zborka buyurtmasi yoki zapchast zayavkasi" },
  { match: path => path.startsWith("/admin/sex"), title: "Sex zakazlari", subtitle: "Zayavka → Qabul → Chiqib ketdi → Krimga olindi" },
  { match: path => path.startsWith("/admin/my/today"), title: "Bugun qo‘ng‘iroq", subtitle: "Qo‘ng‘iroq qilish vaqti kelgan mijozlar" },
  { match: path => path.startsWith("/admin/my/purchase"), title: "Xarid kiritish", subtitle: "Xarid admin tasdiqlagach hisobga olinadi" },
  { match: path => path.startsWith("/admin/my/"), title: "Mijoz", subtitle: "Qo‘ng‘iroqlar va xaridlar" },
  { match: path => path.startsWith("/admin/customers"), title: "Doimiy mijozlar", subtitle: "Viloyatlar bo‘yicha savdo va yillik reyting" },
  { match: path => path.startsWith("/admin/links"), title: "Referal linklar", subtitle: "Havolalar, kliklar va ulardan kelgan lidlar" },
  { match: path => path.startsWith("/admin/calculations"), title: path => path === "/admin/calculations" ? "Hisob-kitob" : path === "/admin/calculations/new" ? "Hisob-kitob / Yangi tijorat taklifi" : path === "/admin/calculations/configurator" ? "Hisob-kitob / Komplekt konfiguratori" : "Hisob-kitob / Tijorat taklifi", subtitle: "Tijorat takliflarini tayyorlash va boshqarish" },
  { match: path => path.startsWith("/admin/ai-office"), title: "AI Ofis", subtitle: "AI operatsiyalar uchun vizual makon" },
  { match: path => path.startsWith("/admin/settings"), title: "Sozlamalar", subtitle: "Markaziy sayt sozlamalari" },
  { match: path => path === "/admin/sales" || path.startsWith("/admin/sales/"), title: "Sotuvlar", subtitle: "Savdolarni tasdiqlash" },
  { match: path => path.startsWith("/admin/rewards"), title: "Mukofotlar", subtitle: "Marja mukofotlarini boshqarish" },
  { match: path => path.startsWith("/admin/backups"), title: "Backup", subtitle: "CRM ma’lumotlarini himoyalash" },
  { match: path => path === "/admin/sales-plan/people", title: "Sotuv rejasi / Sotuvchilar", subtitle: "Sotuvchilar, davrlar va rejalar" },
  { match: path => path.startsWith("/admin/sales-plan"), title: "Sotuv rejasi", subtitle: "Xodim va filiallar sotuv rejasining bajarilishi" },
  { match: path => path.startsWith("/admin/sales-agents"), title: "Sotuvchilar", subtitle: "BKLead sotuvchilarini boshqarish" },
  { match: path => path.startsWith("/admin/projects"), title: "Loyihalar", subtitle: "Saytdagi loyihalarni boshqarish" },
  { match: path => path.startsWith("/admin/photo-studio"), title: "AI Foto Studio", subtitle: "Mahsulot vizuallarini tayyorlash" },
  { match: path => path.startsWith("/admin/leads"), title: "Mijoz so‘rovlari", subtitle: "Madina orqali kelgan mijoz murojaatlari" },
  { match: path => path.startsWith("/admin/content/home"), title: "Home Page", subtitle: "Bosh sahifa kontentini boshqarish" },
  { match: path => path.startsWith("/admin/content"), title: "Kontent", subtitle: "Sayt kontentini boshqarish" },
  { match: path => path.startsWith("/admin/users"), title: "Foydalanuvchilar", subtitle: "Admin panel foydalanuvchilari va rollari" },
  { match: path => path.startsWith("/admin/activity"), title: "Faoliyat tarixi", subtitle: "Admin amallari jurnali" },
  { match: path => path.startsWith("/admin/products"), title: "Mahsulotlar", subtitle: "Saytdagi mahsulotlarni boshqarish" },
  { match: path => path.startsWith("/admin/prays"), title: "Prays", subtitle: "Prays narxlari, sotuv ustamasi va sex zapchastlari" },
];
function sectionOf(path: string) {
  const section = SECTIONS.find(item => item.match(path));
  if (!section) return { title: "Admin", subtitle: "BUYUK KARAVAN boshqaruv paneli" };
  return { title: typeof section.title === "function" ? section.title(path) : section.title, subtitle: section.subtitle };
}

// A SELLER only has their own section (proxy.ts and requireAdmin enforce it on the server).
const sellerNavigation: Array<{ group: string; items: NavItem[] }> = [
  { group: "MENING BO‘LIMIM", items: [
    { label: "Mening mijozlarim", href: "/admin/my", icon: Users },
    { label: "Bugun qo‘ng‘iroq", href: "/admin/my/today", icon: PhoneCall, badge: "due" },
    { label: "Xarid kiritish", href: "/admin/my/purchase", icon: ShoppingBag },
  ] },
  { group: "SEX", items: [
    { label: "Mening zakazlarim", href: "/admin/sex", icon: Wrench },
    { label: "Yangi zakaz", href: "/admin/sex/new", icon: PlusCircle },
  ] },
];

// WORKSHOP (Sex mas'uli) only works with workshop orders.
const workshopNavigation: Array<{ group: string; items: NavItem[] }> = [
  { group: "SEX", items: [
    { label: "Mening vazifalarim", href: "/admin/sex", icon: Wrench, badge: "sex" },
  ] },
];

const roleLabels = { SUPER_ADMIN: "Super Admin", ADMIN: "Administrator", MANAGER: "Menejer", SELLER: "Sotuvchi", WORKSHOP: "Sex mas‘uli" };

function NavigationPending() {
  const { pending } = useLinkStatus();
  return <span className={`admin-nav-pending ${pending ? "is-pending" : ""}`} aria-hidden />;
}

export function AdminShell({ children, user, newLeads = 0, linksBadge = false, pendingPurchases = 0, dueToday = 0, sexBadge = 0 }: { children: React.ReactNode; user: { name: string; role: keyof typeof roleLabels }; newLeads?: number; linksBadge?: boolean; pendingPurchases?: number; dueToday?: number; sexBadge?: number }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const section = sectionOf(pathname);
  const homeContentRoute = pathname.startsWith("/admin/content/home");
  const groups = user.role === "SELLER" ? sellerNavigation : user.role === "WORKSHOP" ? workshopNavigation : navigation;
  const home = homeFor(user.role);
  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const visible = (item: NavItem) => (!item.superOnly || user.role === "SUPER_ADMIN") && (!item.adminOnly || isAdmin);
  // The most specific matching item is active, so /admin/customers/purchases does not also light up "Doimiy mijozlar".
  const activeHref = groups.flatMap(group => group.items).filter(item => !item.soon && (item.href === pathname || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`)))).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return <div className="admin-shell">
    <button className={`admin-drawer-backdrop ${open ? "is-open" : ""}`} aria-label="Menyuni yopish" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}/>
    <aside className={`admin-sidebar ${open ? "is-open" : ""}`}>
      <div className="admin-sidebar-brand"><Link href={home} className="admin-brand-link" onClick={() => setOpen(false)}><span className="admin-brand-mark">✳</span><strong>BUYUK KARAVAN</strong></Link><button className="admin-sidebar-close" onClick={() => setOpen(false)} aria-label="Menyuni yopish"><X size={18}/></button><span className="admin-sidebar-collapse"><ChevronLeft size={15}/></span></div>
      <span className="admin-sidebar-label">{user.role === "SELLER" ? "SOTUVCHI" : user.role === "WORKSHOP" ? "SEX" : "ADMIN"}</span>
      <nav aria-label="Admin navigatsiya">{groups.map(section => <div className="admin-nav-group" key={section.group}><span className="admin-nav-group-label">{section.group}</span>{section.items.filter(visible).map(item => {
        const Icon = item.icon;
        const active = item.href === activeHref;
        const count = item.badge === "leads" ? newLeads : item.badge === "purchases" ? pendingPurchases : item.badge === "due" ? dueToday : item.badge === "sex" ? sexBadge : 0;
        const badge = count > 0 ? <span className="admin-nav-badge is-count">{count}</span> : item.badge === "new" && linksBadge ? <span className="admin-nav-badge">YANGI</span> : null;
        return <div key={item.label}>{item.soon ? <span className="admin-nav-item is-disabled" aria-disabled="true"><Icon size={17}/>{item.label}<span className="admin-nav-badge is-soon">Tez orada</span></span> : <Link className={`admin-nav-item ${active ? "is-active" : ""}`} href={item.href} onClick={() => setOpen(false)}><Icon size={17}/>{item.label}{badge}<NavigationPending/></Link>}{item.label === "Kontent" && <Link className={`admin-nav-child ${homeContentRoute ? "is-active" : ""}`} href="/admin/content/home" onClick={() => setOpen(false)}><Home size={14}/>Home Page<NavigationPending/></Link>}</div>;
      })}</div>)}</nav>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar">
        <Link href={home} className="admin-mobile-brand"><span className="admin-brand-mark">✳</span><strong>BUYUK KARAVAN</strong></Link>
        <div className="admin-topbar-title"><strong>{section.title}</strong><span>{section.subtitle}</span></div>
        <div className="admin-topbar-actions"><div className="admin-topbar-search"><Search size={14}/><span>Qidirish...</span></div><Bell className="admin-bell" size={18}/><span className="admin-user"><span className="admin-avatar">{user.name.trim().charAt(0).toUpperCase()}</span><span className="admin-user-details"><strong>{user.name}</strong><small>{roleLabels[user.role]}</small></span></span><form action={logoutAction}><button className="admin-logout" type="submit" aria-label="Chiqish"><LogOut size={16}/><span>Chiqish</span></button></form><button className="admin-mobile-menu" aria-label="Menyuni ochish" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={21}/></button></div>
      </header>
      <div className="admin-workspace">{children}</div>
    </div>
  </div>;
}
