import { AdminShell } from "@/components/admin/admin-shell";
import { getShellData } from "@/lib/admin/shell-data";
import { requireSeller } from "@/lib/auth/require-admin";

/** Seller section (/admin/my): its own layout so the staff layout (and its lead counts) never runs for a SELLER. */
export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSeller();
  return <AdminShell user={{ name: user.name, role: user.role }} {...await getShellData(user)}>{children}</AdminShell>;
}
