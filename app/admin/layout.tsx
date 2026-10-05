import "@/components/admin/admin.css";
import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "@/components/admin/bklead/bklead.css";
import "@/components/admin/feedback.css";

// Headings and numbers in the BKLead screens; body text stays IBM Plex Sans from the root layout.
const spaceGrotesk = Space_Grotesk({ variable: "--font-space", subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"] });
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={spaceGrotesk.variable}>{children}</div>;
}
