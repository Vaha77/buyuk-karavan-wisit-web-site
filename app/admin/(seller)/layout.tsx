import { AdminShell } from "@/components/admin/admin-shell";
import { requireSeller } from "@/lib/auth/require-admin";
import { myDueCustomers } from "@/lib/customers/seller-queries";

/** Seller section (/admin/my): its own layout so the staff layout (and its lead counts) never runs for a SELLER. */
export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSeller();
  const due = user.salesPersonId ? (await myDueCustomers(user).catch(() => [])).length : 0;
  return <AdminShell user={{ name: user.name, role: user.role }} dueToday={due}>{children}</AdminShell>;
}
