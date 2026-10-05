import "server-only";
import type { AdminUser } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { myDueCustomers } from "@/lib/customers/seller-queries";
import { referralLinksAreNew } from "@/lib/referrals/rules";
import { sexBadgeCount } from "@/lib/sex/queries";

/** Badge counts for the sidebar of whichever role is signed in (each role only queries what its menu shows). */
export async function getShellData(user: AdminUser) {
  const db = getDb();
  if (user.role === "SELLER") {
    const due = user.salesPersonId ? (await myDueCustomers(user).catch(() => [])).length : 0;
    return { dueToday: due };
  }
  if (user.role === "WORKSHOP") return { sexBadge: await sexBadgeCount(user) };
  const canReview = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const [newLeads, pendingPurchases, sexBadge] = await Promise.all([
    db.lead.count({ where: { status: "NEW" } }).catch(() => 0),
    canReview ? db.customerPurchase.count({ where: { status: "PENDING" } }).catch(() => 0) : 0,
    sexBadgeCount(user),
  ]);
  return { newLeads, pendingPurchases, linksBadge: referralLinksAreNew(), sexBadge };
}
