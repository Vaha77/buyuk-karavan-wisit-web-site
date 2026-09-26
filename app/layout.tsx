import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { MadinaWidget } from "@/components/madina/madina-widget";
import "@/components/madina/madina.css";
import { SITE_URL } from "@/lib/site-url";

const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
export const metadata: Metadata = { metadataBase: new URL(SITE_URL), title: "BUYUK KARAVAN — Sanoat sovutish tizimlari", description: "−40°C dan +5°C gacha professional sovutish yechimlari." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="uz" className={plex.variable}><body>{children}<MadinaWidget/></body></html>; }
