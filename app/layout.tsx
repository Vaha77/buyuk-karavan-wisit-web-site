import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
export const metadata: Metadata = { title: "BUYUK KARAVAN — Sanoat sovutish tizimlari", description: "−40°C dan +5°C gacha professional sovutish yechimlari." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="uz" className={plex.variable}><body>{children}</body></html>; }
