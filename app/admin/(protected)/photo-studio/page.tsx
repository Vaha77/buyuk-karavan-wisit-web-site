import type { Metadata } from "next";
import { PhotoStudioWorkspace } from "@/components/admin/photo-studio/photo-studio-workspace";
import "@/components/admin/photo-studio/photo-studio.css";
import { getAdminProducts } from "@/lib/products/queries";

export const metadata: Metadata = { title: "AI Foto Studio — Admin | BUYUK KARAVAN" };

export default async function PhotoStudioPage() {
  const products = await getAdminProducts();
  return <PhotoStudioWorkspace products={products.map(product => ({ id: product.id, name: product.name, model: product.model }))}/>;
}
