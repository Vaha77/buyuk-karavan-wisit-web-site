import "server-only";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import type { AdminRole } from "@/generated/prisma/client";
import { getAdminSession } from "./session";
import { PASSWORD_PAGE, homeFor, isLimitedRole } from "./seller-access";

/** Signed in, and not still on a temporary password (that only opens "Yangi parol o‘rnating"; actions get 403). */
async function requireSession() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (session.user.mustPasswordChange) {
    if ((await headers()).has("next-action")) forbidden();
    redirect(PASSWORD_PAGE);
  }
  return session.user;
}

/** A SELLER / WORKSHOP user outside their section: a page render goes to their home, a server action (Next-Action header) gets 403. */
async function rejectLimited(role: AdminRole): Promise<never> {
  if ((await headers()).has("next-action")) forbidden();
  redirect(homeFor(role));
}

/** Staff of the admin panel (SUPER_ADMIN, ADMIN, MANAGER). SELLER / WORKSHOP are sent to their home (pages) or get 403 (actions). */
export async function requireAdmin() {
  const user = await requireSession();
  if (isLimitedRole(user.role)) await rejectLimited(user.role);
  return user;
}

export function hasRole(role: AdminRole, allowed: readonly AdminRole[]): boolean {
  return allowed.includes(role);
}

export async function requireRole(...roles: AdminRole[]) {
  const user = await requireSession();
  if (isLimitedRole(user.role) && !roles.includes(user.role)) await rejectLimited(user.role);
  if (!hasRole(user.role, roles)) redirect("/admin");
  return user;
}

/** Seller pages and actions: only a SELLER; `salesPersonId` is the only scope their queries may use. */
export async function requireSeller() {
  const user = await requireSession();
  if (user.role !== "SELLER") redirect(homeFor(user.role));
  return { user, salesPersonId: user.salesPersonId };
}

/** Seh zakazlari pages and actions: staff, SELLER and WORKSHOP. What each may see or press is decided per order (lib/sex/rules.ts). */
export async function requireSexUser() {
  return requireSession();
}
