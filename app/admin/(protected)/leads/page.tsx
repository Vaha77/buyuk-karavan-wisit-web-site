import type { Metadata } from "next";
import { AdminLeadsPage } from "@/components/admin/admin-leads-page";
import "@/components/admin/admin-leads.css";
import { getAdminLeads } from "@/lib/leads/queries";
export const metadata: Metadata = { title: "Mijoz so‘rovlari — Admin | BUYUK KARAVAN" };
export default async function Page() { return <AdminLeadsPage leads={await getAdminLeads()}/>; }
