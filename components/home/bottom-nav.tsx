"use client";
import { usePathname } from "next/navigation";
import { FolderOpen, House, LayoutGrid, MessageCircle, Phone } from "lucide-react";
import { BottomNav } from "@/components/ui/aurora";

/** Public phone bar (< 768px); the FAB calls the footer phone, or opens the contact form when none is set. */
export function PublicBottomNav({ phoneHref }: { phoneHref: string }) {
  const pathname = usePathname();
  return <BottomNav label="Telefon navigatsiyasi" fab={{ href: phoneHref || "/#aloqa", label: phoneHref ? "Qo‘ng‘iroq qilish" : "Bog‘lanish", icon: <Phone size={24} strokeWidth={2.3}/> }} items={[
    { href: "/", label: "Bosh sahifa", icon: <House size={20}/>, on: pathname === "/" },
    { href: "/products", label: "Katalog", icon: <LayoutGrid size={20}/>, on: pathname.startsWith("/products") },
    { href: "/#loyihalar", label: "Loyihalar", icon: <FolderOpen size={20}/>, on: pathname.startsWith("/projects") },
    { href: "/#aloqa", label: "Aloqa", icon: <MessageCircle size={20}/> },
  ]}/>;
}
