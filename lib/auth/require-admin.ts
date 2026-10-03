import "server-only";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import type { AdminRole } from "@/generated/prisma/client";
import { getAdminSession } from "./session";
import { SELLER_HOME } from "./seller-access";

async function requireSession() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session.user;
}

/** A SELLER outside their section: a page render goes to /admin/my, a server action (Next-Action header) gets 403. */
async function rejectSeller(): Promise<never> {
  if ((await headers()).has("next-action")) forbidden();
  redirect(SELLER_HOME);
}

/** Staff of the admin panel (SUPER_ADMIN, ADMIN, MANAGER). A SELLER is sent to /admin/my (pages) or gets 403 (actions). */
export async function requireAdmin() {
  const user = await requireSession();
  if (user.role === "SELLER") await rejectSeller();
  return user;
}

export function hasRole(role: AdminRole, allowed: readonly AdminRole[]): boolean {
  return allowed.includes(role);
}

export async function requireRole(...roles: AdminRole[]) {
  const user = await requireSession();
  if (user.role === "SELLER" && !roles.includes("SELLER")) await rejectSeller();
  if (!hasRole(user.role, roles)) redirect("/admin");
  return user;
}

/** Seller pages and actions: only a SELLER; `salesPersonId` is the only scope their queries may use. */
export async function requireSeller() {
  const user = await requireSession();
  if (user.role !== "SELLER") redirect("/admin");
  return { user, salesPersonId: user.salesPersonId };
}
