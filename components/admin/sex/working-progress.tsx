"use client";

import { useEffect, useState } from "react";
import { daysPastDue, workingSince } from "@/lib/sex/rules";

/** One clock per component, re-rendered every minute (the time text and the overdue colour depend on it). */
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** "Qabul qilindi" badge with a wave filling it (design E+F); red once the due date has passed. */
export function AcceptedBadge({ label, dueDate }: { label: string; dueDate: string | null }) {
  const late = daysPastDue(dueDate, useMinuteClock()) > 0;
  return <span className={`sx-pill sx-wave${late ? " is-late" : " is-yellow"}`} suppressHydrationWarning><span className="sx-wave-fill" aria-hidden/><span className="sx-wave-text">{label}</span></span>;
}

const Wrench = () => <svg className="sx-wrench" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>;

/** Amal column of an ACCEPTED order: moving wrench, "Sehda ishlanmoqda" and the time since acceptance. */
export function WorkingStatus({ acceptedAt, dueDate }: { acceptedAt: string; dueDate: string | null }) {
  const now = useMinuteClock(), late = daysPastDue(dueDate, now) > 0;
  return <span className={`sx-working${late ? " is-late" : ""}`}>
    <Wrench/>
    <span className="sx-working-text"><span>Sehda ishlanmoqda</span><span className="sx-working-time" suppressHydrationWarning>{workingSince(acceptedAt, now)}{late ? " · muddat o‘tdi" : ""}</span></span>
  </span>;
}
