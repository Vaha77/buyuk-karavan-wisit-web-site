import type { Metadata } from "next";
import { PhotoStudioWorkspace } from "@/components/admin/photo-studio/photo-studio-workspace";
import "@/components/admin/photo-studio/photo-studio.css";
import { getAdminProductOptions } from "@/lib/products/queries";

export const metadata: Metadata = { title: "AI Foto Studio — Admin | BUYUK KARAVAN" };

export default async function PhotoStudioPage() {
  const products = await getAdminProductOptions();
  return <PhotoStudioWorkspace products={products}/>;
}
