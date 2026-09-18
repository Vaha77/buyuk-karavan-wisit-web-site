import "server-only";
import { redirect } from "next/navigation";
import type { AdminRole } from "@/generated/prisma/client";
import { getAdminSession } from "./session";

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session.user;
}

export function hasRole(role: AdminRole, allowed: readonly AdminRole[]): boolean {
  return allowed.includes(role);
}

export async function requireRole(...roles: AdminRole[]) {
  const user = await requireAdmin();
  if (!hasRole(user.role, roles)) redirect("/admin");
  return user;
}
