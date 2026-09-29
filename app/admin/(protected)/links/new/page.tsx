import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/require-admin";
import { getLinkFormOptions } from "@/lib/referrals/form-options";
import { LinkForm } from "@/components/admin/bklead/link-form";

export const metadata: Metadata = { title: "Yangi referal link — Admin | BUYUK KARAVAN" };

export default async function NewLinkPage() {
  await requireRole("SUPER_ADMIN", "ADMIN");
  const options = await getLinkFormOptions();
  return <div className="bk"><Link className="bk-back" href="/admin/links">← Referal linklar</Link><LinkForm {...options}/></div>;
}
