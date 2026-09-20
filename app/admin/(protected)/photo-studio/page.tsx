import type { Metadata } from "next";
import { PhotoStudioWorkspace } from "@/components/admin/photo-studio/photo-studio-workspace";
import "@/components/admin/photo-studio/photo-studio.css";

export const metadata: Metadata = { title: "AI Foto Studio — Admin | BUYUK KARAVAN" };

export default function PhotoStudioPage() {
  return <PhotoStudioWorkspace/>;
}
