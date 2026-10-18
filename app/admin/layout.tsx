import "@/components/admin/admin.css";
import type { Metadata, Viewport } from "next";
import { AdminPwa } from "@/components/admin/admin-pwa";
import { Space_Grotesk } from "next/font/google";
import "@/components/admin/bklead/bklead.css";
import "@/components/admin/feedback.css";

// Headings and numbers in the BKLead screens; body text stays IBM Plex Sans from the root layout.
const spaceGrotesk = Space_Grotesk({ variable: "--font-space", subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"] });
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "BK Admin", statusBarStyle: "default" },
  icons: { icon: "/admin-icons/favicon-32.png", apple: "/admin-icons/apple-touch-icon.png" },
};
// viewport-fit=cover: the app draws under the notch; the shell pads itself with env(safe-area-inset-*).
export const viewport: Viewport = { themeColor: "#102c47", viewportFit: "cover" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={spaceGrotesk.variable}>{children}<AdminPwa/></div>;
}
