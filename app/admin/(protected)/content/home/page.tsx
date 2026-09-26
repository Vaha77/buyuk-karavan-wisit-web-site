import type { Metadata } from "next";
import { AdminHomePage } from "@/components/admin/admin-home-page";
import { getHomeContent } from "@/lib/home/content";
import { getAdminProductOptions } from "@/lib/products/queries";
import "@/components/admin/admin-home.css";
export const metadata: Metadata = { title: "Home Page kontenti — Admin | BUYUK KARAVAN" };
export default async function Page() { const [content,products]=await Promise.all([getHomeContent(),getAdminProductOptions()]); return <AdminHomePage initialContent={content} products={products}/>; }
