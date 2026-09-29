import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { referralLinksAreNew } from "@/lib/referrals/rules";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const newLeads = await getDb().lead.count({ where: { status: "NEW" } }).catch(() => 0);
  return <AdminShell user={{ name: user.name, role: user.role }} newLeads={newLeads} linksBadge={referralLinksAreNew()}>{children}</AdminShell>;
}
