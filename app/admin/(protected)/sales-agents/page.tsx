import type { Metadata } from "next";import { AdminSalesAgents } from "@/components/admin/admin-sales-agents";import { getAdminSalesAgents } from "@/lib/sales-agents/queries";
export const metadata:Metadata={title:"Sotuvchilar — Admin | BUYUK KARAVAN"};
export default async function Page(){return <AdminSalesAgents agents={await getAdminSalesAgents()}/>;}
