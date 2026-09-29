import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { getLinkFormOptions } from "@/lib/referrals/form-options";
import { LinkForm } from "@/components/admin/bklead/link-form";

export const metadata: Metadata = { title: "Linkni tahrirlash — Admin | BUYUK KARAVAN" };

export default async function EditLinkPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("SUPER_ADMIN", "ADMIN");
  const { id } = await params;
  const [link, options] = await Promise.all([getDb().referralLink.findUnique({ where: { id } }), getLinkFormOptions()]);
  if (!link) notFound();
  const initial = { id: link.id, name: link.name, source: link.source, slug: link.slug, targetPath: link.targetPath, cost: link.cost?.toString() ?? "", costCurrency: link.costCurrency ?? "USD", ownerAgentId: link.ownerAgentId ?? "" };
  return <div className="bk"><Link className="bk-back" href={`/admin/links/${id}`}>← {link.name}</Link><LinkForm {...options} initial={initial}/></div>;
}
