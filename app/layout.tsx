import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { MadinaWidget } from "@/components/madina/madina-widget";
import "@/components/madina/madina.css";
import { VisitTracker } from "@/components/tracking/visit-tracker";
import { MetaPixel } from "@/components/tracking/meta-pixel";
import { GoogleAnalytics } from "@/components/tracking/google-analytics";
import "@/components/tracking/tracking.css";
import { SITE_URL } from "@/lib/site-url";
import { AuroraBackground } from "@/components/ui/aurora";
import { Reveal } from "@/components/ui/reveal";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
export const metadata: Metadata = { metadataBase: new URL(SITE_URL), title: "BUYUK KARAVAN — Sanoat sovutish tizimlari", description: "−40°C dan +5°C gacha professional sovutish yechimlari." };
export const viewport: Viewport = { themeColor: "#07070d", colorScheme: "dark" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="uz" className={jakarta.variable}><head><noscript><style>{".rv{opacity:1;transform:none}.bar i{transform:scaleX(var(--w,0))}"}</style></noscript></head><body><AuroraBackground/>{children}<MadinaWidget/><VisitTracker/><MetaPixel/><GoogleAnalytics/><Reveal/></body></html>; }
