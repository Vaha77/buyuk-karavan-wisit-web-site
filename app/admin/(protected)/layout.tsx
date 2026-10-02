import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db";
import { referralLinksAreNew } from "@/lib/referrals/rules";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const canReview = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const [newLeads, pendingPurchases] = await Promise.all([
    getDb().lead.count({ where: { status: "NEW" } }).catch(() => 0),
    canReview ? getDb().customerPurchase.count({ where: { status: "PENDING" } }).catch(() => 0) : 0,
  ]);
  return <AdminShell user={{ name: user.name, role: user.role }} newLeads={newLeads} linksBadge={referralLinksAreNew()} pendingPurchases={pendingPurchases}>{children}</AdminShell>;
}
