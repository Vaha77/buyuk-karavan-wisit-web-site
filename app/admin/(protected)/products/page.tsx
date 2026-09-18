import type { Metadata } from "next";
import { AdminProductsPage } from "@/components/admin/admin-products";
export const metadata: Metadata = { title: "Mahsulotlar — Admin | BUYUK KARAVAN" };
export default function Page() { return <AdminProductsPage/>; }
