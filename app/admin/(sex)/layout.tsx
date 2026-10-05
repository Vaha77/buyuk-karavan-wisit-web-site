import { AdminShell } from "@/components/admin/admin-shell";
import { getShellData } from "@/lib/admin/shell-data";
import { requireSexUser } from "@/lib/auth/require-admin";
import "@/components/admin/sex/sex.css";

/** Seh zakazlari (/admin/seh): shared by staff, SELLER and WORKSHOP; each sees their own sidebar. */
export default async function SexLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSexUser();
  return <AdminShell user={{ name: user.name, role: user.role }} {...await getShellData(user)}>{children}</AdminShell>;
}
