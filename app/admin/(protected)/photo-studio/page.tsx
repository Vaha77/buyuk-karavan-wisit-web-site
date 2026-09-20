import type { Metadata } from "next";
import { PhotoStudioWorkspace } from "@/components/admin/photo-studio/photo-studio-workspace";
import "@/components/admin/photo-studio/photo-studio.css";
import { getAdminProducts } from "@/lib/products/queries";
import { getAdminProduct360Assets } from "@/lib/product-360/queries";

export const metadata: Metadata = { title: "AI Foto Studio — Admin | BUYUK KARAVAN" };

export default async function PhotoStudioPage() {
  const [products, assets360] = await Promise.all([getAdminProducts(), getAdminProduct360Assets()]);
  return <PhotoStudioWorkspace products={products.map(product => ({ id: product.id, name: product.name, model: product.model }))} assets360={assets360}/>;
}
