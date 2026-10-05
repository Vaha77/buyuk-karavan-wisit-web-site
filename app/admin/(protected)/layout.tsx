import { AdminShell } from "@/components/admin/admin-shell";
import { getShellData } from "@/lib/admin/shell-data";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <AdminShell user={{ name: user.name, role: user.role }} {...await getShellData(user)}>{children}</AdminShell>;
}
