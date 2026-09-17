"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";

export function MadinaPlaceholder({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const [notice, setNotice] = useState(false);
  return <span className="detail-madina-wrap"><button className={className} type="button" onClick={() => setNotice(true)}>{children}<MessageSquare size={14} aria-hidden="true"/></button>{notice && <span className="detail-madina-notice" role="status">Madina AI tez orada ulanadi.</span>}</span>;
}
