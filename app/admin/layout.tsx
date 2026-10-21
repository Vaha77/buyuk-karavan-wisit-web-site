import "@/components/admin/admin.css";
import type { Metadata, Viewport } from "next";
import { AdminPwa } from "@/components/admin/admin-pwa";
import "@/components/admin/bklead/bklead.css";
import "@/components/admin/feedback.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "BK Admin", statusBarStyle: "black-translucent" },
  icons: { icon: "/admin-icons/favicon-32.png", apple: "/admin-icons/apple-touch-icon.png" },
};
// viewport-fit=cover: the app draws under the notch; the shell pads itself with env(safe-area-inset-*).
export const viewport: Viewport = { themeColor: "#07070d", viewportFit: "cover" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div>{children}<AdminPwa/></div>;
}
