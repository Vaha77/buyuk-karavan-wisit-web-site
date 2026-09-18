import type { Metadata } from "next";
import { AdminHomePage } from "@/components/admin/admin-home-page";
import "@/components/admin/admin-home.css";
export const metadata: Metadata = { title: "Home Page kontenti — Admin | BUYUK KARAVAN" };
export default function Page() { return <AdminHomePage/>; }
