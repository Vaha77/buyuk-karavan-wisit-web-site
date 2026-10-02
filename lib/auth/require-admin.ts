import "server-only";
import { forbidden, redirect } from "next/navigation";
import type { AdminRole } from "@/generated/prisma/client";
import { getAdminSession } from "./session";

async function requireSession() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session.user;
}

/** Staff of the admin panel (SUPER_ADMIN, ADMIN, MANAGER). A SELLER gets 403 on every page and server action using it. */
export async function requireAdmin() {
  const user = await requireSession();
  if (user.role === "SELLER") forbidden();
  return user;
}

export function hasRole(role: AdminRole, allowed: readonly AdminRole[]): boolean {
  return allowed.includes(role);
}

export async function requireRole(...roles: AdminRole[]) {
  const user = await requireSession();
  if (user.role === "SELLER" && !roles.includes("SELLER")) forbidden();
  if (!hasRole(user.role, roles)) redirect("/admin");
  return user;
}

/** Seller pages and actions: only a SELLER; `salesPersonId` is the only scope their queries may use. */
export async function requireSeller() {
  const user = await requireSession();
  if (user.role !== "SELLER") redirect("/admin");
  return { user, salesPersonId: user.salesPersonId };
}
