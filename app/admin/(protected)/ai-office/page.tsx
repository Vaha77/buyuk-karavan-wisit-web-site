import type { Metadata } from "next";
import { AiOfficeScene } from "@/components/admin/ai-office/ai-office-scene";
import "@/components/admin/ai-office/ai-office.css";

export const metadata: Metadata = { title: "AI Ofis — Admin | BUYUK KARAVAN", robots: { index: false, follow: false } };

export default function AiOfficePage() {
  return <div className="ai-office-page"><div className="admin-page-heading"><div><h1>AI Ofis</h1><p>AI agentlar ishlaydigan ofis</p></div></div><AiOfficeScene/></div>;
}
