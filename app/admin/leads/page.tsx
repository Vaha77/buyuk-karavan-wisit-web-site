import type { Metadata } from "next";
import { AdminLeadsPage } from "@/components/admin/admin-leads-page";
import "@/components/admin/admin-leads.css";
export const metadata: Metadata = { title: "Mijoz so‘rovlari — Admin | BUYUK KARAVAN" };
export default function Page() { return <AdminLeadsPage/>; }
