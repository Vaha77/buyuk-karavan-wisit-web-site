import Link from "next/link";
import { ChevronDown, UserRound } from "lucide-react";
import { Chip, ChipGroup } from "@/components/ui/aurora";
import { Reveal } from "./dokon-charts";
import { debtTone } from "@/lib/employees/rules";
import { money } from "@/lib/kassa/rules";

/** Phone only (kassa.css): Dashboard · Kassa · Hodimlar above the Do‘kon pages. */
export function DokonTabs({ on }: { on: "dashboard" | "kassa" | "hodimlar" }) {
  return <ChipGroup label="Do‘kon" className="dokon-tabs">
    <Chip href="/admin/dokon" on={on === "dashboard"}>Dashboard</Chip>
    <Chip href="/admin/kassa" on={on === "kassa"}>Kassa</Chip>
    <Chip href="/admin/kassa/hodimlar" on={on === "hodimlar"}>Hodimlar</Chip>
  </ChipGroup>;
}

/** Period chips kept in the URL (?p=), with "+ Davr" dates. `scroll={false}`: the charts glide to the new values in place. */
export function PeriodChips({ path, keys, on, search }: { path: string; keys: Array<[string, string]>; on: string; search: { from?: string; to?: string } }) {
  return <div className="dokon-period">
    <ChipGroup label="Davr">
      {keys.map(([key, label]) => <Link key={key} className={`chip${on === key ? " on" : ""}`} href={`${path}?p=${key}`} scroll={false}>{label}</Link>)}
      <Link className={`chip${on === "davr" ? " on" : " dash"}`} href={`${path}?p=davr`} scroll={false}>+ Davr</Link>
    </ChipGroup>
    {on === "davr" && <form className="kassa-range"><input type="hidden" name="p" value="davr"/><input type="date" name="from" defaultValue={search.from} aria-label="Dan"/><span>—</span><input type="date" name="to" defaultValue={search.to} aria-label="Gacha"/><button className="chip">Ko‘rsatish</button></form>}
  </div>;
}

/** "Kimda qancha qarz": biggest first, the biggest = 100%; a minus is green. */
export function DebtBars({ list }: { list: Array<{ id: string; name: string; debt: number }> }) {
  const widest = Math.max(1, ...list.map(item => Math.abs(item.debt)));
  if (!list.length) return <p className="kassa-empty">Hodim yo‘q.</p>;
  return <Reveal className="dokon-debts">{list.map(item => <Link key={item.id} href={`/admin/kassa/hodimlar/${item.id}`}><i className="dokon-av">{item.name.charAt(0).toUpperCase()}</i><span title={item.name}>{item.name}</span><em><u className={item.debt < 0 ? "is-minus" : undefined} style={{ "--w": `${Math.abs(item.debt) / widest * 100}%` } as React.CSSProperties}/></em><b className={debtTone(item.debt)}>{money(item.debt, "USD")}</b>›</Link>)}</Reveal>;
}

/** "Hodimni tanlang ▾": name + debt, then "+ Yangi hodim qo‘shish". */
export function EmployeeSelect({ employees, open, className = "" }: { employees: Array<{ id: string; name: string; debt: number }>; open?: boolean; className?: string }) {
  return <details className={`hodim-select ${className}`} open={open}>
    <summary><UserRound size={18}/>Hodimni tanlang<ChevronDown size={16}/></summary>
    <div>
      {employees.map(item => <Link key={item.id} href={`/admin/kassa/hodimlar/${item.id}`}><i>{item.name.charAt(0).toUpperCase()}</i>{item.name}<b className={debtTone(item.debt)}>{item.debt ? money(item.debt, "USD") : "0"}</b></Link>)}
      <Link className="hodim-add" href="/admin/kassa/hodimlar?new=1" scroll={false}>＋ Yangi hodim qo‘shish</Link>
    </div>
  </details>;
}
