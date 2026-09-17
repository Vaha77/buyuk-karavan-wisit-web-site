"use client";

import { MessageSquare } from "lucide-react";

export function MadinaPlaceholder({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <span className="detail-madina-wrap"><button className={className} type="button" onClick={() => window.dispatchEvent(new Event("madina:open"))}>{children}<MessageSquare size={14} aria-hidden="true"/></button></span>;
}
