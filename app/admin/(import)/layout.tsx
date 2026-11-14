import { AdminShell } from "@/components/admin/admin-shell";
import { getShellData } from "@/lib/admin/shell-data";
import { requireImportUser } from "@/lib/auth/require-admin";
import "@/components/admin/import/import.css";

/** Import buyurtma (/admin/import): sellers and staff share it; each sees their own sidebar. */
export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  const user = await requireImportUser();
  return <AdminShell user={{ name: user.name, role: user.role }} {...await getShellData(user)}>{children}</AdminShell>;
}
