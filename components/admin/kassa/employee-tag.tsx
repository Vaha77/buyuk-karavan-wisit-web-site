"use client";
import { useRouter } from "next/navigation";

/** "👤 Atham aka" inside a kassa row (itself a link): opens the hodim page, not the correction. */
export function EmployeeTag({ id, name }: { id: string; name: string }) {
  const router = useRouter(), open = (event: React.SyntheticEvent) => { event.preventDefault(); event.stopPropagation(); router.push(`/admin/kassa/hodimlar/${id}`); };
  return <span role="link" tabIndex={0} className="kassa-htag" onClick={open} onKeyDown={event => { if (event.key === "Enter") open(event); }}>👤 {name}</span>;
}
