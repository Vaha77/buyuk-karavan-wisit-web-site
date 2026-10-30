import type { Metadata } from "next";
import { Download } from "lucide-react";
import { GhostButton, GlassCard } from "@/components/ui/aurora";
import { DokonTabs, EmployeeSelect } from "@/components/admin/kassa/dokon-tabs";
import { EmployeeSheet } from "@/components/admin/kassa/hodim-forms";
import { requireRole } from "@/lib/auth/require-admin";
import { getEmployees } from "@/lib/employees/queries";
import { debtTone, shopDebts } from "@/lib/employees/rules";
import { money } from "@/lib/kassa/rules";
import "@/components/admin/kassa/kassa.css";

export const metadata: Metadata = { title: "Hodimlar — Admin | BUYUK KARAVAN" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ archive?: string; new?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const search = await searchParams, all = await getEmployees(), showArchive = search.archive === "1";
  const archived = all.filter(item => item.archived), { total } = shopDebts(all);
  return <div className="kassa">
    <DokonTabs on="hodimlar"/>
    <header className="kassa-top">
      <div><h1>Hodimlar</h1></div>
      <div className="kassa-actions">
        <GhostButton href={showArchive ? "/admin/kassa/hodimlar" : "/admin/kassa/hodimlar?archive=1"}>{showArchive ? "← Faol hodimlar" : `Arxiv (${archived.length})`}</GhostButton>
        <GhostButton href="/admin/kassa/hodimlar/export" prefetch={false} aria-label="Excel"><Download size={16}/><span>Excel</span></GhostButton>
      </div>
    </header>
    <GlassCard blur className="kassa-bal hodim-total"><span>Hodimlardagi umumiy qarz</span><b className={debtTone(total)}>{money(total, "USD")}</b></GlassCard>
    <EmployeeSelect employees={showArchive ? archived : all.filter(item => !item.archived)} open/>
    {search.new && <EmployeeSheet employee={null} closeHref="/admin/kassa/hodimlar"/>}
  </div>;
}
