"use client";

import { useEffect, useState } from "react";
import { daysPastDue, workingSince } from "@/lib/sex/rules";

/** "Sexda ishlanmoqda" with a moving bar and the time since acceptance; red once the due date has passed. Re-renders every minute. */
export function WorkingProgress({ acceptedAt, dueDate }: { acceptedAt: string; dueDate: string | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const late = daysPastDue(dueDate, now);
  return <div className={`sx-working${late ? " is-late" : ""}`}>
    <span className="sx-working-label">Sexda ishlanmoqda</span>
    <span className="sx-working-bar" role="progressbar" aria-label="Sexda ishlanmoqda" aria-valuetext={workingSince(acceptedAt, now)}><span/></span>
    <span className="sx-working-time" suppressHydrationWarning>{workingSince(acceptedAt, now)}{late ? ` · muddatdan ${late} kun o‘tdi` : ""}</span>
  </div>;
}
